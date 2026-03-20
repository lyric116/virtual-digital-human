import { useCallback, useEffect } from 'react';
import { requestAffectAnalysis, requestVideoFrameUpload } from './sessionApi';
import { normalizeAffectPayload } from './appHelpers';

export function useCameraAffect({
  activeSessionId,
  activeTraceId,
  affectRequestTokenRef,
  affectRefreshTimerRef,
  affectSnapshot,
  affectSnapshotTimestampRef,
  audioUploadState,
  cameraCanvasRef,
  cameraFrameTimerRef,
  cameraModalAutoStartRef,
  cameraPermissionState,
  cameraState,
  cameraStateRef,
  cameraStreamRef,
  finalTranscriptState,
  inputText,
  isCameraModalOpen,
  mainVideoRef,
  modalVideoRef,
  nextVideoFrameSeq,
  nextVideoFrameSeqRef,
  pendingSessionAffectReasonRef,
  pendingVideoUploadsRef,
  recordingChunkCount,
  recordingState,
  runtimeConfig,
  sessionStateRef,
  setAffectHistory,
  setAffectSnapshot,
  setCameraPermissionMessage,
  setCameraPermissionState,
  setCameraPreviewMessage,
  setCameraState,
  setLastUploadedVideoFrameId,
  setLastVideoUploadedAt,
  setNextVideoFrameSeq,
  setUploadedVideoFrameCount,
  setVideoUploadMessage,
  setVideoUploadState,
  uploadedVideoFrameCount,
  uploadedVideoFrameCountRef,
  videoUploadState,
  videoUploadStateRef,
}) {
  const clearCameraFrameTimer = useCallback(() => {
    if (cameraFrameTimerRef.current) {
      window.clearInterval(cameraFrameTimerRef.current);
      cameraFrameTimerRef.current = null;
    }
  }, [cameraFrameTimerRef]);

  const clearAffectRefreshTimer = useCallback(() => {
    if (affectRefreshTimerRef.current) {
      window.clearTimeout(affectRefreshTimerRef.current);
      affectRefreshTimerRef.current = null;
    }
  }, [affectRefreshTimerRef]);

  const teardownCamera = useCallback((stopTracks = true) => {
    clearCameraFrameTimer();

    [modalVideoRef.current, mainVideoRef.current].forEach((videoElement) => {
      if (!videoElement) {
        return;
      }
      try {
        if (typeof videoElement.pause === 'function') {
          videoElement.pause();
        }
      } catch (error) {
        // Ignore preview shutdown races.
      }
      if ('srcObject' in videoElement) {
        videoElement.srcObject = null;
      }
    });

    const stream = cameraStreamRef.current;
    if (stopTracks && stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => {
        if (track && typeof track.stop === 'function') {
          track.stop();
        }
      });
      cameraStreamRef.current = null;
    }
  }, [cameraStreamRef, clearCameraFrameTimer, mainVideoRef, modalVideoRef]);

  const pushAffectHistory = useCallback((snapshot) => {
    if (!snapshot || snapshot.fusion?.emotionState === 'pending') {
      return;
    }
    setAffectHistory((previous) => {
      const nextItem = {
        id: `${snapshot.generatedAt || 'pending'}-${snapshot.sourceContext?.recordId || 'unknown'}`,
        generatedAt: snapshot.generatedAt || new Date().toISOString(),
        emotion: snapshot.fusion?.emotionState || 'pending',
        detail: snapshot.fusion?.detail || snapshot.text?.detail || snapshot.audio?.detail || snapshot.video?.detail || '',
        riskLevel: snapshot.fusion?.riskLevel || 'pending',
      };
      const filtered = previous.filter((item) => item.id !== nextItem.id);
      return [nextItem, ...filtered].slice(0, 8);
    });
  }, [setAffectHistory]);

  const applyAffectSnapshot = useCallback((snapshot, options = {}) => {
    if (!snapshot) {
      return;
    }
    const nextTimestamp = typeof options.timestamp === 'number'
      ? options.timestamp
      : Date.now();
    if (nextTimestamp < affectSnapshotTimestampRef.current) {
      return;
    }
    affectSnapshotTimestampRef.current = nextTimestamp;
    setAffectSnapshot(snapshot);
    pushAffectHistory(snapshot);
  }, [affectSnapshotTimestampRef, pushAffectHistory, setAffectSnapshot]);

  const finalizeVideoUploadState = useCallback((nextCameraState = cameraStateRef.current) => {
    const currentUploadState = videoUploadStateRef.current;
    const currentUploadedCount = uploadedVideoFrameCountRef.current;
    const currentSessionId = sessionStateRef.current?.session?.session_id || null;
    if (currentUploadState === 'error') {
      return;
    }

    if (!currentSessionId) {
      setVideoUploadState(nextCameraState === 'previewing' ? 'local_only' : 'idle');
      setVideoUploadMessage(
        nextCameraState === 'previewing'
          ? 'No active session. Camera preview stays local-only.'
          : 'No video frames uploaded yet.',
      );
      return;
    }

    if (nextCameraState === 'previewing' || pendingVideoUploadsRef.current > 0) {
      setVideoUploadState('uploading');
      setVideoUploadMessage(
        pendingVideoUploadsRef.current > 0
          ? `Uploading video frames. ${currentUploadedCount} completed, ${pendingVideoUploadsRef.current} still in flight.`
          : `Camera preview active. Uploaded ${currentUploadedCount} video frames.`,
      );
      return;
    }

    setVideoUploadState(currentUploadedCount > 0 ? 'completed' : 'idle');
    setVideoUploadMessage(
      currentUploadedCount > 0
        ? `Video frame upload complete. Uploaded ${currentUploadedCount} frames.`
        : 'No video frames uploaded yet.',
    );
  }, [cameraStateRef, pendingVideoUploadsRef, sessionStateRef, setVideoUploadMessage, setVideoUploadState, uploadedVideoFrameCountRef, videoUploadStateRef]);

  const buildAffectRequestPayload = useCallback((reason) => {
    const currentSourceContext = affectSnapshot?.sourceContext || null;
    const latestTranscriptText = finalTranscriptState.sourceKind === 'test_audio'
      ? ''
      : finalTranscriptState.text;
    const lastSourceKind = finalTranscriptState.sourceKind === 'test_audio'
      ? 'text'
      : finalTranscriptState.sourceKind || 'text';
    return {
      session_id: activeSessionId,
      trace_id: activeTraceId,
      current_stage: sessionStateRef.current?.session?.stage || 'engage',
      text_input: latestTranscriptText || inputText.trim(),
      last_source_kind: lastSourceKind,
      metadata: {
        source: currentSourceContext?.origin && currentSourceContext.origin !== 'live_web_session'
          ? currentSourceContext.origin
          : 'web-shell',
        refresh_reason: reason || 'manual_refresh',
        dataset: currentSourceContext?.dataset || 'live_web',
        record_id: currentSourceContext?.recordId && currentSourceContext.recordId !== 'pending'
          ? currentSourceContext.recordId
          : `session/${activeSessionId || 'pending'}`,
        sample_note: currentSourceContext?.note || 'Waiting for session sample information.',
      },
      capture_state: {
        camera_state: cameraState,
        video_upload_state: videoUploadState,
        uploaded_video_frame_count: uploadedVideoFrameCount,
        recording_state: recordingState,
        audio_upload_state: audioUploadState,
        uploaded_chunk_count: recordingChunkCount,
      },
    };
  }, [activeSessionId, activeTraceId, affectSnapshot, audioUploadState, cameraState, finalTranscriptState.sourceKind, finalTranscriptState.text, inputText, recordingChunkCount, recordingState, sessionStateRef, uploadedVideoFrameCount, videoUploadState]);

  const refreshAffectPanel = useCallback(async (reason) => {
    if (!activeSessionId) {
      return null;
    }

    const requestToken = affectRequestTokenRef.current + 1;
    const requestStartedAt = Date.now();
    affectRequestTokenRef.current = requestToken;
    setAffectSnapshot((previous) => ({
      ...previous,
      panelState: 'loading',
      panelMessage: 'Refreshing affect panel.',
    }));

    try {
      const payload = await requestAffectAnalysis(runtimeConfig.affectBaseUrl, buildAffectRequestPayload(reason));
      if (requestToken !== affectRequestTokenRef.current) {
        return null;
      }
      const normalized = normalizeAffectPayload(payload);
      if (!normalized) {
        if (requestStartedAt < affectSnapshotTimestampRef.current) {
          return null;
        }
        setAffectSnapshot((previous) => ({
          ...previous,
          panelState: 'error',
          panelMessage: 'Affect payload was invalid. Keeping the previous snapshot.',
        }));
        return null;
      }
      applyAffectSnapshot(normalized, { timestamp: requestStartedAt });
      return normalized;
    } catch (error) {
      if (requestToken !== affectRequestTokenRef.current || requestStartedAt < affectSnapshotTimestampRef.current) {
        return null;
      }
      setAffectSnapshot((previous) => ({
        ...previous,
        panelState: 'error',
        panelMessage: error instanceof Error ? error.message : String(error),
      }));
      return null;
    }
  }, [activeSessionId, affectRequestTokenRef, affectSnapshotTimestampRef, applyAffectSnapshot, buildAffectRequestPayload, runtimeConfig.affectBaseUrl, setAffectSnapshot]);

  const scheduleAffectRefresh = useCallback((reason, delayMs = 180) => {
    if (!activeSessionId) {
      pendingSessionAffectReasonRef.current = reason || pendingSessionAffectReasonRef.current;
      return;
    }
    clearAffectRefreshTimer();
    const nextReason = reason || pendingSessionAffectReasonRef.current || 'scheduled_refresh';
    pendingSessionAffectReasonRef.current = null;
    affectRefreshTimerRef.current = window.setTimeout(() => {
      affectRefreshTimerRef.current = null;
      void refreshAffectPanel(nextReason);
    }, delayMs);
  }, [activeSessionId, affectRefreshTimerRef, clearAffectRefreshTimer, pendingSessionAffectReasonRef, refreshAffectPanel]);

  const requestCameraAccess = useCallback(async () => {
    if (cameraStateRef.current === 'previewing') {
      return true;
    }

    if (!navigator?.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setCameraPermissionState('unsupported');
      setCameraPermissionMessage('Current browser does not support camera capture.');
      setCameraState('error');
      setCameraPreviewMessage('Camera is unavailable in this runtime.');
      if (activeSessionId) {
        scheduleAffectRefresh('camera_permission_changed', 120);
      }
      return false;
    }

    setCameraPermissionState('requesting');
    setCameraPermissionMessage('Requesting camera access.');

    try {
      if (!cameraStreamRef.current) {
        cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
      }
      setCameraPermissionState('granted');
      setCameraPermissionMessage('Camera access granted.');
      if (activeSessionId) {
        scheduleAffectRefresh('camera_permission_changed', 120);
      }
      return true;
    } catch (error) {
      const errorName = error && typeof error === 'object' ? error.name : '';
      setCameraState('error');
      setCameraPreviewMessage('Camera is unavailable.');
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        setCameraPermissionState('denied');
        setCameraPermissionMessage('Camera permission was denied.');
      } else {
        setCameraPermissionState('error');
        setCameraPermissionMessage(error instanceof Error ? error.message : String(error));
      }
      if (activeSessionId) {
        scheduleAffectRefresh('camera_permission_changed', 120);
      }
      return false;
    }
  }, [activeSessionId, cameraStateRef, cameraStreamRef, scheduleAffectRefresh, setCameraPermissionMessage, setCameraPermissionState, setCameraPreviewMessage, setCameraState]);

  const buildVideoFramePayload = useCallback(async () => {
    const videoElement = modalVideoRef.current || mainVideoRef.current;
    const fallbackWidth = videoElement?.videoWidth || 640;
    const fallbackHeight = videoElement?.videoHeight || 360;
    const BlobCtor = window?.Blob || Blob;

    if (videoElement && typeof document?.createElement === 'function') {
      const canvas = cameraCanvasRef.current || document.createElement('canvas');
      cameraCanvasRef.current = canvas;
      canvas.width = fallbackWidth;
      canvas.height = fallbackHeight;
      const context = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
      if (context && typeof context.drawImage === 'function') {
        try {
          context.drawImage(videoElement, 0, 0, fallbackWidth, fallbackHeight);
        } catch (error) {
          // Ignore draw failures and fallback below.
        }
      }
      if (typeof canvas.toBlob === 'function') {
        const blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', 0.82);
        });
        if (blob) {
          return {
            blob,
            mimeType: blob.type || 'image/jpeg',
            width: fallbackWidth,
            height: fallbackHeight,
          };
        }
      }
    }

    if (typeof BlobCtor !== 'function') {
      return null;
    }

    return {
      blob: new BlobCtor([
        JSON.stringify({
          frame_seq: nextVideoFrameSeqRef.current,
          captured_at_ms: Date.now(),
          camera_state: cameraStateRef.current,
        }),
      ], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      width: fallbackWidth,
      height: fallbackHeight,
    };
  }, [cameraCanvasRef, cameraStateRef, mainVideoRef, modalVideoRef, nextVideoFrameSeqRef]);

  const uploadVideoFrame = useCallback(async (payload) => {
    if (!activeSessionId) {
      setVideoUploadState('local_only');
      setVideoUploadMessage('No active session. Camera preview stays local-only.');
      return null;
    }

    pendingVideoUploadsRef.current += 1;
    setVideoUploadState('uploading');
    setVideoUploadMessage(`Uploading video frame ${payload.frameSeq}.`);

    try {
      const responsePayload = await requestVideoFrameUpload(runtimeConfig.apiBaseUrl, activeSessionId, payload);
      setUploadedVideoFrameCount((previous) => previous + 1);
      setLastUploadedVideoFrameId(responsePayload?.media_id || null);
      setLastVideoUploadedAt(responsePayload?.created_at || new Date().toISOString());
      if (payload.frameSeq <= 2) {
        scheduleAffectRefresh('video_frame_uploaded', 120);
      }
      return responsePayload;
    } catch (error) {
      setVideoUploadState('error');
      setVideoUploadMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      pendingVideoUploadsRef.current = Math.max(0, pendingVideoUploadsRef.current - 1);
      finalizeVideoUploadState();
    }
  }, [activeSessionId, finalizeVideoUploadState, pendingVideoUploadsRef, runtimeConfig.apiBaseUrl, scheduleAffectRefresh, setLastUploadedVideoFrameId, setLastVideoUploadedAt, setUploadedVideoFrameCount, setVideoUploadMessage, setVideoUploadState]);

  const captureAndUploadVideoFrame = useCallback(async () => {
    if (cameraStateRef.current !== 'previewing') {
      return null;
    }

    const payload = await buildVideoFramePayload();
    if (!payload) {
      setVideoUploadState('error');
      setVideoUploadMessage('Current browser does not support video frame serialization.');
      return null;
    }

    const frameSeq = nextVideoFrameSeqRef.current;
    nextVideoFrameSeqRef.current += 1;
    setNextVideoFrameSeq(nextVideoFrameSeqRef.current);
    return uploadVideoFrame({
      blob: payload.blob,
      frameSeq,
      capturedAtMs: Date.now(),
      width: payload.width,
      height: payload.height,
      mimeType: payload.mimeType,
    });
  }, [buildVideoFramePayload, cameraStateRef, nextVideoFrameSeqRef, setNextVideoFrameSeq, setVideoUploadMessage, setVideoUploadState, uploadVideoFrame]);

  const startCameraPreview = useCallback(async () => {
    if (cameraStateRef.current === 'previewing') {
      return true;
    }

    const granted = await requestCameraAccess();
    if (!granted || !cameraStreamRef.current) {
      setCameraState('error');
      setCameraPreviewMessage('Camera is not ready for preview.');
      return false;
    }

    [modalVideoRef.current, mainVideoRef.current].forEach((videoElement) => {
      if (videoElement && 'srcObject' in videoElement) {
        videoElement.srcObject = cameraStreamRef.current;
      }
    });

    const videoElement = modalVideoRef.current || mainVideoRef.current;
    if (videoElement && typeof videoElement.play === 'function') {
      try {
        await videoElement.play();
      } catch (error) {
        setCameraState('error');
        setCameraPreviewMessage(error instanceof Error ? error.message : String(error));
        return false;
      }
    }

    clearCameraFrameTimer();
    setCameraState('previewing');
    setCameraPreviewMessage('Camera preview is active. Uploading video frames at a low frequency.');
    setVideoUploadState(activeSessionId ? 'uploading' : 'local_only');
    setVideoUploadMessage(
      activeSessionId
        ? 'Camera preview is active. Waiting for the first uploaded frame.'
        : 'Camera preview is active locally without a session.',
    );
    setUploadedVideoFrameCount(0);
    setLastUploadedVideoFrameId(null);
    setLastVideoUploadedAt(null);
    setNextVideoFrameSeq(1);
    nextVideoFrameSeqRef.current = 1;
    scheduleAffectRefresh('camera_preview_started', 80);
    void captureAndUploadVideoFrame();
    cameraFrameTimerRef.current = window.setInterval(() => {
      void captureAndUploadVideoFrame();
    }, runtimeConfig.videoFrameUploadIntervalMs);
    return true;
  }, [activeSessionId, cameraFrameTimerRef, cameraStateRef, cameraStreamRef, captureAndUploadVideoFrame, clearCameraFrameTimer, mainVideoRef, modalVideoRef, nextVideoFrameSeqRef, requestCameraAccess, runtimeConfig.videoFrameUploadIntervalMs, scheduleAffectRefresh, setCameraPreviewMessage, setCameraState, setLastUploadedVideoFrameId, setLastVideoUploadedAt, setNextVideoFrameSeq, setUploadedVideoFrameCount, setVideoUploadMessage, setVideoUploadState]);

  const stopCameraPreview = useCallback(() => {
    clearCameraFrameTimer();
    teardownCamera(true);
    setCameraState('stopped');
    setCameraPreviewMessage('Camera preview stopped.');
    finalizeVideoUploadState('stopped');
    scheduleAffectRefresh('camera_preview_stopped', 80);
    return true;
  }, [clearCameraFrameTimer, finalizeVideoUploadState, scheduleAffectRefresh, setCameraPreviewMessage, setCameraState, teardownCamera]);

  useEffect(() => {
    cameraStateRef.current = cameraState;
  }, [cameraState, cameraStateRef]);

  useEffect(() => {
    videoUploadStateRef.current = videoUploadState;
  }, [videoUploadState, videoUploadStateRef]);

  useEffect(() => {
    uploadedVideoFrameCountRef.current = uploadedVideoFrameCount;
  }, [uploadedVideoFrameCount, uploadedVideoFrameCountRef]);

  useEffect(() => {
    nextVideoFrameSeqRef.current = nextVideoFrameSeq;
  }, [nextVideoFrameSeq, nextVideoFrameSeqRef]);

  useEffect(() => {
    if (!activeSessionId || !pendingSessionAffectReasonRef.current || affectRefreshTimerRef.current) {
      return;
    }
    scheduleAffectRefresh(pendingSessionAffectReasonRef.current, 40);
  }, [activeSessionId, affectRefreshTimerRef, pendingSessionAffectReasonRef, scheduleAffectRefresh]);

  useEffect(() => {
    if (!isCameraModalOpen) {
      cameraModalAutoStartRef.current = false;
      return;
    }
    if (cameraModalAutoStartRef.current) {
      return;
    }
    cameraModalAutoStartRef.current = true;
    void requestCameraAccess().then((granted) => {
      if (granted) {
        void startCameraPreview();
      }
    });
  }, [cameraModalAutoStartRef, isCameraModalOpen, requestCameraAccess, startCameraPreview]);

  useEffect(() => {
    if (modalVideoRef.current && cameraStreamRef.current) {
      modalVideoRef.current.srcObject = cameraStreamRef.current;
    }
    if (mainVideoRef.current && cameraStreamRef.current) {
      mainVideoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [cameraPermissionState, cameraState, cameraStreamRef, isCameraModalOpen, mainVideoRef, modalVideoRef]);

  return {
    applyAffectSnapshot,
    clearAffectRefreshTimer,
    scheduleAffectRefresh,
    startCameraPreview,
    stopCameraPreview,
    teardownCamera,
  };
}
