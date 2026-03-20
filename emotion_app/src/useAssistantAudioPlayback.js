import { useCallback, useEffect } from 'react';
import {
  requestRuntimeEvent,
  requestTTSSynthesis,
} from './sessionApi';
import {
  buildMouthCueSequence,
  getAudioPlaybackRetryMessage,
  resolvePlayableTtsAudioUrl,
  sameAudioSource,
} from './appHelpers';

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

  const stopAssistantAudioPlayback = useCallback(() => {
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
  }, [assistantAudioRef, stopAvatarMouthAnimation]);

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
    setTtsAudioUrl(null);
    setTtsAudioFormat('pending');
    setTtsVoiceId('pending');
    setTtsDurationMs(0);
    setTtsGeneratedAt(null);
    setTtsMessageId(typeof replyPayload.message_id === 'string' ? replyPayload.message_id : null);
    setAvatarMouthState('closed');
    avatarMouthCueSequenceRef.current = [];

    try {
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
