import { useCallback, useEffect, useRef } from 'react';
import {
  requestAsrStreamPreview,
  requestAsrStreamRelease,
  requestAudioChunkUpload,
  requestAudioFinalize,
  requestAudioPreview,
} from './sessionApi';
import {
  createInitialFinalTranscriptState,
  createInitialPartialTranscriptState,
  createRecordingId,
} from './appHelpers';

export function useAudioRecording({
  activeSessionId,
  audioUploadState,
  audioUploadStateRef,
  connectionStatusRef,
  completedRecordingIdRef,
  currentRecordingIdRef,
  finalizingAudioRef,
  lastPreviewChunkCountRef,
  mediaRecorderRef,
  micStreamRef,
  nextAudioChunkSeqRef,
  nextPreviewSeqRef,
  pendingAudioUploadsRef,
  previewInFlightRef,
  recordedAudioPartsRef,
  recordingChunkCount,
  recordingChunkCountRef,
  recordingDurationMs,
  recordingDurationMsRef,
  recordingStartedAtMsRef,
  recordingState,
  recordingStateRef,
  recordingTimerRef,
  runtimeConfig,
  setAudioUploadMessage,
  setAudioUploadState,
  setDialogueReplyState,
  setFinalTranscriptState,
  setLastUploadedAt,
  setLastUploadedMediaId,
  setMicPermissionMessage,
  setMicPermissionState,
  setPartialTranscriptState,
  setRecordingChunkCount,
  setRecordingDurationMs,
  setRecordingState,
  stopRequestedRef,
}) {
  const isTestingRef = useRef(false);

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, [recordingTimerRef]);

  const teardownMicrophone = useCallback(() => {
    clearRecordingTimer();
    stopRequestedRef.current = true;
    pendingAudioUploadsRef.current = 0;
    recordedAudioPartsRef.current = [];
    previewInFlightRef.current = false;
    finalizingAudioRef.current = false;
    lastPreviewChunkCountRef.current = 0;
    nextPreviewSeqRef.current = 1;
    nextAudioChunkSeqRef.current = 1;
    currentRecordingIdRef.current = null;
    completedRecordingIdRef.current = null;
    recordingStartedAtMsRef.current = null;
    recordingDurationMsRef.current = 0;
    recordingChunkCountRef.current = 0;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        // Ignore stop races during teardown.
      }
    }
    mediaRecorderRef.current = null;

    const stream = micStreamRef.current;
    micStreamRef.current = null;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => {
        if (track && typeof track.stop === 'function') {
          track.stop();
        }
      });
    }

    setMicPermissionState('idle');
    setMicPermissionMessage('');
    setRecordingState('idle');
    setAudioUploadState('idle');
    setAudioUploadMessage('');
    setRecordingDurationMs(0);
    setRecordingChunkCount(0);
    setLastUploadedAt(null);
    setLastUploadedMediaId(null);
  }, [
    clearRecordingTimer,
    completedRecordingIdRef,
    currentRecordingIdRef,
    finalizingAudioRef,
    lastPreviewChunkCountRef,
    mediaRecorderRef,
    micStreamRef,
    nextAudioChunkSeqRef,
    nextPreviewSeqRef,
    pendingAudioUploadsRef,
    previewInFlightRef,
    recordedAudioPartsRef,
    recordingChunkCountRef,
    recordingDurationMsRef,
    recordingStartedAtMsRef,
    setAudioUploadMessage,
    setAudioUploadState,
    setLastUploadedAt,
    setLastUploadedMediaId,
    setMicPermissionMessage,
    setMicPermissionState,
    setRecordingChunkCount,
    setRecordingDurationMs,
    setRecordingState,
    stopRequestedRef,
  ]);

  const waitForPendingAudioUploads = useCallback(async () => {
    while (pendingAudioUploadsRef.current > 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 20);
      });
    }
  }, [pendingAudioUploadsRef]);

  const waitForPendingAudioPreview = useCallback(async () => {
    while (previewInFlightRef.current) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 20);
      });
    }
  }, [previewInFlightRef]);

  const requestMicrophoneAccess = useCallback(async () => {
    if (recordingState === 'recording') {
      return true;
    }

    if (
      !navigator?.mediaDevices
      || typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setMicPermissionState('unsupported');
      setMicPermissionMessage('Current browser does not support microphone capture.');
      setRecordingState('error');
      return false;
    }

    setMicPermissionState('requesting');
    setMicPermissionMessage('Requesting microphone access.');

    try {
      if (micStreamRef.current) {
        setMicPermissionState('granted');
        setMicPermissionMessage('Microphone access granted.');
        return true;
      }

      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      setMicPermissionState('granted');
      setMicPermissionMessage('Microphone access granted.');
      return true;
    } catch (error) {
      const errorName = error && typeof error === 'object' ? error.name : '';
      setRecordingState('error');
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        setMicPermissionState('denied');
        setMicPermissionMessage('Microphone permission was denied.');
      } else {
        setMicPermissionState('error');
        setMicPermissionMessage(error instanceof Error ? error.message : String(error));
      }
      return false;
    }
  }, [micStreamRef, recordingState, setMicPermissionMessage, setMicPermissionState, setRecordingState]);

  const maybeSendAudioPreview = useCallback(async (options = {}) => {
    const isTesting = isTestingRef.current;
    const allowStopped = options.allowStopped === true;
    if (!isTesting && !runtimeConfig.enableAudioPreview) {
      return;
    }
    if (!isTesting && (!activeSessionId || recordingStateRef.current !== 'recording')) {
      return;
    }
    if (isTesting && recordingStateRef.current !== 'recording' && !allowStopped) {
      return;
    }
    if (finalizingAudioRef.current || previewInFlightRef.current) {
      return;
    }
    if (recordedAudioPartsRef.current.length < runtimeConfig.audioPreviewChunkThreshold) {
      return;
    }
    if (recordedAudioPartsRef.current.length === lastPreviewChunkCountRef.current) {
      return;
    }
    const BlobCtor = window?.Blob || Blob;
    if (typeof BlobCtor !== 'function') {
      return;
    }

    const previewParts = recordedAudioPartsRef.current.slice(lastPreviewChunkCountRef.current);
    const previewBlob = new BlobCtor(previewParts, {
      type: previewParts[previewParts.length - 1]?.type || 'application/octet-stream',
    });
    const nextPreviewChunkCount = recordedAudioPartsRef.current.length;
    const previewSeq = nextPreviewSeqRef.current;
    nextPreviewSeqRef.current += 1;
    previewInFlightRef.current = true;

    try {
      if (isTesting) {
        const previewPayload = await requestAsrStreamPreview(runtimeConfig.asrBaseUrl, {
          blob: previewBlob,
          filename: `mic-debug-${currentRecordingIdRef.current || 'recording'}.webm`,
          previewSeq,
          recordingId: currentRecordingIdRef.current,
          sessionId: 'mic_debug',
        });
        const transcriptText = typeof previewPayload?.transcript_text === 'string'
          ? previewPayload.transcript_text.trim()
          : '';
        const generatedAt = previewPayload?.generated_at || new Date().toISOString();
        setPartialTranscriptState({
          status: transcriptText ? 'streaming' : 'idle',
          text: transcriptText,
          previewSeq,
          recordingId: currentRecordingIdRef.current,
          updatedAt: generatedAt,
          language: typeof previewPayload?.transcript_language === 'string' ? previewPayload.transcript_language : null,
          confidence: typeof previewPayload?.confidence_mean === 'number' ? previewPayload.confidence_mean : null,
        });
        setFinalTranscriptState({
          text: transcriptText,
          messageId: null,
          sourceKind: 'test_audio',
          recordingId: currentRecordingIdRef.current,
          updatedAt: generatedAt,
          language: typeof previewPayload?.transcript_language === 'string' ? previewPayload.transcript_language : null,
          confidence: typeof previewPayload?.confidence_mean === 'number' ? previewPayload.confidence_mean : null,
        });
      } else {
        await requestAudioPreview(runtimeConfig.apiBaseUrl, activeSessionId, {
          blob: previewBlob,
          durationMs: Math.max(0, Math.round(recordingDurationMsRef.current)),
          previewSeq,
          recordingId: currentRecordingIdRef.current,
        });
      }
      lastPreviewChunkCountRef.current = nextPreviewChunkCount;
    } catch (error) {
      setPartialTranscriptState((previousState) => ({
        ...previousState,
        status: 'error',
        text: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      }));
    } finally {
      previewInFlightRef.current = false;
      if (
        recordingStateRef.current === 'recording'
        && recordedAudioPartsRef.current.length > lastPreviewChunkCountRef.current
      ) {
        void maybeSendAudioPreview();
      }
    }
  }, [
    activeSessionId,
    currentRecordingIdRef,
    finalizingAudioRef,
    lastPreviewChunkCountRef,
    nextPreviewSeqRef,
    previewInFlightRef,
    recordedAudioPartsRef,
    recordingDurationMsRef,
    recordingStateRef,
    runtimeConfig.apiBaseUrl,
    runtimeConfig.asrBaseUrl,
    runtimeConfig.audioPreviewChunkThreshold,
    runtimeConfig.enableAudioPreview,
    setFinalTranscriptState,
    setPartialTranscriptState,
  ]);

  const uploadAudioChunk = useCallback(async (blob, options) => {
    if (isTestingRef.current) {
      return null;
    }
    if (!activeSessionId) {
      setAudioUploadState('error');
      setAudioUploadMessage('Create a session before starting audio recording.');
      return null;
    }

    pendingAudioUploadsRef.current += 1;
    setAudioUploadState('uploading');
    setAudioUploadMessage(`Uploading audio chunk ${options.chunkSeq}.`);

    try {
      const payload = await requestAudioChunkUpload(runtimeConfig.apiBaseUrl, activeSessionId, {
        blob,
        chunkSeq: options.chunkSeq,
        chunkStartedAtMs: options.chunkStartedAtMs,
        durationMs: options.durationMs,
        isFinal: options.isFinal,
      });
      setLastUploadedMediaId(payload?.media_id || null);
      setLastUploadedAt(payload?.created_at || new Date().toISOString());
      return payload;
    } catch (error) {
      setAudioUploadState('error');
      setAudioUploadMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      pendingAudioUploadsRef.current = Math.max(0, pendingAudioUploadsRef.current - 1);
      if (
        pendingAudioUploadsRef.current === 0
        && !finalizingAudioRef.current
        && recordingStateRef.current !== 'recording'
        && audioUploadStateRef.current !== 'error'
      ) {
        setAudioUploadState('completed');
        setAudioUploadMessage(`Uploaded ${recordingChunkCountRef.current} audio chunks.`);
      }
    }
  }, [
    activeSessionId,
    audioUploadStateRef,
    finalizingAudioRef,
    pendingAudioUploadsRef,
    recordingChunkCountRef,
    recordingStateRef,
    runtimeConfig.apiBaseUrl,
    setAudioUploadMessage,
    setAudioUploadState,
    setLastUploadedAt,
    setLastUploadedMediaId,
  ]);

  const finalizeRecordedAudio = useCallback(async () => {
    if (finalizingAudioRef.current) {
      return;
    }
    if (!recordedAudioPartsRef.current.length) {
      return;
    }

    const BlobCtor = window?.Blob || Blob;
    if (typeof BlobCtor !== 'function') {
      setAudioUploadState('error');
      setAudioUploadMessage('Current browser does not support Blob.');
      return;
    }

    const finalBlob = new BlobCtor(recordedAudioPartsRef.current, {
      type: recordedAudioPartsRef.current[recordedAudioPartsRef.current.length - 1]?.type || 'application/octet-stream',
    });

    finalizingAudioRef.current = true;
    setDialogueReplyState('idle');

    try {
      await waitForPendingAudioUploads();
      await waitForPendingAudioPreview();

      if (isTestingRef.current) {
        const currentRecordingId = currentRecordingIdRef.current;
        const currentTranscriptState = recordingStateRef.current === 'recording'
          ? 'streaming'
          : 'completed';

        if (recordedAudioPartsRef.current.length > lastPreviewChunkCountRef.current) {
          await maybeSendAudioPreview({ allowStopped: true });
        }

        setAudioUploadState('completed');
        setAudioUploadMessage('Microphone debug finished locally.');
        setPartialTranscriptState((previousState) => ({
          ...previousState,
          status: currentTranscriptState,
          recordingId: currentRecordingId,
          updatedAt: new Date().toISOString(),
        }));
        if (currentRecordingId) {
          try {
            await requestAsrStreamRelease(runtimeConfig.asrBaseUrl, {
              recordingId: currentRecordingId,
              sessionId: 'mic_debug',
            });
          } catch (error) {
            setPartialTranscriptState((previousState) => ({
              ...previousState,
              status: 'error',
              text: error instanceof Error ? error.message : String(error),
              updatedAt: new Date().toISOString(),
            }));
            setAudioUploadState('error');
            setAudioUploadMessage(error instanceof Error ? error.message : String(error));
          }
        }
        return;
      }

      if (!runtimeConfig.enableAudioFinalize) {
        return;
      }
      if (!activeSessionId) {
        return;
      }

      setAudioUploadState('processing_final');
      setAudioUploadMessage('Submitting final audio and waiting for ASR result.');
      await requestAudioFinalize(runtimeConfig.apiBaseUrl, activeSessionId, {
        blob: finalBlob,
        durationMs: Math.max(0, Math.round(recordingDurationMsRef.current)),
        recordingId: currentRecordingIdRef.current,
      });
      setAudioUploadState('awaiting_realtime');
      setAudioUploadMessage('Final audio submitted, waiting for realtime message.accepted.');
    } catch (error) {
      setAudioUploadState('error');
      setAudioUploadMessage(error instanceof Error ? error.message : String(error));
    } finally {
      finalizingAudioRef.current = false;
    }
  }, [
    activeSessionId,
    currentRecordingIdRef,
    finalizingAudioRef,
    lastPreviewChunkCountRef,
    maybeSendAudioPreview,
    recordedAudioPartsRef,
    recordingDurationMsRef,
    recordingStateRef,
    runtimeConfig.apiBaseUrl,
    runtimeConfig.asrBaseUrl,
    runtimeConfig.enableAudioFinalize,
    setAudioUploadMessage,
    setAudioUploadState,
    setDialogueReplyState,
    setPartialTranscriptState,
    waitForPendingAudioPreview,
    waitForPendingAudioUploads,
  ]);

  const startRecording = useCallback(async (options = {}) => {
    if (recordingState === 'recording') {
      return;
    }

    const isTesting = options.mode === 'test';
    isTestingRef.current = isTesting;

    if (!isTesting) {
      if (!activeSessionId) {
        setRecordingState('error');
        setAudioUploadState('error');
        setAudioUploadMessage('Create a session before recording.');
        return;
      }
      if (connectionStatusRef.current !== 'connected') {
        setRecordingState('error');
        setAudioUploadState('error');
        setAudioUploadMessage('Realtime connection must be ready before recording.');
        return;
      }
    }

    const granted = await requestMicrophoneAccess();
    if (!granted || !micStreamRef.current) {
      return;
    }

    const MediaRecorderCtor = window?.MediaRecorder;
    if (typeof MediaRecorderCtor !== 'function') {
      setMicPermissionState('unsupported');
      setMicPermissionMessage('Current browser does not support MediaRecorder.');
      setRecordingState('error');
      return;
    }

    clearRecordingTimer();
    stopRequestedRef.current = false;
    pendingAudioUploadsRef.current = 0;
    recordedAudioPartsRef.current = [];
    finalizingAudioRef.current = false;
    previewInFlightRef.current = false;
    lastPreviewChunkCountRef.current = 0;
    nextPreviewSeqRef.current = 1;
    nextAudioChunkSeqRef.current = 1;
    currentRecordingIdRef.current = createRecordingId();
    recordingStartedAtMsRef.current = Date.now();

    setRecordingState('recording');
    setRecordingDurationMs(0);
    setRecordingChunkCount(0);
    setAudioUploadState(isTesting ? 'testing' : 'uploading');
    setAudioUploadMessage(isTesting ? 'Microphone test started.' : 'Recording started, waiting for audio chunk uploads.');
    setLastUploadedAt(null);
    setLastUploadedMediaId(null);
    setPartialTranscriptState(createInitialPartialTranscriptState());
    setFinalTranscriptState(createInitialFinalTranscriptState());

    const recorder = new MediaRecorderCtor(micStreamRef.current);
    mediaRecorderRef.current = recorder;
    recorder.addEventListener('dataavailable', (event) => {
      if (!event?.data || (typeof event.data.size === 'number' && event.data.size <= 0)) {
        return;
      }

      recordedAudioPartsRef.current.push(event.data);
      setRecordingChunkCount((previous) => previous + 1);
      const chunkSeq = nextAudioChunkSeqRef.current;
      nextAudioChunkSeqRef.current += 1;
      const isFinal = stopRequestedRef.current && recorder.state !== 'recording';
      void uploadAudioChunk(event.data, {
        chunkSeq,
        chunkStartedAtMs: (chunkSeq - 1) * 250,
        durationMs: 250,
        isFinal,
      });
      void maybeSendAudioPreview();
    });
    recorder.addEventListener('stop', () => {
      clearRecordingTimer();
      mediaRecorderRef.current = null;
      setRecordingState('stopped');
      if (runtimeConfig.enableAudioFinalize) {
        void finalizeRecordedAudio();
      }
    });
    recorder.addEventListener('error', (event) => {
      clearRecordingTimer();
      mediaRecorderRef.current = null;
      setRecordingState('error');
      setMicPermissionMessage(event?.error?.message || 'Recording failed.');
      setAudioUploadState('error');
      setAudioUploadMessage(event?.error?.message || 'Recording failed.');
    });

    recorder.start(250);
    recordingTimerRef.current = window.setInterval(() => {
      if (!recordingStartedAtMsRef.current) {
        return;
      }
      setRecordingDurationMs(Math.max(0, Date.now() - recordingStartedAtMsRef.current));
    }, 100);
  }, [
    activeSessionId,
    clearRecordingTimer,
    connectionStatusRef,
    currentRecordingIdRef,
    finalizingAudioRef,
    lastPreviewChunkCountRef,
    mediaRecorderRef,
    micStreamRef,
    maybeSendAudioPreview,
    nextAudioChunkSeqRef,
    nextPreviewSeqRef,
    pendingAudioUploadsRef,
    previewInFlightRef,
    recordedAudioPartsRef,
    recordingStartedAtMsRef,
    recordingState,
    recordingTimerRef,
    requestMicrophoneAccess,
    runtimeConfig.enableAudioFinalize,
    setAudioUploadMessage,
    setAudioUploadState,
    setFinalTranscriptState,
    setLastUploadedAt,
    setLastUploadedMediaId,
    setMicPermissionMessage,
    setMicPermissionState,
    setPartialTranscriptState,
    setRecordingChunkCount,
    setRecordingDurationMs,
    setRecordingState,
    stopRequestedRef,
    uploadAudioChunk,
    finalizeRecordedAudio,
  ]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
      return;
    }
    try {
      stopRequestedRef.current = true;
      mediaRecorderRef.current.stop();
    } catch (error) {
      clearRecordingTimer();
      mediaRecorderRef.current = null;
      setRecordingState('error');
      setMicPermissionMessage(error instanceof Error ? error.message : String(error));
      setAudioUploadState('error');
      setAudioUploadMessage(error instanceof Error ? error.message : String(error));
    }
  }, [
    clearRecordingTimer,
    mediaRecorderRef,
    setAudioUploadMessage,
    setAudioUploadState,
    setMicPermissionMessage,
    setRecordingState,
    stopRequestedRef,
  ]);

  const handleMicAction = useCallback(async () => {
    if (recordingState === 'recording') {
      isTestingRef.current = false;
      stopRecording();
      return;
    }
    isTestingRef.current = false;
    await startRecording();
  }, [recordingState, startRecording, stopRecording]);

  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState, recordingStateRef]);

  useEffect(() => {
    audioUploadStateRef.current = audioUploadState;
  }, [audioUploadState, audioUploadStateRef]);

  useEffect(() => {
    recordingDurationMsRef.current = recordingDurationMs;
  }, [recordingDurationMs, recordingDurationMsRef]);

  useEffect(() => {
    recordingChunkCountRef.current = recordingChunkCount;
  }, [recordingChunkCount, recordingChunkCountRef]);

  const handleMicTestAction = useCallback(async () => {
    if (recordingState === 'recording') {
      stopRecording();
      return;
    }
    await startRecording({ mode: 'test' });
  }, [recordingState, startRecording, stopRecording]);

  return {
    handleMicAction,
    handleMicTestAction,
    startRecording,
    stopRecording,
    teardownMicrophone,
  };
}
