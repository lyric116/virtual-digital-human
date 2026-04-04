import { useCallback, useEffect, useRef } from 'react';
import {
  openTTSStream,
  requestRuntimeEvent,
  requestTTSSynthesis,
  requestTTSStreamSynthesis,
} from './sessionApi';
import {
  buildMouthCueSequence,
  getAudioPlaybackRetryMessage,
  resolvePlayableTtsAudioUrl,
  sameAudioSource,
} from './appHelpers';

const STREAM_START_LEAD_SECONDS = 0.05;
const DEFAULT_STREAM_SAMPLE_RATE_HZ = 24000;

function getAudioContextConstructor() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.AudioContext || window.webkitAudioContext || null;
}

function decodeBase64AudioData(base64Value) {
  const normalized = typeof base64Value === 'string' ? base64Value.trim() : '';
  if (!normalized) {
    return new Uint8Array(0);
  }

  const decodeBase64 = typeof window?.atob === 'function'
    ? window.atob.bind(window)
    : null;
  if (!decodeBase64) {
    throw new Error('当前环境不支持 Base64 音频解码。');
  }

  const binaryString = decodeBase64(normalized);
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return bytes;
}

function convertPCM16ToFloat32(bytes) {
  const sampleCount = Math.floor(bytes.byteLength / 2);
  if (!sampleCount) {
    return new Float32Array(0);
  }

  const pcmView = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  const channelData = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    channelData[index] = pcmView.getInt16(index * 2, true) / 0x8000;
  }
  return channelData;
}

function isStreamingTtsUnsupportedError(error) {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const normalized = rawMessage.toLowerCase();
  return (
    normalized.includes('streaming tts model is not configured')
    || normalized.includes('status 404')
    || normalized.includes('status 409')
    || normalized.includes('streaming tts session not found')
  );
}

async function consumeNdjsonStream(response, onEvent) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    throw new Error('当前环境不支持流式语音传输。');
  }

  const TextDecoderConstructor = typeof TextDecoder === 'function'
    ? TextDecoder
    : (typeof window?.TextDecoder === 'function' ? window.TextDecoder : null);
  const decoder = TextDecoderConstructor ? new TextDecoderConstructor() : null;
  const decodeChunk = (value, options) => {
    if (decoder) {
      return decoder.decode(value, options);
    }
    if (!value) {
      return '';
    }
    return Array.from(value)
      .map((byte) => String.fromCharCode(byte))
      .join('');
  };
  let buffer = '';

  const flushBuffer = async (flushAll = false) => {
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        await onEvent(JSON.parse(line));
      }
      newlineIndex = buffer.indexOf('\n');
    }
    if (flushAll && buffer.trim()) {
      await onEvent(JSON.parse(buffer.trim()));
      buffer = '';
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decodeChunk();
        await flushBuffer(true);
        break;
      }
      buffer += decodeChunk(value, { stream: true });
      await flushBuffer(false);
    }
  } finally {
    reader.releaseLock?.();
  }
}

export function useAssistantAudioPlayback({
  activeSessionId,
  activeTraceId,
  assistantAudioRef,
  avatarMouthCueSequenceRef,
  avatarMouthPlaybackStartedAtRef,
  avatarMouthState,
  avatarMouthTimerRef,
  connectionStatusRef,
  currentAvatarEmotion,
  currentAvatarExpressionPreset,
  currentAvatarRiskLevel,
  currentAvatarStageLabel,
  effectiveAvatarId,
  effectiveAvatarProfile,
  runtimeConfig,
  setAvatarMouthState,
  setTtsAudioFormat,
  setTtsAudioUrl,
  setTtsDurationMs,
  setTtsGeneratedAt,
  setTtsMessageId,
  setTtsPlaybackMessage,
  setTtsPlaybackState,
  setTtsVoiceId,
  synthesizeAssistantAudioRef,
  ttsAudioFormat,
  ttsAudioUrl,
  ttsAudioUrlRef,
  ttsDurationMs,
  ttsMessageId,
  ttsMessageIdRef,
  ttsPlaybackState,
  ttsPlaybackStateRef,
  ttsRequestTokenRef,
  ttsVoiceId,
}) {
  const streamAudioContextRef = useRef(null);
  const streamAbortControllerRef = useRef(null);
  const streamPlaybackRef = useRef({
    activeSources: new Set(),
    nextStartTime: 0,
    started: false,
    firstChunkReceived: false,
    completed: false,
    endedLogged: false,
    requestToken: 0,
    cancelled: false,
    completionMetadata: null,
  });
  const ttsStreamingSupportRef = useRef('unknown');

  const clearAvatarMouthTimer = useCallback(() => {
    if (avatarMouthTimerRef.current) {
      window.clearInterval(avatarMouthTimerRef.current);
      avatarMouthTimerRef.current = null;
    }
  }, [avatarMouthTimerRef]);

  const stopAvatarMouthAnimation = useCallback(() => {
    clearAvatarMouthTimer();
    avatarMouthPlaybackStartedAtRef.current = null;
    avatarMouthCueSequenceRef.current = [];
    setAvatarMouthState('closed');
  }, [
    avatarMouthCueSequenceRef,
    avatarMouthPlaybackStartedAtRef,
    clearAvatarMouthTimer,
    setAvatarMouthState,
  ]);

  const updateAvatarMouthFromElapsed = useCallback((elapsedMs) => {
    const cues = avatarMouthCueSequenceRef.current;
    if (!cues.length) {
      setAvatarMouthState('closed');
      return;
    }
    const activeCue = cues.find((cue) => elapsedMs >= cue.startMs && elapsedMs < cue.endMs) || cues[cues.length - 1];
    setAvatarMouthState(activeCue?.mouthState || 'closed');
  }, [avatarMouthCueSequenceRef, setAvatarMouthState]);

  const startAvatarMouthAnimation = useCallback(() => {
    clearAvatarMouthTimer();
    avatarMouthPlaybackStartedAtRef.current = Date.now();
    updateAvatarMouthFromElapsed(0);
    avatarMouthTimerRef.current = window.setInterval(() => {
      const startedAt = avatarMouthPlaybackStartedAtRef.current || Date.now();
      updateAvatarMouthFromElapsed(Math.max(0, Date.now() - startedAt));
    }, 90);
  }, [
    avatarMouthPlaybackStartedAtRef,
    avatarMouthTimerRef,
    clearAvatarMouthTimer,
    updateAvatarMouthFromElapsed,
  ]);

  const logRuntimeEvent = useCallback(async (eventType, payload, messageId) => {
    if (!activeSessionId || connectionStatusRef.current === 'replay') {
      return null;
    }
    try {
      return await requestRuntimeEvent(runtimeConfig.apiBaseUrl, activeSessionId, {
        event_type: eventType,
        message_id: messageId || null,
        payload,
      });
    } catch (error) {
      return null;
    }
  }, [activeSessionId, connectionStatusRef, runtimeConfig.apiBaseUrl]);

  const teardownStreamingPlayback = useCallback(() => {
    const playback = streamPlaybackRef.current;
    playback.cancelled = true;

    const controller = streamAbortControllerRef.current;
    streamAbortControllerRef.current = null;
    if (controller) {
      controller.abort();
    }

    playback.activeSources.forEach((source) => {
      try {
        source.onended = null;
        source.stop();
      } catch (error) {
        // Ignore source teardown races.
      }
      try {
        source.disconnect();
      } catch (error) {
        // Ignore disconnect races.
      }
    });
    playback.activeSources.clear();
    playback.nextStartTime = 0;
    playback.started = false;
    playback.firstChunkReceived = false;
    playback.completed = false;
    playback.endedLogged = false;
    playback.completionMetadata = null;

    const audioContext = streamAudioContextRef.current;
    streamAudioContextRef.current = null;
    if (audioContext && typeof audioContext.close === 'function') {
      void audioContext.close().catch(() => {});
    }
  }, []);

  const replayAssistantAudio = useCallback(async (overrideAudioUrl = null) => {
    const currentAudioUrl = overrideAudioUrl || ttsAudioUrlRef.current || ttsAudioUrl;
    if (!currentAudioUrl || !assistantAudioRef.current || typeof assistantAudioRef.current.play !== 'function') {
      setTtsPlaybackState('error');
      setTtsPlaybackMessage('当前环境不支持语音播放。');
      return false;
    }

    try {
      if (assistantAudioRef.current.src !== currentAudioUrl) {
        assistantAudioRef.current.src = currentAudioUrl;
        if (typeof assistantAudioRef.current.load === 'function') {
          assistantAudioRef.current.load();
        }
      }
      const playResult = assistantAudioRef.current.play();
      if (playResult && typeof playResult.then === 'function') {
        await playResult;
      }
      return true;
    } catch (error) {
      setTtsPlaybackState('ready');
      setTtsPlaybackMessage(getAudioPlaybackRetryMessage(error));
      return false;
    }
  }, [assistantAudioRef, setTtsPlaybackMessage, setTtsPlaybackState, ttsAudioUrl, ttsAudioUrlRef]);

  const finalizeStreamingPlayback = useCallback((requestToken) => {
    const playback = streamPlaybackRef.current;
    if (
      playback.requestToken !== requestToken
      || playback.cancelled
      || playback.endedLogged
      || !playback.completed
      || playback.activeSources.size > 0
    ) {
      return;
    }

    playback.endedLogged = true;
    const completionMetadata = playback.completionMetadata || {};
    const resolvedAudioUrl = typeof completionMetadata.audioUrl === 'string'
      ? completionMetadata.audioUrl
      : ttsAudioUrlRef.current;
    if (resolvedAudioUrl) {
      ttsAudioUrlRef.current = resolvedAudioUrl;
      setTtsAudioUrl(resolvedAudioUrl);
    }
    if (typeof completionMetadata.audioFormat === 'string' && completionMetadata.audioFormat.trim()) {
      setTtsAudioFormat(completionMetadata.audioFormat);
    }
    if (typeof completionMetadata.durationMs === 'number') {
      setTtsDurationMs(completionMetadata.durationMs);
    }
    if (typeof completionMetadata.generatedAt === 'string' && completionMetadata.generatedAt.trim()) {
      setTtsGeneratedAt(completionMetadata.generatedAt);
    }

    setTtsPlaybackState('completed');
    setTtsPlaybackMessage('本轮语音播放完成。');
    stopAvatarMouthAnimation();
    void logRuntimeEvent(
      'tts.playback.ended',
      {
        avatar_id: effectiveAvatarId,
        voice_id: completionMetadata.voiceId || ttsVoiceId,
        duration_ms: completionMetadata.durationMs ?? ttsDurationMs,
        audio_format: completionMetadata.audioFormat || ttsAudioFormat,
      },
      ttsMessageIdRef.current,
    );
    void logRuntimeEvent(
      'avatar.command',
      {
        session_id: activeSessionId,
        trace_id: activeTraceId,
        message_id: ttsMessageIdRef.current,
        avatar_id: effectiveAvatarId,
        audio_url: resolvedAudioUrl,
        tts_voice_id: completionMetadata.voiceId || ttsVoiceId,
        expression: {
          preset_id: currentAvatarExpressionPreset.presetId,
          label: currentAvatarExpressionPreset.label,
          valence: currentAvatarExpressionPreset.valence,
          arousal: currentAvatarExpressionPreset.arousal,
        },
        source_stage: currentAvatarStageLabel,
        source_risk_level: currentAvatarRiskLevel,
        duration_ms: completionMetadata.durationMs ?? ttsDurationMs,
        command: 'idle',
        mouth_state: 'closed',
      },
      ttsMessageIdRef.current,
    );

    const audioContext = streamAudioContextRef.current;
    streamAudioContextRef.current = null;
    if (audioContext && typeof audioContext.close === 'function') {
      void audioContext.close().catch(() => {});
    }
  }, [
    activeSessionId,
    activeTraceId,
    currentAvatarExpressionPreset.arousal,
    currentAvatarExpressionPreset.label,
    currentAvatarExpressionPreset.presetId,
    currentAvatarExpressionPreset.valence,
    currentAvatarRiskLevel,
    currentAvatarStageLabel,
    effectiveAvatarId,
    logRuntimeEvent,
    setTtsAudioFormat,
    setTtsAudioUrl,
    setTtsDurationMs,
    setTtsGeneratedAt,
    setTtsPlaybackMessage,
    setTtsPlaybackState,
    stopAvatarMouthAnimation,
    ttsAudioFormat,
    ttsAudioUrlRef,
    ttsDurationMs,
    ttsMessageIdRef,
    ttsVoiceId,
  ]);

  const scheduleStreamingChunk = useCallback(async ({
    audioBase64,
    sampleRateHz,
    requestToken,
    nextVoiceId,
    nextDurationMs,
    audioFormat,
  }) => {
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) {
      throw new Error('当前环境不支持流式语音播放。');
    }

    const playback = streamPlaybackRef.current;
    if (playback.requestToken !== requestToken || playback.cancelled) {
      return;
    }

    let audioContext = streamAudioContextRef.current;
    if (!audioContext) {
      audioContext = new AudioContextConstructor();
      streamAudioContextRef.current = audioContext;
    }
    if (audioContext.state === 'suspended' && typeof audioContext.resume === 'function') {
      await audioContext.resume();
    }

    const pcmBytes = decodeBase64AudioData(audioBase64);
    const channelData = convertPCM16ToFloat32(pcmBytes);
    if (!channelData.length) {
      return;
    }

    const audioBuffer = audioContext.createBuffer(
      1,
      channelData.length,
      sampleRateHz || DEFAULT_STREAM_SAMPLE_RATE_HZ,
    );
    if (typeof audioBuffer.copyToChannel === 'function') {
      audioBuffer.copyToChannel(channelData, 0);
    } else {
      audioBuffer.getChannelData(0).set(channelData);
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    const startAt = Math.max(
      audioContext.currentTime + STREAM_START_LEAD_SECONDS,
      playback.nextStartTime || (audioContext.currentTime + STREAM_START_LEAD_SECONDS),
    );
    playback.nextStartTime = startAt + audioBuffer.duration;
    playback.activeSources.add(source);
    source.onended = () => {
      playback.activeSources.delete(source);
      try {
        source.disconnect();
      } catch (error) {
        // Ignore disconnect races on stream teardown.
      }
      finalizeStreamingPlayback(requestToken);
    };
    source.start(startAt);

    if (!playback.started) {
      playback.started = true;
      setTtsPlaybackState('playing');
      setTtsPlaybackMessage('数字人语音播放中。');
      startAvatarMouthAnimation();
      void logRuntimeEvent(
        'tts.playback.started',
        {
          avatar_id: effectiveAvatarId,
          voice_id: nextVoiceId,
          duration_ms: nextDurationMs,
          audio_format: audioFormat,
        },
        ttsMessageIdRef.current,
      );
      void logRuntimeEvent(
        'avatar.command',
        {
          session_id: activeSessionId,
          trace_id: activeTraceId,
          message_id: ttsMessageIdRef.current,
          avatar_id: effectiveAvatarId,
          audio_url: ttsAudioUrlRef.current,
          tts_voice_id: nextVoiceId,
          expression: {
            preset_id: currentAvatarExpressionPreset.presetId,
            label: currentAvatarExpressionPreset.label,
            valence: currentAvatarExpressionPreset.valence,
            arousal: currentAvatarExpressionPreset.arousal,
          },
          source_stage: currentAvatarStageLabel,
          source_risk_level: currentAvatarRiskLevel,
          duration_ms: nextDurationMs,
          command: 'speak',
          mouth_state: avatarMouthState,
        },
        ttsMessageIdRef.current,
      );
    }
  }, [
    activeSessionId,
    activeTraceId,
    avatarMouthState,
    currentAvatarExpressionPreset.arousal,
    currentAvatarExpressionPreset.label,
    currentAvatarExpressionPreset.presetId,
    currentAvatarExpressionPreset.valence,
    currentAvatarRiskLevel,
    currentAvatarStageLabel,
    effectiveAvatarId,
    finalizeStreamingPlayback,
    logRuntimeEvent,
    setTtsPlaybackMessage,
    setTtsPlaybackState,
    startAvatarMouthAnimation,
    ttsAudioUrlRef,
    ttsMessageIdRef,
  ]);

  const streamAssistantAudio = useCallback(async (replyPayload, requestToken, replyText) => {
    if (ttsStreamingSupportRef.current === 'unsupported') {
      return false;
    }
    if (!runtimeConfig.autoplayAssistantAudio || !getAudioContextConstructor()) {
      return false;
    }

    const prepared = await requestTTSStreamSynthesis(runtimeConfig.ttsBaseUrl, {
      text: replyText,
      voice_id: effectiveAvatarId,
      session_id: activeSessionId,
      trace_id: replyPayload.trace_id || activeTraceId,
      message_id: replyPayload.message_id,
      subtitle: replyText,
    });
    if (!prepared?.streaming || !prepared?.stream_url) {
      return false;
    }

    ttsStreamingSupportRef.current = 'supported';
    if (requestToken !== ttsRequestTokenRef.current) {
      return true;
    }

    const nextVoiceId = prepared.voice_id || effectiveAvatarProfile.voicePreview;
    const nextAudioFormat = prepared.audio_format || 'wav';
    const nextDurationMs = typeof prepared.duration_ms === 'number' ? prepared.duration_ms : 0;
    const subtitle = prepared.subtitle || replyText;
    const predictedAudioUrl = resolvePlayableTtsAudioUrl(prepared.audio_url, runtimeConfig);
    const nextGeneratedAt = prepared.generated_at || new Date().toISOString();
    avatarMouthCueSequenceRef.current = buildMouthCueSequence(subtitle, nextDurationMs);
    ttsAudioUrlRef.current = predictedAudioUrl;
    setTtsAudioFormat(nextAudioFormat);
    setTtsVoiceId(nextVoiceId);
    setTtsDurationMs(nextDurationMs);
    setTtsGeneratedAt(nextGeneratedAt);
    setTtsPlaybackMessage('正在准备流式语音。');

    const playback = streamPlaybackRef.current;
    playback.activeSources.clear();
    playback.nextStartTime = 0;
    playback.started = false;
    playback.firstChunkReceived = false;
    playback.completed = false;
    playback.endedLogged = false;
    playback.requestToken = requestToken;
    playback.cancelled = false;
    playback.completionMetadata = null;

    const controller = new AbortController();
    streamAbortControllerRef.current = controller;
    const response = await openTTSStream(prepared.stream_url, controller.signal);
    let synthesizedLogged = false;

    await consumeNdjsonStream(response, async (event) => {
      if (requestToken !== ttsRequestTokenRef.current || playback.cancelled) {
        return;
      }

      if (event?.type === 'started') {
        if (typeof event.generated_at === 'string' && event.generated_at.trim()) {
          setTtsGeneratedAt(event.generated_at);
        }
        if (typeof event.audio_url === 'string' && event.audio_url.trim()) {
          ttsAudioUrlRef.current = resolvePlayableTtsAudioUrl(event.audio_url, runtimeConfig);
        }
        return;
      }

      if (event?.type === 'audio_chunk') {
        playback.firstChunkReceived = true;
        if (!synthesizedLogged) {
          synthesizedLogged = true;
          await logRuntimeEvent(
            'tts.synthesized',
            {
              tts_id: prepared.tts_id || null,
              voice_id: nextVoiceId,
              audio_format: nextAudioFormat,
              duration_ms: nextDurationMs || null,
              provider_used: prepared.provider_used || 'qwen_tts_stream',
              audio_url: ttsAudioUrlRef.current,
              generated_at: nextGeneratedAt,
              avatar_id: effectiveAvatarId,
              stage: currentAvatarStageLabel,
              risk_level: currentAvatarRiskLevel,
              emotion: currentAvatarEmotion,
            },
            replyPayload.message_id,
          );
        }
        await scheduleStreamingChunk({
          audioBase64: event.data,
          sampleRateHz: typeof event.sample_rate_hz === 'number'
            ? event.sample_rate_hz
            : (prepared.stream_sample_rate_hz || DEFAULT_STREAM_SAMPLE_RATE_HZ),
          requestToken,
          nextVoiceId,
          nextDurationMs,
          audioFormat: nextAudioFormat,
        });
        return;
      }

      if (event?.type === 'completed') {
        playback.completed = true;
        playback.completionMetadata = {
          audioUrl: resolvePlayableTtsAudioUrl(event.audio_url || prepared.audio_url, runtimeConfig),
          audioFormat: event.audio_format || nextAudioFormat,
          durationMs: typeof event.duration_ms === 'number' ? event.duration_ms : nextDurationMs,
          generatedAt: event.generated_at || nextGeneratedAt,
          voiceId: nextVoiceId,
        };
        finalizeStreamingPlayback(requestToken);
        return;
      }

      if (event?.type === 'error') {
        throw new Error(
          typeof event.detail === 'string' && event.detail.trim()
            ? event.detail
            : '流式语音合成失败。',
        );
      }
    });

    if (requestToken !== ttsRequestTokenRef.current || playback.cancelled) {
      return true;
    }
    if (!playback.firstChunkReceived) {
      throw new Error('流式语音没有返回可播放音频。');
    }
    if (!playback.completed) {
      playback.completed = true;
      playback.completionMetadata = {
        audioUrl: predictedAudioUrl,
        audioFormat: nextAudioFormat,
        durationMs: nextDurationMs,
        generatedAt: nextGeneratedAt,
        voiceId: nextVoiceId,
      };
      finalizeStreamingPlayback(requestToken);
    }
    return true;
  }, [
    activeSessionId,
    activeTraceId,
    avatarMouthCueSequenceRef,
    currentAvatarEmotion,
    currentAvatarRiskLevel,
    currentAvatarStageLabel,
    effectiveAvatarId,
    effectiveAvatarProfile.voicePreview,
    finalizeStreamingPlayback,
    logRuntimeEvent,
    runtimeConfig,
    scheduleStreamingChunk,
    setTtsAudioFormat,
    setTtsDurationMs,
    setTtsGeneratedAt,
    setTtsPlaybackMessage,
    setTtsVoiceId,
    ttsAudioUrlRef,
    ttsRequestTokenRef,
  ]);

  const stopAssistantAudioPlayback = useCallback(() => {
    teardownStreamingPlayback();
    stopAvatarMouthAnimation();
    const audioElement = assistantAudioRef.current;
    if (!audioElement) {
      return;
    }
    try {
      if (typeof audioElement.pause === 'function') {
        audioElement.pause();
      }
    } catch (error) {
      // Ignore teardown races.
    }
    if ('currentTime' in audioElement) {
      try {
        audioElement.currentTime = 0;
      } catch (error) {
        // Ignore currentTime reset races.
      }
    }
  }, [assistantAudioRef, stopAvatarMouthAnimation, teardownStreamingPlayback]);

  const synthesizeAssistantAudio = useCallback(async (replyPayload) => {
    const replyText = typeof replyPayload?.reply === 'string' ? replyPayload.reply.trim() : '';
    if (!replyText || !activeSessionId) {
      return;
    }

    const requestToken = ttsRequestTokenRef.current + 1;
    ttsRequestTokenRef.current = requestToken;
    stopAssistantAudioPlayback();
    setTtsPlaybackState('synthesizing');
    setTtsPlaybackMessage('正在合成语音。');
    ttsAudioUrlRef.current = null;
    setTtsAudioUrl(null);
    setTtsAudioFormat('pending');
    setTtsVoiceId('pending');
    setTtsDurationMs(0);
    setTtsGeneratedAt(null);
    setTtsMessageId(typeof replyPayload.message_id === 'string' ? replyPayload.message_id : null);
    setAvatarMouthState('closed');
    avatarMouthCueSequenceRef.current = [];

    try {
      try {
        const streamed = await streamAssistantAudio(replyPayload, requestToken, replyText);
        if (streamed) {
          return;
        }
      } catch (streamError) {
        if (requestToken !== ttsRequestTokenRef.current) {
          return;
        }
        if (streamPlaybackRef.current.firstChunkReceived) {
          setTtsPlaybackState('error');
          setTtsPlaybackMessage(
            streamError instanceof Error ? streamError.message : String(streamError),
          );
          teardownStreamingPlayback();
          return;
        }
        if (isStreamingTtsUnsupportedError(streamError)) {
          ttsStreamingSupportRef.current = 'unsupported';
        }
        teardownStreamingPlayback();
      }

      const payload = await requestTTSSynthesis(runtimeConfig.ttsBaseUrl, {
        text: replyText,
        voice_id: effectiveAvatarId,
        session_id: activeSessionId,
        trace_id: replyPayload.trace_id || activeTraceId,
        message_id: replyPayload.message_id,
        subtitle: replyText,
      });

      if (requestToken !== ttsRequestTokenRef.current) {
        return;
      }

      const normalizedAudioUrl = resolvePlayableTtsAudioUrl(payload.audio_url, runtimeConfig);
      const nextDurationMs = typeof payload.duration_ms === 'number' ? payload.duration_ms : 0;
      const nextVoiceId = payload.voice_id || effectiveAvatarProfile.voicePreview;
      const subtitle = payload.subtitle || replyText;
      avatarMouthCueSequenceRef.current = buildMouthCueSequence(subtitle, nextDurationMs);
      ttsAudioUrlRef.current = normalizedAudioUrl;
      setTtsAudioUrl(normalizedAudioUrl);
      setTtsAudioFormat(payload.audio_format || 'pending');
      setTtsVoiceId(nextVoiceId);
      setTtsDurationMs(nextDurationMs);
      setTtsGeneratedAt(payload.generated_at || new Date().toISOString());
      setTtsPlaybackState('ready');
      setTtsPlaybackMessage('语音已生成，准备播放。');
      await logRuntimeEvent(
        'tts.synthesized',
        {
          tts_id: payload.tts_id || null,
          voice_id: payload.voice_id || null,
          audio_format: payload.audio_format || null,
          duration_ms: nextDurationMs || null,
          provider_used: payload.provider_used || null,
          audio_url: normalizedAudioUrl,
          generated_at: payload.generated_at || null,
          avatar_id: effectiveAvatarId,
          stage: currentAvatarStageLabel,
          risk_level: currentAvatarRiskLevel,
          emotion: currentAvatarEmotion,
        },
        replyPayload.message_id,
      );

      if (normalizedAudioUrl && runtimeConfig.autoplayAssistantAudio) {
        if (assistantAudioRef.current && typeof assistantAudioRef.current.load === 'function') {
          assistantAudioRef.current.src = normalizedAudioUrl;
          assistantAudioRef.current.load();
        }
        await replayAssistantAudio(normalizedAudioUrl);
      }
    } catch (error) {
      if (requestToken !== ttsRequestTokenRef.current) {
        return;
      }
      setTtsPlaybackState('error');
      setTtsPlaybackMessage(error instanceof Error ? error.message : String(error));
    }
  }, [
    activeSessionId,
    activeTraceId,
    assistantAudioRef,
    avatarMouthCueSequenceRef,
    currentAvatarEmotion,
    currentAvatarRiskLevel,
    currentAvatarStageLabel,
    effectiveAvatarId,
    effectiveAvatarProfile.voicePreview,
    logRuntimeEvent,
    replayAssistantAudio,
    runtimeConfig,
    setAvatarMouthState,
    setTtsAudioFormat,
    setTtsAudioUrl,
    setTtsDurationMs,
    setTtsGeneratedAt,
    setTtsMessageId,
    setTtsPlaybackMessage,
    setTtsPlaybackState,
    setTtsVoiceId,
    stopAssistantAudioPlayback,
    streamAssistantAudio,
    teardownStreamingPlayback,
    ttsAudioUrlRef,
    ttsRequestTokenRef,
  ]);

  useEffect(() => {
    ttsPlaybackStateRef.current = ttsPlaybackState;
  }, [ttsPlaybackState, ttsPlaybackStateRef]);

  useEffect(() => {
    ttsMessageIdRef.current = ttsMessageId;
  }, [ttsMessageId, ttsMessageIdRef]);

  useEffect(() => {
    ttsAudioUrlRef.current = ttsAudioUrl;
  }, [ttsAudioUrl, ttsAudioUrlRef]);

  useEffect(() => {
    synthesizeAssistantAudioRef.current = synthesizeAssistantAudio;
  }, [synthesizeAssistantAudio, synthesizeAssistantAudioRef]);

  useEffect(() => {
    const audioElement = assistantAudioRef.current;
    if (!audioElement) {
      return undefined;
    }

    const handlePlay = () => {
      setTtsPlaybackState('playing');
      setTtsPlaybackMessage('数字人语音播放中。');
      startAvatarMouthAnimation();
      void logRuntimeEvent(
        'tts.playback.started',
        {
          avatar_id: effectiveAvatarId,
          voice_id: ttsVoiceId,
          duration_ms: ttsDurationMs,
          audio_format: ttsAudioFormat,
        },
        ttsMessageIdRef.current,
      );
      void logRuntimeEvent(
        'avatar.command',
        {
          session_id: activeSessionId,
          trace_id: activeTraceId,
          message_id: ttsMessageIdRef.current,
          avatar_id: effectiveAvatarId,
          audio_url: ttsAudioUrlRef.current,
          tts_voice_id: ttsVoiceId,
          expression: {
            preset_id: currentAvatarExpressionPreset.presetId,
            label: currentAvatarExpressionPreset.label,
            valence: currentAvatarExpressionPreset.valence,
            arousal: currentAvatarExpressionPreset.arousal,
          },
          source_stage: currentAvatarStageLabel,
          source_risk_level: currentAvatarRiskLevel,
          duration_ms: ttsDurationMs,
          command: 'speak',
          mouth_state: avatarMouthState,
        },
        ttsMessageIdRef.current,
      );
    };

    const handleEnded = () => {
      setTtsPlaybackState('completed');
      setTtsPlaybackMessage('本轮语音播放完成。');
      stopAvatarMouthAnimation();
      void logRuntimeEvent(
        'tts.playback.ended',
        {
          avatar_id: effectiveAvatarId,
          voice_id: ttsVoiceId,
          duration_ms: ttsDurationMs,
          audio_format: ttsAudioFormat,
        },
        ttsMessageIdRef.current,
      );
      void logRuntimeEvent(
        'avatar.command',
        {
          session_id: activeSessionId,
          trace_id: activeTraceId,
          message_id: ttsMessageIdRef.current,
          avatar_id: effectiveAvatarId,
          audio_url: ttsAudioUrlRef.current,
          tts_voice_id: ttsVoiceId,
          expression: {
            preset_id: currentAvatarExpressionPreset.presetId,
            label: currentAvatarExpressionPreset.label,
            valence: currentAvatarExpressionPreset.valence,
            arousal: currentAvatarExpressionPreset.arousal,
          },
          source_stage: currentAvatarStageLabel,
          source_risk_level: currentAvatarRiskLevel,
          duration_ms: ttsDurationMs,
          command: 'idle',
          mouth_state: 'closed',
        },
        ttsMessageIdRef.current,
      );
    };

    const handlePause = () => {
      if (ttsPlaybackStateRef.current === 'playing') {
        stopAvatarMouthAnimation();
      }
    };

    const handleError = () => {
      const activeSource = audioElement.currentSrc || audioElement.src || '';
      if (!ttsAudioUrlRef.current) {
        return;
      }
      if (ttsPlaybackStateRef.current === 'completed' || ttsPlaybackStateRef.current === 'idle') {
        return;
      }
      if (activeSource && !sameAudioSource(activeSource, ttsAudioUrlRef.current)) {
        return;
      }
      setTtsPlaybackState('ready');
      setTtsPlaybackMessage('语音资源已生成，但浏览器未能加载音频资源，可点击重播语音重试。');
      stopAvatarMouthAnimation();
    };

    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('ended', handleEnded);
    audioElement.addEventListener('pause', handlePause);
    audioElement.addEventListener('error', handleError);
    return () => {
      audioElement.removeEventListener('play', handlePlay);
      audioElement.removeEventListener('ended', handleEnded);
      audioElement.removeEventListener('pause', handlePause);
      audioElement.removeEventListener('error', handleError);
    };
  }, [
    activeSessionId,
    activeTraceId,
    assistantAudioRef,
    avatarMouthState,
    currentAvatarExpressionPreset.arousal,
    currentAvatarExpressionPreset.label,
    currentAvatarExpressionPreset.presetId,
    currentAvatarExpressionPreset.valence,
    currentAvatarRiskLevel,
    currentAvatarStageLabel,
    effectiveAvatarId,
    logRuntimeEvent,
    setTtsPlaybackMessage,
    setTtsPlaybackState,
    startAvatarMouthAnimation,
    stopAvatarMouthAnimation,
    ttsAudioFormat,
    ttsAudioUrlRef,
    ttsDurationMs,
    ttsMessageIdRef,
    ttsPlaybackStateRef,
    ttsVoiceId,
  ]);

  return {
    replayAssistantAudio,
    stopAssistantAudioPlayback,
    stopAvatarMouthAnimation,
  };
}
