import { useCallback, useEffect } from 'react';
import {
  buildHeartbeatMessage,
  buildRealtimeSocketUrl,
  clearStoredSessionId,
  isTerminalRealtimeClose,
  readStoredSessionId,
  requestSession,
  requestSessionState,
  requestTextMessage,
  writeStoredSessionId,
} from './sessionApi';
import { DEFAULT_EXPORT_MESSAGE } from './appContent';
import {
  buildAcceptedMessageFromEnvelope,
  buildReplyMessageFromEnvelope,
  createInitialAffectSnapshot,
  createInitialFinalTranscriptState,
  createInitialKnowledgeState,
  createInitialPartialTranscriptState,
  hasMessageId,
  normalizeAffectPayload,
  normalizeKnowledgeRetrievedPayload,
  normalizeSessionStatePayload,
  resolveAvatarId,
  resolvePlayableTtsAudioUrl,
  upsertMessageById,
  validateTranscriptFinalPayload,
  validateTranscriptPartialPayload,
} from './appHelpers';

function resolveSessionErrorMessage(error, fallbackMessage, t) {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  if (/session_not_found/i.test(rawMessage)) {
    return t.sessionExpired;
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(rawMessage)) {
    return t.sessionNetworkError;
  }
  return fallbackMessage;
}

function resolveTerminalCloseMessage(reason, t) {
  return /session_not_found/i.test(reason || '')
    ? t.sessionExpired
    : t.sessionConnectionNotReady;
}

export function useSessionRealtime({
  activeSessionId,
  activeTraceId,
  applyAffectSnapshot,
  audioUploadStateRef,
  autoRestoreAttemptedRef,
  clearAffectRefreshTimer,
  clearReplayTimer,
  completedRecordingIdRef,
  connectionStatus,
  connectionStatusMessage,
  connectionStatusRef,
  connectionTokenRef,
  connectRealtimeRef,
  currentRecordingIdRef,
  effectiveAvatarProfile,
  inputText,
  lastPreviewChunkCountRef,
  nextPreviewSeqRef,
  pendingMessageId,
  pendingMessageIdRef,
  pendingSessionAffectReasonRef,
  pendingVideoUploadsRef,
  replayState,
  resetReplayState,
  runtimeConfig,
  scheduleAffectRefresh,
  selectedAvatarId,
  sessionAvatarId,
  sessionState,
  sessionStateRef,
  setAffectHistory,
  setAffectSnapshot,
  setAudioUploadMessage,
  setAudioUploadState,
  setAvatarMouthState,
  setCameraPermissionMessage,
  setCameraPermissionState,
  setCameraPreviewMessage,
  setCameraState,
  setClientSeq,
  setConnectionStatus,
  setConnectionStatusMessage,
  setDialogueReplyState,
  setExportMessage,
  setExportState,
  setFinalTranscriptState,
  setInputText,
  setIsCameraModalOpen,
  setKnowledgeState,
  setLastExportFileName,
  setLastExportedAt,
  setLastHeartbeatAt,
  setLastUploadedVideoFrameId,
  setLastVideoUploadedAt,
  setNextVideoFrameSeq,
  setPartialTranscriptState,
  setPendingMessageId,
  setSelectedAvatarId,
  setSessionAvatarId,
  setSessionErrorMessage,
  setSessionRequestState,
  setSessionState,
  setSessionStatusMessage,
  setStoredSessionId,
  setTextSubmitState,
  setTtsAudioFormat,
  setTtsAudioUrl,
  setTtsDurationMs,
  setTtsGeneratedAt,
  setTtsMessageId,
  setTtsPlaybackMessage,
  setTtsPlaybackState,
  setTtsVoiceId,
  setUploadedVideoFrameCount,
  setVideoUploadMessage,
  setVideoUploadState,
  shouldRecoverOnNextConnectRef,
  socketRef,
  stopAssistantAudioPlayback,
  stopAvatarMouthAnimation,
  storedSessionId,
  synthesizeAssistantAudioRef,
  t,
  teardownCamera,
  teardownMicrophone,
  textSubmitState,
  textSubmitStateRef,
  ttsAudioUrlRef,
  ttsPlaybackStateRef,
  ttsRequestTokenRef,
  affectRequestTokenRef,
  affectSnapshotTimestampRef,
  heartbeatTimerRef,
  reconnectTimerRef,
  manualCloseRef,
  clientSeq,
}) {
  const applySessionSnapshot = useCallback((payload, statusMessage) => {
    const normalizedPayload = normalizeSessionStatePayload(payload);
    const nextSessionId = normalizedPayload?.session?.session_id || null;
    const nextMessages = normalizedPayload.messages;
    const nextUserMessageCount = nextMessages.filter((message) => message?.role === 'user').length;
    const nextSessionAvatarId = resolveAvatarId(
      normalizedPayload?.session?.avatar_id,
      runtimeConfig.defaultAvatarId,
    );

    autoRestoreAttemptedRef.current = true;
    shouldRecoverOnNextConnectRef.current = false;
    sessionStateRef.current = normalizedPayload;
    sessionAvatarId && stopAssistantAudioPlayback();
    ttsRequestTokenRef.current += 1;
    setSessionState(normalizedPayload);
    setSessionAvatarId(nextSessionAvatarId);
    setSelectedAvatarId(nextSessionAvatarId);
    setSessionErrorMessage('');
    setSessionStatusMessage(statusMessage || t.sessionReady);
    pendingMessageIdRef.current = null;
    textSubmitStateRef.current = 'idle';
    setStoredSessionId(nextSessionId);
    setClientSeq(nextUserMessageCount + 1);
    setTextSubmitState('idle');
    setDialogueReplyState('idle');
    setPendingMessageId(null);
    setLastHeartbeatAt(null);
    connectionStatusRef.current = typeof window?.WebSocket === 'function' ? 'idle' : 'unsupported';
    setConnectionStatus(connectionStatusRef.current);
    setConnectionStatusMessage('');
    setPartialTranscriptState(createInitialPartialTranscriptState());
    setFinalTranscriptState(createInitialFinalTranscriptState());
    affectRequestTokenRef.current += 1;
    affectSnapshotTimestampRef.current = 0;
    setAffectSnapshot(createInitialAffectSnapshot());
    setAffectHistory([]);
    setKnowledgeState(createInitialKnowledgeState());
    setTtsPlaybackState('idle');
    setTtsPlaybackMessage('');
    setTtsAudioUrl(null);
    setTtsAudioFormat('pending');
    setTtsVoiceId('pending');
    setTtsDurationMs(0);
    setTtsGeneratedAt(null);
    setTtsMessageId(null);
    setAvatarMouthState('closed');
    setExportState('idle');
    setExportMessage(DEFAULT_EXPORT_MESSAGE);
    setLastExportedAt(null);
    setLastExportFileName(null);
    resetReplayState();

    if (nextSessionId) {
      writeStoredSessionId(runtimeConfig.activeSessionStorageKey, nextSessionId);
      scheduleAffectRefresh('session_snapshot_applied', 40);
    }
  }, [
    affectRequestTokenRef,
    affectSnapshotTimestampRef,
    autoRestoreAttemptedRef,
    connectionStatusRef,
    pendingMessageIdRef,
    resetReplayState,
    runtimeConfig.activeSessionStorageKey,
    runtimeConfig.defaultAvatarId,
    scheduleAffectRefresh,
    sessionAvatarId,
    sessionStateRef,
    setAffectHistory,
    setAffectSnapshot,
    setAvatarMouthState,
    setClientSeq,
    setConnectionStatus,
    setConnectionStatusMessage,
    setDialogueReplyState,
    setExportMessage,
    setExportState,
    setFinalTranscriptState,
    setKnowledgeState,
    setLastExportFileName,
    setLastExportedAt,
    setLastHeartbeatAt,
    setPartialTranscriptState,
    setPendingMessageId,
    setSelectedAvatarId,
    setSessionAvatarId,
    setSessionErrorMessage,
    setSessionState,
    setSessionStatusMessage,
    setStoredSessionId,
    setTextSubmitState,
    setTtsAudioFormat,
    setTtsAudioUrl,
    setTtsDurationMs,
    setTtsGeneratedAt,
    setTtsMessageId,
    setTtsPlaybackMessage,
    setTtsPlaybackState,
    setTtsVoiceId,
    shouldRecoverOnNextConnectRef,
    stopAssistantAudioPlayback,
    t.sessionReady,
    textSubmitStateRef,
    ttsRequestTokenRef,
  ]);

  const recoverInFlightTurnFromState = useCallback((payload) => {
    const normalizedPayload = normalizeSessionStatePayload(payload);
    const nextSessionId = normalizedPayload?.session?.session_id || null;
    const nextMessages = normalizedPayload.messages;
    const nextUserMessageCount = nextMessages.filter((message) => message?.role === 'user').length;
    const nextSessionAvatarId = resolveAvatarId(
      normalizedPayload?.session?.avatar_id,
      runtimeConfig.defaultAvatarId,
    );
    const currentTurnState = textSubmitStateRef.current;
    const expectedPendingMessageId = pendingMessageIdRef.current;
    const acceptedIndex = expectedPendingMessageId
      ? nextMessages.findIndex((message) => message?.message_id === expectedPendingMessageId)
      : -1;
    const hasAssistantAfterPending = acceptedIndex >= 0
      && nextMessages.slice(acceptedIndex + 1).some((message) => message?.role === 'assistant');
    const latestUserIndex = (() => {
      for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
        if (nextMessages[index]?.role === 'user') {
          return index;
        }
      }
      return -1;
    })();
    const hasAssistantAfterLatestUser = latestUserIndex >= 0
      && nextMessages.slice(latestUserIndex + 1).some((message) => message?.role === 'assistant');

    autoRestoreAttemptedRef.current = true;
    shouldRecoverOnNextConnectRef.current = false;
    sessionStateRef.current = normalizedPayload;
    setSessionState(normalizedPayload);
    setSessionAvatarId(nextSessionAvatarId);
    setStoredSessionId(nextSessionId);
    setClientSeq(nextUserMessageCount + 1);
    setSessionErrorMessage('');

    if (nextSessionId) {
      writeStoredSessionId(runtimeConfig.activeSessionStorageKey, nextSessionId);
    }

    if (currentTurnState === 'awaiting_ack' && acceptedIndex === -1 && expectedPendingMessageId) {
      pendingMessageIdRef.current = expectedPendingMessageId;
      textSubmitStateRef.current = 'awaiting_ack';
      setPendingMessageId(expectedPendingMessageId);
      setTextSubmitState('awaiting_ack');
      setDialogueReplyState('idle');
      setSessionStatusMessage(t.sessionSubmitting);
      return;
    }

    if (currentTurnState === 'awaiting_ack' && acceptedIndex >= 0 && !hasAssistantAfterPending) {
      pendingMessageIdRef.current = null;
      textSubmitStateRef.current = 'awaiting_reply';
      setPendingMessageId(null);
      setTextSubmitState('awaiting_reply');
      setDialogueReplyState('idle');
      setSessionStatusMessage(t.sessionSubmitting);
      return;
    }

    if (
      (currentTurnState === 'awaiting_ack' && hasAssistantAfterPending)
      || (currentTurnState === 'awaiting_reply' && hasAssistantAfterLatestUser)
    ) {
      pendingMessageIdRef.current = null;
      textSubmitStateRef.current = 'idle';
      setPendingMessageId(null);
      setTextSubmitState('idle');
      setDialogueReplyState('received');
      setSessionStatusMessage(t.sessionSubmitSuccess);
      return;
    }

    if (currentTurnState === 'awaiting_reply' && latestUserIndex >= 0) {
      pendingMessageIdRef.current = null;
      textSubmitStateRef.current = 'awaiting_reply';
      setPendingMessageId(null);
      setTextSubmitState('awaiting_reply');
      setDialogueReplyState('idle');
      setSessionStatusMessage(t.sessionSubmitting);
      return;
    }

    pendingMessageIdRef.current = null;
    textSubmitStateRef.current = 'idle';
    setPendingMessageId(null);
    setTextSubmitState('idle');
    setDialogueReplyState('idle');
    setSessionStatusMessage(t.sessionReady);
  }, [
    autoRestoreAttemptedRef,
    pendingMessageIdRef,
    runtimeConfig.activeSessionStorageKey,
    runtimeConfig.defaultAvatarId,
    sessionStateRef,
    setClientSeq,
    setDialogueReplyState,
    setPendingMessageId,
    setSessionAvatarId,
    setSessionErrorMessage,
    setSessionState,
    setSessionStatusMessage,
    setStoredSessionId,
    setTextSubmitState,
    shouldRecoverOnNextConnectRef,
    t.sessionReady,
    t.sessionSubmitSuccess,
    t.sessionSubmitting,
    textSubmitStateRef,
  ]);

  const clearHeartbeatTimer = useCallback(() => {
    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, [heartbeatTimerRef]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, [reconnectTimerRef]);

  const teardownRealtime = useCallback((manualClose = true) => {
    manualCloseRef.current = manualClose;
    clearReconnectTimer();
    clearHeartbeatTimer();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) {
      socket.close();
    }
  }, [clearHeartbeatTimer, clearReconnectTimer, manualCloseRef, socketRef]);

  const invalidateLocalSession = useCallback(({
    nextSessionRequestState = 'idle',
    nextSessionStatusMessage = t.sessionIdle,
    nextSessionErrorMessage = '',
    nextConnectionStatus = 'idle',
    nextConnectionStatusMessage = '',
  } = {}) => {
    teardownRealtime(true);
    teardownMicrophone();
    teardownCamera(true);
    clearAffectRefreshTimer();
    clearStoredSessionId(runtimeConfig.activeSessionStorageKey);
    setInputText('');
    autoRestoreAttemptedRef.current = true;
    shouldRecoverOnNextConnectRef.current = false;
    connectionTokenRef.current += 1;
    affectRequestTokenRef.current += 1;
    affectSnapshotTimestampRef.current = 0;
    sessionStateRef.current = null;
    pendingMessageIdRef.current = null;
    textSubmitStateRef.current = 'idle';
    connectionStatusRef.current = nextConnectionStatus;
    pendingVideoUploadsRef.current = 0;
    pendingSessionAffectReasonRef.current = null;
    ttsRequestTokenRef.current += 1;
    stopAssistantAudioPlayback();
    setStoredSessionId(null);
    setSessionState(null);
    setSessionAvatarId(null);
    setSessionRequestState(nextSessionRequestState);
    setSessionErrorMessage(nextSessionErrorMessage);
    setSessionStatusMessage(nextSessionStatusMessage);
    setClientSeq(1);
    setTextSubmitState('idle');
    setDialogueReplyState('idle');
    setPendingMessageId(null);
    setLastHeartbeatAt(null);
    setConnectionStatus(nextConnectionStatus);
    setConnectionStatusMessage(nextConnectionStatusMessage);
    setPartialTranscriptState(createInitialPartialTranscriptState());
    setFinalTranscriptState(createInitialFinalTranscriptState());
    setAffectSnapshot(createInitialAffectSnapshot());
    setAffectHistory([]);
    setKnowledgeState(createInitialKnowledgeState());
    setTtsPlaybackState('idle');
    setTtsPlaybackMessage('');
    setTtsAudioUrl(null);
    setTtsAudioFormat('pending');
    setTtsVoiceId('pending');
    setTtsDurationMs(0);
    setTtsGeneratedAt(null);
    setTtsMessageId(null);
    setAvatarMouthState('closed');
    setCameraPermissionState('idle');
    setCameraPermissionMessage('');
    setCameraState('idle');
    setCameraPreviewMessage('');
    setVideoUploadState('idle');
    setVideoUploadMessage('');
    setUploadedVideoFrameCount(0);
    setLastUploadedVideoFrameId(null);
    setLastVideoUploadedAt(null);
    setNextVideoFrameSeq(1);
    setIsCameraModalOpen(false);
    setExportState('idle');
    setExportMessage(DEFAULT_EXPORT_MESSAGE);
    setLastExportedAt(null);
    setLastExportFileName(null);
    resetReplayState();
  }, [
    affectRequestTokenRef,
    affectSnapshotTimestampRef,
    autoRestoreAttemptedRef,
    clearAffectRefreshTimer,
    connectionStatusRef,
    connectionTokenRef,
    pendingMessageIdRef,
    pendingSessionAffectReasonRef,
    pendingVideoUploadsRef,
    resetReplayState,
    runtimeConfig.activeSessionStorageKey,
    sessionStateRef,
    setAffectHistory,
    setAffectSnapshot,
    setAvatarMouthState,
    setCameraPermissionMessage,
    setCameraPermissionState,
    setCameraPreviewMessage,
    setCameraState,
    setClientSeq,
    setConnectionStatus,
    setConnectionStatusMessage,
    setDialogueReplyState,
    setExportMessage,
    setExportState,
    setFinalTranscriptState,
    setInputText,
    setIsCameraModalOpen,
    setKnowledgeState,
    setLastExportFileName,
    setLastExportedAt,
    setLastHeartbeatAt,
    setLastUploadedVideoFrameId,
    setLastVideoUploadedAt,
    setNextVideoFrameSeq,
    setPartialTranscriptState,
    setPendingMessageId,
    setSessionAvatarId,
    setSessionErrorMessage,
    setSessionRequestState,
    setSessionState,
    setSessionStatusMessage,
    setStoredSessionId,
    setTextSubmitState,
    setTtsAudioFormat,
    setTtsAudioUrl,
    setTtsDurationMs,
    setTtsGeneratedAt,
    setTtsMessageId,
    setTtsPlaybackMessage,
    setTtsPlaybackState,
    setTtsVoiceId,
    setUploadedVideoFrameCount,
    setVideoUploadMessage,
    setVideoUploadState,
    shouldRecoverOnNextConnectRef,
    stopAssistantAudioPlayback,
    t.sessionIdle,
    teardownCamera,
    teardownMicrophone,
    teardownRealtime,
    textSubmitStateRef,
    ttsRequestTokenRef,
  ]);

  const restoreSession = useCallback(async (targetSessionId) => {
    if (!targetSessionId) {
      setSessionErrorMessage('');
      setSessionStatusMessage(t.noStoredSession);
      return;
    }

    setSessionRequestState('restoring');
    setSessionErrorMessage('');
    setSessionStatusMessage(t.sessionRestoring);

    try {
      const payload = await requestSessionState(runtimeConfig.apiBaseUrl, targetSessionId);
      applySessionSnapshot(payload, t.sessionReady);
      setSessionRequestState('ready');
    } catch (error) {
      const nextErrorMessage = resolveSessionErrorMessage(error, t.sessionRestoreFailed, t);
      invalidateLocalSession({
        nextSessionRequestState: 'error',
        nextSessionStatusMessage: nextErrorMessage,
        nextSessionErrorMessage: nextErrorMessage,
      });
    }
  }, [
    applySessionSnapshot,
    invalidateLocalSession,
    runtimeConfig.apiBaseUrl,
    setSessionErrorMessage,
    setSessionRequestState,
    setSessionStatusMessage,
    t,
  ]);

  useEffect(() => {
    const cachedSessionId = readStoredSessionId(runtimeConfig.activeSessionStorageKey);
    setStoredSessionId(cachedSessionId);
    setSessionStatusMessage(cachedSessionId ? t.restoreReady : t.sessionIdle);
  }, [runtimeConfig.activeSessionStorageKey, setSessionStatusMessage, setStoredSessionId, t.restoreReady, t.sessionIdle]);

  useEffect(() => {
    if (!storedSessionId || autoRestoreAttemptedRef.current) {
      return;
    }
    autoRestoreAttemptedRef.current = true;
    restoreSession(storedSessionId);
  }, [autoRestoreAttemptedRef, restoreSession, storedSessionId]);

  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState, sessionStateRef]);

  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus, connectionStatusRef]);

  useEffect(() => {
    textSubmitStateRef.current = textSubmitState;
  }, [textSubmitState, textSubmitStateRef]);

  useEffect(() => {
    pendingMessageIdRef.current = pendingMessageId;
  }, [pendingMessageId, pendingMessageIdRef]);

  const sendHeartbeat = useCallback((connectionToken = connectionTokenRef.current) => {
    const socket = socketRef.current;
    if (!socket || connectionToken !== connectionTokenRef.current) {
      return;
    }

    if (typeof window?.WebSocket !== 'function' || socket.readyState !== window.WebSocket.OPEN) {
      return;
    }

    const activeSession = sessionStateRef.current?.session;
    if (!activeSession?.session_id) {
      return;
    }

    socket.send(
      JSON.stringify(buildHeartbeatMessage(activeSession.session_id, activeSession.trace_id)),
    );
  }, [connectionTokenRef, sessionStateRef, socketRef]);

  const applyRealtimeEnvelope = useCallback((envelope, options = {}) => {
    if (!envelope || typeof envelope !== 'object') {
      return;
    }

    const mode = options.mode === 'replay' ? 'replay' : 'live';
    const isReplayEnvelope = mode === 'replay';
    const shouldTriggerTts = options.triggerTts !== false;
    const currentSessionId = sessionStateRef.current?.session?.session_id;
    if (currentSessionId && envelope.session_id && envelope.session_id !== currentSessionId) {
      return;
    }

    if (envelope.event_type === 'session.connection.ready') {
      setConnectionStatus('connected');
      setConnectionStatusMessage('realtime ready');
      if (
        shouldRecoverOnNextConnectRef.current
        && currentSessionId
        && (textSubmitStateRef.current === 'awaiting_ack' || textSubmitStateRef.current === 'awaiting_reply')
      ) {
        shouldRecoverOnNextConnectRef.current = false;
        void requestSessionState(runtimeConfig.apiBaseUrl, currentSessionId)
          .then((payload) => {
            recoverInFlightTurnFromState(payload);
            setSessionRequestState('ready');
          })
          .catch((error) => {
            const nextErrorMessage = resolveSessionErrorMessage(error, t.sessionRestoreFailed, t);
            setSessionErrorMessage(nextErrorMessage);
            setSessionStatusMessage(nextErrorMessage);
            setTextSubmitState('error');
            setDialogueReplyState('error');
          });
      } else {
        shouldRecoverOnNextConnectRef.current = false;
      }
      return;
    }

    if (envelope.event_type === 'session.heartbeat') {
      const heartbeatTime = envelope?.payload?.server_time || envelope?.emitted_at || null;
      setConnectionStatus('connected');
      setLastHeartbeatAt(heartbeatTime);
      setConnectionStatusMessage('heartbeat acknowledged');
      return;
    }

    if (envelope.event_type === 'transcript.partial') {
      const partialTranscript = validateTranscriptPartialPayload(envelope.payload || null);
      if (!partialTranscript) {
        return;
      }
      if (
        completedRecordingIdRef.current
        && partialTranscript.recordingId === completedRecordingIdRef.current
        && audioUploadStateRef.current === 'completed'
      ) {
        return;
      }
      if (
        currentRecordingIdRef.current
        && partialTranscript.recordingId !== currentRecordingIdRef.current
      ) {
        return;
      }

      setPartialTranscriptState((previousState) => {
        if (
          previousState.recordingId
          && partialTranscript.recordingId !== previousState.recordingId
          && currentRecordingIdRef.current !== partialTranscript.recordingId
        ) {
          return previousState;
        }
        if (partialTranscript.previewSeq < previousState.previewSeq) {
          return previousState;
        }
        return {
          status: 'streaming',
          text: partialTranscript.text,
          previewSeq: partialTranscript.previewSeq,
          recordingId: partialTranscript.recordingId,
          updatedAt: partialTranscript.generatedAt || envelope?.emitted_at || null,
          language: partialTranscript.language,
          confidence: partialTranscript.confidence,
        };
      });
      setConnectionStatusMessage(`partial transcript ${partialTranscript.previewSeq}`);
      return;
    }

    if (envelope.event_type === 'transcript.final') {
      const finalTranscript = validateTranscriptFinalPayload(envelope.payload || null);
      if (!finalTranscript) {
        return;
      }
      if (
        currentRecordingIdRef.current
        && finalTranscript.recordingId
        && finalTranscript.recordingId !== currentRecordingIdRef.current
      ) {
        return;
      }

      setPartialTranscriptState(createInitialPartialTranscriptState());
      setFinalTranscriptState({
        text: finalTranscript.text,
        messageId: finalTranscript.messageId,
        sourceKind: finalTranscript.sourceKind,
        recordingId: finalTranscript.recordingId,
        updatedAt: finalTranscript.generatedAt || envelope?.emitted_at || null,
        language: finalTranscript.language,
        confidence: finalTranscript.confidence,
      });
      setConnectionStatusMessage('final transcript received');
      return;
    }

    if (envelope.event_type === 'message.accepted') {
      const acceptedMessage = buildAcceptedMessageFromEnvelope(envelope);
      if (!acceptedMessage) {
        setTextSubmitState('error');
        setSessionErrorMessage(t.sessionInvalidAccepted);
        setSessionStatusMessage(t.sessionInvalidAccepted);
        return;
      }

      setSessionState((previousState) => {
        const baseState = normalizeSessionStatePayload(previousState);
        return {
          session: baseState.session
            ? {
              ...baseState.session,
              status: 'active',
              updated_at: acceptedMessage.submitted_at || envelope?.emitted_at || baseState.session.updated_at,
            }
            : baseState.session,
          messages: upsertMessageById(baseState.messages, acceptedMessage),
        };
      });
      pendingMessageIdRef.current = null;
      setPendingMessageId(null);
      setInputText('');
      setSessionErrorMessage('');
      if (acceptedMessage.source_kind === 'audio') {
        completedRecordingIdRef.current = currentRecordingIdRef.current;
        currentRecordingIdRef.current = null;
        lastPreviewChunkCountRef.current = 0;
        nextPreviewSeqRef.current = 1;
        setPartialTranscriptState(createInitialPartialTranscriptState());
        setAudioUploadState('completed');
        setAudioUploadMessage(`Audio message accepted: ${acceptedMessage.message_id || 'message.accepted'}`);
        textSubmitStateRef.current = 'awaiting_reply';
        setTextSubmitState('awaiting_reply');
        setDialogueReplyState('idle');
        setSessionStatusMessage(t.sessionSubmitting);
      } else {
        textSubmitStateRef.current = 'awaiting_reply';
        setTextSubmitState('awaiting_reply');
        setDialogueReplyState('idle');
        setSessionStatusMessage(t.sessionSubmitting);
      }
      return;
    }

    if (envelope.event_type === 'affect.snapshot') {
      const nextAffectSnapshot = normalizeAffectPayload(envelope.payload || null);
      if (!nextAffectSnapshot) {
        return;
      }

      applyAffectSnapshot(nextAffectSnapshot, { timestamp: Date.now() + 1 });
      setConnectionStatusMessage('affect snapshot received');
      return;
    }

    if (envelope.event_type === 'knowledge.retrieved') {
      const nextKnowledgeState = normalizeKnowledgeRetrievedPayload(envelope.payload || null);
      if (!nextKnowledgeState) {
        return;
      }

      setKnowledgeState(nextKnowledgeState);
      setConnectionStatusMessage(
        nextKnowledgeState.sourceIds.length
          ? `knowledge retrieved: ${nextKnowledgeState.sourceIds.join(', ')}`
          : 'knowledge retrieved',
      );
      return;
    }

    if (envelope.event_type === 'dialogue.reply') {
      const replyMessage = buildReplyMessageFromEnvelope(envelope);
      if (!replyMessage) {
        setDialogueReplyState('invalid');
        setSessionErrorMessage(t.sessionInvalidReply);
        setSessionStatusMessage(t.sessionInvalidReply);
        return;
      }

      setSessionState((previousState) => {
        const baseState = normalizeSessionStatePayload(previousState);
        return {
          session: baseState.session
            ? {
              ...baseState.session,
              status: 'active',
              stage: replyMessage.metadata?.stage || baseState.session.stage,
              updated_at: replyMessage.submitted_at || envelope?.emitted_at || baseState.session.updated_at,
            }
            : baseState.session,
          messages: upsertMessageById(baseState.messages, replyMessage),
        };
      });
      pendingMessageIdRef.current = null;
      textSubmitStateRef.current = 'idle';
      setPendingMessageId(null);
      setTextSubmitState('idle');
      setDialogueReplyState('received');
      setSessionErrorMessage('');
      setSessionStatusMessage(t.sessionSubmitSuccess);
      setKnowledgeState((previousState) => ({
        ...previousState,
        groundedRefs: Array.isArray(envelope?.payload?.knowledge_refs)
          ? envelope.payload.knowledge_refs.filter((item) => typeof item === 'string' && item.trim())
          : previousState.groundedRefs,
      }));
      if (shouldTriggerTts) {
        void synthesizeAssistantAudioRef.current?.(envelope.payload || null);
      }
      return;
    }

    if (envelope.event_type === 'tts.synthesized') {
      const payload = envelope?.payload && typeof envelope.payload === 'object'
        ? envelope.payload
        : {};
      const nextAudioUrl = resolvePlayableTtsAudioUrl(payload.audio_url, runtimeConfig);
      ttsAudioUrlRef.current = nextAudioUrl;
      setTtsAudioUrl(nextAudioUrl);
      setTtsAudioFormat(payload.audio_format || 'pending');
      setTtsVoiceId(payload.voice_id || effectiveAvatarProfile.voicePreview);
      setTtsDurationMs(typeof payload.duration_ms === 'number' ? payload.duration_ms : 0);
      setTtsGeneratedAt(payload.generated_at || envelope?.emitted_at || null);
      setTtsMessageId(
        typeof payload.message_id === 'string' && payload.message_id.trim()
          ? payload.message_id
          : envelope?.message_id || null,
      );
      setTtsPlaybackState('ready');
      setTtsPlaybackMessage(isReplayEnvelope ? '回放事件：语音已生成。' : '语音已生成，准备播放。');
      setConnectionStatusMessage(isReplayEnvelope ? 'replay tts synthesized' : 'tts synthesized');
      return;
    }

    if (envelope.event_type === 'tts.playback.started') {
      const payload = envelope?.payload && typeof envelope.payload === 'object'
        ? envelope.payload
        : {};
      setTtsPlaybackState('playing');
      setTtsPlaybackMessage(isReplayEnvelope ? '回放事件：数字人语音播放中。' : '数字人语音播放中。');
      if (typeof payload.voice_id === 'string' && payload.voice_id.trim()) {
        setTtsVoiceId(payload.voice_id);
      }
      if (typeof payload.duration_ms === 'number') {
        setTtsDurationMs(payload.duration_ms);
      }
      setConnectionStatusMessage(isReplayEnvelope ? 'replay playback started' : 'playback started');
      return;
    }

    if (envelope.event_type === 'tts.playback.ended') {
      stopAvatarMouthAnimation();
      setAvatarMouthState('closed');
      setTtsPlaybackState('completed');
      setTtsPlaybackMessage(isReplayEnvelope ? '回放事件：本轮语音播放完成。' : '本轮语音播放完成。');
      setConnectionStatusMessage(isReplayEnvelope ? 'replay playback ended' : 'playback ended');
      return;
    }

    if (envelope.event_type === 'avatar.command') {
      const payload = envelope?.payload && typeof envelope.payload === 'object'
        ? envelope.payload
        : {};
      if (typeof payload.mouth_state === 'string' && payload.mouth_state.trim()) {
        setAvatarMouthState(payload.mouth_state.trim());
      }
      if (payload.command === 'idle' && ttsPlaybackStateRef.current === 'playing') {
        stopAvatarMouthAnimation();
        setTtsPlaybackState('completed');
        setTtsPlaybackMessage(isReplayEnvelope ? '回放事件：本轮语音播放完成。' : '本轮语音播放完成。');
      }
      setConnectionStatusMessage(`avatar command: ${payload.command || 'unknown'}`);
      return;
    }

    if (envelope.event_type === 'session.error') {
      const errorPayload = envelope?.payload && typeof envelope.payload === 'object'
        ? envelope.payload
        : {};
      const errorCode = typeof errorPayload.error_code === 'string' ? errorPayload.error_code : 'session_error';
      const errorMessage = typeof errorPayload.message === 'string' && errorPayload.message.trim()
        ? errorPayload.message.trim()
        : errorCode;
      setSessionErrorMessage(errorMessage);
      setSessionStatusMessage(errorMessage);
      setConnectionStatusMessage(`error: ${errorCode}`);
      if (textSubmitStateRef.current !== 'idle' || errorCode.startsWith('dialogue_')) {
        setTextSubmitState('error');
        setDialogueReplyState('error');
      }
    }
  }, [
    applyAffectSnapshot,
    audioUploadStateRef,
    completedRecordingIdRef,
    currentRecordingIdRef,
    effectiveAvatarProfile.voicePreview,
    lastPreviewChunkCountRef,
    nextPreviewSeqRef,
    pendingMessageIdRef,
    recoverInFlightTurnFromState,
    runtimeConfig,
    sessionStateRef,
    setAudioUploadMessage,
    setAudioUploadState,
    setAvatarMouthState,
    setConnectionStatus,
    setConnectionStatusMessage,
    setDialogueReplyState,
    setFinalTranscriptState,
    setInputText,
    setKnowledgeState,
    setLastHeartbeatAt,
    setPartialTranscriptState,
    setPendingMessageId,
    setSessionErrorMessage,
    setSessionRequestState,
    setSessionState,
    setSessionStatusMessage,
    setTextSubmitState,
    setTtsAudioFormat,
    setTtsAudioUrl,
    setTtsDurationMs,
    setTtsGeneratedAt,
    setTtsMessageId,
    setTtsPlaybackMessage,
    setTtsPlaybackState,
    setTtsVoiceId,
    shouldRecoverOnNextConnectRef,
    stopAvatarMouthAnimation,
    synthesizeAssistantAudioRef,
    t,
    textSubmitStateRef,
    ttsAudioUrlRef,
    ttsPlaybackStateRef,
  ]);

  const connectRealtime = useCallback(() => {
    const activeSession = sessionStateRef.current?.session;
    if (!activeSession?.session_id || !activeSession?.trace_id) {
      return;
    }

    if (connectionStatusRef.current === 'replay') {
      return;
    }

    if (typeof window?.WebSocket !== 'function') {
      setConnectionStatus('unsupported');
      setConnectionStatusMessage('WebSocket unsupported in current runtime');
      return;
    }

    teardownRealtime(false);
    manualCloseRef.current = false;
    clearReconnectTimer();
    clearHeartbeatTimer();
    connectionTokenRef.current += 1;
    const connectionToken = connectionTokenRef.current;
    const socketUrl = buildRealtimeSocketUrl(
      runtimeConfig.wsUrl,
      activeSession.session_id,
      activeSession.trace_id,
    );
    const socket = new window.WebSocket(socketUrl);
    socketRef.current = socket;
    setConnectionStatus(
      connectionStatusRef.current === 'reconnecting' ? 'reconnecting' : 'connecting',
    );
    setConnectionStatusMessage(socketUrl);

    socket.addEventListener('open', () => {
      if (connectionToken !== connectionTokenRef.current) {
        return;
      }
      setConnectionStatus('connected');
      setConnectionStatusMessage('socket connected');
      sendHeartbeat(connectionToken);
      clearHeartbeatTimer();
      heartbeatTimerRef.current = window.setInterval(() => {
        sendHeartbeat(connectionToken);
      }, runtimeConfig.heartbeatIntervalMs);
    });

    socket.addEventListener('message', (event) => {
      if (connectionToken !== connectionTokenRef.current) {
        return;
      }
      try {
        applyRealtimeEnvelope(JSON.parse(event.data));
      } catch (error) {
        setSessionErrorMessage(t.sessionInvalidRealtime);
        setSessionStatusMessage(t.sessionInvalidRealtime);
      }
    });

    socket.addEventListener('error', () => {
      if (connectionToken !== connectionTokenRef.current) {
        return;
      }
      setConnectionStatusMessage('socket transport error');
    });

    socket.addEventListener('close', (event) => {
      if (connectionToken !== connectionTokenRef.current) {
        return;
      }
      clearHeartbeatTimer();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      if (manualCloseRef.current) {
        return;
      }
      if (isTerminalRealtimeClose(event)) {
        const closeReason = event?.reason || 'session_not_found';
        const closeMessage = resolveTerminalCloseMessage(closeReason, t);
        invalidateLocalSession({
          nextSessionRequestState: 'error',
          nextSessionStatusMessage: closeMessage,
          nextSessionErrorMessage: closeMessage,
          nextConnectionStatus: 'closed',
          nextConnectionStatusMessage: closeReason,
        });
        return;
      }

      const needsInFlightRecovery = textSubmitStateRef.current === 'awaiting_ack'
        || textSubmitStateRef.current === 'awaiting_reply';
      shouldRecoverOnNextConnectRef.current = needsInFlightRecovery;
      setConnectionStatus('reconnecting');
      setConnectionStatusMessage(`reconnect scheduled (${runtimeConfig.reconnectDelayMs}ms)`);
      clearReconnectTimer();
      reconnectTimerRef.current = window.setTimeout(() => {
        if (connectionToken !== connectionTokenRef.current) {
          return;
        }
        connectRealtimeRef.current?.();
      }, runtimeConfig.reconnectDelayMs);
    });
  }, [
    applyRealtimeEnvelope,
    clearHeartbeatTimer,
    clearReconnectTimer,
    connectRealtimeRef,
    connectionStatusRef,
    connectionTokenRef,
    heartbeatTimerRef,
    invalidateLocalSession,
    manualCloseRef,
    reconnectTimerRef,
    runtimeConfig.heartbeatIntervalMs,
    runtimeConfig.reconnectDelayMs,
    runtimeConfig.wsUrl,
    sendHeartbeat,
    sessionStateRef,
    setConnectionStatus,
    setConnectionStatusMessage,
    setSessionErrorMessage,
    setSessionStatusMessage,
    shouldRecoverOnNextConnectRef,
    socketRef,
    t,
    teardownRealtime,
    textSubmitStateRef,
  ]);

  useEffect(() => {
    connectRealtimeRef.current = connectRealtime;
  }, [connectRealtime, connectRealtimeRef]);

  useEffect(() => {
    if (!activeSessionId || !activeTraceId) {
      teardownRealtime(true);
      teardownMicrophone();
      teardownCamera(true);
      clearAffectRefreshTimer();
      stopAssistantAudioPlayback();
      setLastHeartbeatAt(null);
      if (typeof window?.WebSocket === 'function') {
        if (connectionStatusRef.current === 'closed') {
          setConnectionStatus('closed');
        } else if (connectionStatusRef.current !== 'replay') {
          setConnectionStatus('idle');
          setConnectionStatusMessage('');
        }
      } else {
        setConnectionStatus('unsupported');
        setConnectionStatusMessage('WebSocket unsupported in current runtime');
      }
      return undefined;
    }

    if (connectionStatusRef.current === 'replay') {
      return undefined;
    }

    connectRealtime();
    return () => {
      teardownRealtime(true);
    };
  }, [
    activeSessionId,
    activeTraceId,
    clearAffectRefreshTimer,
    connectRealtime,
    connectionStatusRef,
    setConnectionStatus,
    setConnectionStatusMessage,
    setLastHeartbeatAt,
    stopAssistantAudioPlayback,
    teardownCamera,
    teardownMicrophone,
    teardownRealtime,
  ]);

  const createSession = useCallback(async () => {
    setSessionRequestState('creating');
    setSessionErrorMessage('');
    setSessionStatusMessage(t.sessionCreating);

    try {
      const payload = await requestSession(runtimeConfig.apiBaseUrl, selectedAvatarId);
      applySessionSnapshot({ session: payload, messages: [] }, t.sessionReady);
      setSessionRequestState('ready');
    } catch (error) {
      const nextErrorMessage = resolveSessionErrorMessage(error, t.sessionCreateFailed, t);
      setSessionState(null);
      setSessionRequestState('error');
      setSessionErrorMessage(nextErrorMessage);
      setSessionStatusMessage(nextErrorMessage);
      setConnectionStatus('idle');
      setConnectionStatusMessage('');
      setLastHeartbeatAt(null);
      setTextSubmitState('idle');
      setDialogueReplyState('idle');
      setPendingMessageId(null);
    }
  }, [
    applySessionSnapshot,
    runtimeConfig.apiBaseUrl,
    selectedAvatarId,
    setConnectionStatus,
    setConnectionStatusMessage,
    setDialogueReplyState,
    setLastHeartbeatAt,
    setPendingMessageId,
    setSessionErrorMessage,
    setSessionRequestState,
    setSessionState,
    setSessionStatusMessage,
    setTextSubmitState,
    t,
  ]);

  const clearSession = useCallback(() => {
    invalidateLocalSession();
  }, [invalidateLocalSession]);

  const submitText = useCallback(async () => {
    const contentText = inputText.trim();

    if (!contentText) {
      setTextSubmitState('error');
      setSessionErrorMessage(t.sessionSubmitEmpty);
      setSessionStatusMessage(t.sessionSubmitEmpty);
      return;
    }

    const activeSession = sessionStateRef.current?.session;
    const nextSessionId = activeSession?.session_id || storedSessionId;
    if (!nextSessionId) {
      setTextSubmitState('error');
      setSessionErrorMessage(t.sessionSubmitNeedSession);
      setSessionStatusMessage(t.sessionSubmitNeedSession);
      return;
    }

    if (connectionStatusRef.current !== 'connected') {
      setTextSubmitState('error');
      setSessionErrorMessage(t.sessionConnectionNotReady);
      setSessionStatusMessage(t.sessionConnectionNotReady);
      return;
    }

    if (textSubmitStateRef.current !== 'idle') {
      setTextSubmitState('error');
      setSessionErrorMessage(t.sessionBusy);
      setSessionStatusMessage(t.sessionBusy);
      return;
    }

    setSessionRequestState('submitting');
    setSessionErrorMessage('');
    setSessionStatusMessage(t.sessionSubmitting);
    setTextSubmitState('sending');
    setDialogueReplyState('idle');
    setPendingMessageId(null);

    try {
      const payload = await requestTextMessage(
        runtimeConfig.apiBaseUrl,
        nextSessionId,
        contentText,
        clientSeq,
      );
      shouldRecoverOnNextConnectRef.current = false;
      setSessionRequestState('ready');
      if (textSubmitStateRef.current === 'sending') {
        pendingMessageIdRef.current = payload?.message_id || null;
        setPendingMessageId(payload?.message_id || null);
        if (hasMessageId(sessionStateRef.current?.messages, payload?.message_id)) {
          textSubmitStateRef.current = 'awaiting_reply';
          setTextSubmitState('awaiting_reply');
        } else {
          textSubmitStateRef.current = 'awaiting_ack';
          setTextSubmitState('awaiting_ack');
        }
      }
      sendHeartbeat();
    } catch (error) {
      const nextErrorMessage = resolveSessionErrorMessage(error, t.sessionNetworkError, t);
      setSessionRequestState('error');
      setTextSubmitState('error');
      setDialogueReplyState('error');
      setSessionErrorMessage(nextErrorMessage);
      setSessionStatusMessage(nextErrorMessage);
    }
  }, [
    clientSeq,
    connectionStatusRef,
    inputText,
    pendingMessageIdRef,
    runtimeConfig.apiBaseUrl,
    sendHeartbeat,
    sessionStateRef,
    setDialogueReplyState,
    setPendingMessageId,
    setSessionErrorMessage,
    setSessionRequestState,
    setSessionStatusMessage,
    setTextSubmitState,
    shouldRecoverOnNextConnectRef,
    storedSessionId,
    t,
    textSubmitStateRef,
  ]);

  return {
    applyRealtimeEnvelope,
    clearSession,
    createSession,
    invalidateLocalSession,
    restoreSession,
    submitText,
    teardownRealtime,
  };
}
