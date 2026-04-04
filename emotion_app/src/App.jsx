import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sun, Wind, Leaf,
} from 'lucide-react';
import {
  requestSessionExport,
} from './sessionApi';

import {
  DEFAULT_EXPORT_MESSAGE,
  DEFAULT_REPLAY_MESSAGE,
  dialogueRiskLevels,
  dialogueStages,
  i18n,
} from './appContent';
import {
  buildExportFileName,
  buildReplaySequence,
  createInitialAffectSnapshot,
  createInitialFinalTranscriptState,
  createInitialKnowledgeState,
  createInitialPartialTranscriptState,
  getAvatarProfile,
  getReplayDelayMs,
  normalizeEmotionLabel,
  normalizeSessionStatePayload,
  normalizeUserAvatarId,
  readExportCache,
  readStoredUserAvatarId,
  resolveAppConfig,
  resolveAvatarExpressionPreset,
  resolveAvatarId,
  storeExportCache,
  triggerExportDownload,
  writeStoredUserAvatarId,
} from './appHelpers';
import AppHeader from './AppHeader';
import AssistantRepliesPanel from './AssistantRepliesPanel';
import AuthModal from './AuthModal';
import AvatarComposerPanel from './AvatarComposerPanel';
import CameraModal from './CameraModal';
import DeviceAffectPanel from './DeviceAffectPanel';
import MicModal from './MicModal';
import SessionRuntimePanel from './SessionRuntimePanel';
import { useAssistantAudioPlayback } from './useAssistantAudioPlayback';
import { useAudioRecording } from './useAudioRecording';
import { useCameraAffect } from './useCameraAffect';
import { useSessionRealtime } from './useSessionRealtime';

const BUBBLE_RESUME_DELAY_MS = 4000;

export default function App({ appConfig }) {
  // 语言状态管理
  const [lang, setLang] = useState('zh');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isUserAvatarMenuOpen, setIsUserAvatarMenuOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const t = i18n[lang];

  const [activeMessage, setActiveMessage] = useState(0);
  const [bubbleDisplayMode, setBubbleDisplayMode] = useState('auto');
  
  // 输入框与录音状态管理
  const [inputText, setInputText] = useState('');
  const [, setMicPermissionState] = useState('idle');
  const [, setMicPermissionMessage] = useState('');
  const [recordingState, setRecordingState] = useState('idle');
  const [audioUploadState, setAudioUploadState] = useState('idle');
  const [, setAudioUploadMessage] = useState('');
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [recordingChunkCount, setRecordingChunkCount] = useState(0);
  const [, setLastUploadedAt] = useState(null);
  const [, setLastUploadedMediaId] = useState(null);

  // 摄像头状态管理
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraPermissionState, setCameraPermissionState] = useState('idle');
  const [, setCameraPermissionMessage] = useState('');
  const [cameraState, setCameraState] = useState('idle');
  const [, setCameraPreviewMessage] = useState('');
  const [videoUploadState, setVideoUploadState] = useState('idle');
  const [, setVideoUploadMessage] = useState('');
  const [uploadedVideoFrameCount, setUploadedVideoFrameCount] = useState(0);
  const [, setLastUploadedVideoFrameId] = useState(null);
  const [, setLastVideoUploadedAt] = useState(null);
  const [nextVideoFrameSeq, setNextVideoFrameSeq] = useState(1);
  const modalVideoRef = useRef(null);
  const mainVideoRef = useRef(null);
  const persistentVideoRef = useRef(null);
  const sessionRuntimeVideoRef = useRef(null);
  const autoRestoreAttemptedRef = useRef(false);

  // 麦克风状态管理
  const [isMicModalOpen, setIsMicModalOpen] = useState(false);

  // 用户登录/注册状态管理
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'

  const [sessionState, setSessionState] = useState(null);
  const [sessionRequestState, setSessionRequestState] = useState('idle');
  const [sessionStatusMessage, setSessionStatusMessage] = useState('');
  const [sessionErrorMessage, setSessionErrorMessage] = useState('');
  const [storedSessionId, setStoredSessionId] = useState(null);
  const [clientSeq, setClientSeq] = useState(1);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [, setLastHeartbeatAt] = useState(null);
  const [textSubmitState, setTextSubmitState] = useState('idle');
  const [, setDialogueReplyState] = useState('idle');
  const [pendingMessageId, setPendingMessageId] = useState(null);
  const [connectionStatusMessage, setConnectionStatusMessage] = useState('');
  const [partialTranscriptState, setPartialTranscriptState] = useState(createInitialPartialTranscriptState);
  const [finalTranscriptState, setFinalTranscriptState] = useState(createInitialFinalTranscriptState);
  const [affectSnapshot, setAffectSnapshot] = useState(createInitialAffectSnapshot);
  const [, setAffectHistory] = useState([]);
  const [, setKnowledgeState] = useState(createInitialKnowledgeState);
  const [selectedAvatarId, setSelectedAvatarId] = useState(() => resolveAvatarId(appConfig?.defaultAvatarId));
  const [sessionAvatarId, setSessionAvatarId] = useState(null);
  const [ttsPlaybackState, setTtsPlaybackState] = useState('idle');
  const [, setTtsPlaybackMessage] = useState('');
  const [ttsAudioUrl, setTtsAudioUrl] = useState(null);
  const [ttsAudioFormat, setTtsAudioFormat] = useState('pending');
  const [ttsVoiceId, setTtsVoiceId] = useState('pending');
  const [ttsDurationMs, setTtsDurationMs] = useState(0);
  const [, setTtsGeneratedAt] = useState(null);
  const [ttsMessageId, setTtsMessageId] = useState(null);
  const [avatarMouthState, setAvatarMouthState] = useState('closed');
  const [, setExportState] = useState('idle');
  const [, setExportMessage] = useState(DEFAULT_EXPORT_MESSAGE);
  const [, setLastExportedAt] = useState(null);
  const [, setLastExportFileName] = useState(null);
  const [replayState, setReplayState] = useState('idle');
  const [, setReplayMessage] = useState(DEFAULT_REPLAY_MESSAGE);
  const [, setReplayEventCount] = useState(0);
  const [, setReplaySourceName] = useState(null);
  const [, setReplaySequenceLength] = useState(0);

  const socketRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const manualCloseRef = useRef(false);
  const connectionTokenRef = useRef(0);
  const connectRealtimeRef = useRef(null);
  const shouldRecoverOnNextConnectRef = useRef(false);
  const sessionStateRef = useRef(sessionState);
  const connectionStatusRef = useRef(connectionStatus);
  const textSubmitStateRef = useRef(textSubmitState);
  const pendingMessageIdRef = useRef(pendingMessageId);
  const recordingStateRef = useRef(recordingState);
  const audioUploadStateRef = useRef(audioUploadState);
  const recordingDurationMsRef = useRef(recordingDurationMs);
  const recordingChunkCountRef = useRef(recordingChunkCount);
  const micStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedAudioPartsRef = useRef([]);
  const pendingAudioUploadsRef = useRef(0);
  const previewInFlightRef = useRef(false);
  const finalizingAudioRef = useRef(false);
  const recordingTimerRef = useRef(null);
  const currentRecordingIdRef = useRef(null);
  const completedRecordingIdRef = useRef(null);
  const nextAudioChunkSeqRef = useRef(1);
  const nextPreviewSeqRef = useRef(1);
  const lastPreviewChunkCountRef = useRef(0);
  const recordingStartedAtMsRef = useRef(null);
  const stopRequestedRef = useRef(false);
  const cameraStateRef = useRef(cameraState);
  const videoUploadStateRef = useRef(videoUploadState);
  const uploadedVideoFrameCountRef = useRef(uploadedVideoFrameCount);
  const nextVideoFrameSeqRef = useRef(nextVideoFrameSeq);
  const cameraStreamRef = useRef(null);
  const cameraFrameTimerRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const cameraModalAutoStartRef = useRef(false);
  const pendingVideoUploadsRef = useRef(0);
  const affectRequestTokenRef = useRef(0);
  const affectRefreshTimerRef = useRef(null);
  const affectSnapshotTimestampRef = useRef(0);
  const pendingSessionAffectReasonRef = useRef(null);
  const assistantAudioRef = useRef(null);
  const ttsRequestTokenRef = useRef(0);
  const avatarMouthTimerRef = useRef(null);
  const avatarMouthCueSequenceRef = useRef([]);
  const avatarMouthPlaybackStartedAtRef = useRef(null);
  const ttsMessageIdRef = useRef(null);
  const ttsAudioUrlRef = useRef(null);
  const ttsPlaybackStateRef = useRef(ttsPlaybackState);
  const synthesizeAssistantAudioRef = useRef(null);
  const replayTimerRef = useRef(null);
  const replayRunIdRef = useRef(0);
  const bubbleResumeTimerRef = useRef(null);
  const pendingSubmittedTextRef = useRef('');
  const previousTextSubmitStateRef = useRef(textSubmitState);
  const previousTtsPlaybackStateRef = useRef(ttsPlaybackState);
  const previousAssistantMessageIdRef = useRef(null);
  const previousFinalTranscriptSignatureRef = useRef('');

  const runtimeConfig = useMemo(
    () => resolveAppConfig(appConfig, 'built-in defaults'),
    [appConfig],
  );
  const [selectedUserAvatarId, setSelectedUserAvatarId] = useState(() => readStoredUserAvatarId(
    resolveAppConfig(appConfig, 'built-in defaults').userAvatarStorageKey,
  ));

  const effectiveAvatarId = sessionAvatarId
    ? resolveAvatarId(sessionAvatarId, runtimeConfig.defaultAvatarId)
    : resolveAvatarId(selectedAvatarId, runtimeConfig.defaultAvatarId);
  const effectiveAvatarProfile = getAvatarProfile(effectiveAvatarId, runtimeConfig.defaultAvatarId);
  const latestAssistantReplyMetadata = useMemo(() => {
    const messages = Array.isArray(sessionState?.messages) ? sessionState.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidateMessage = messages[index];
      if (
        candidateMessage?.role === 'assistant'
        && candidateMessage.metadata
        && typeof candidateMessage.metadata === 'object'
      ) {
        return candidateMessage.metadata;
      }
    }
    return {};
  }, [sessionState]);
  const currentAvatarStage = dialogueStages.has(sessionState?.session?.stage)
    ? sessionState.session.stage
    : latestAssistantReplyMetadata.stage;
  const currentAvatarRiskLevel = dialogueRiskLevels.has(latestAssistantReplyMetadata.risk_level)
    ? latestAssistantReplyMetadata.risk_level
    : affectSnapshot.fusion.riskLevel;
  const currentAvatarEmotion = normalizeEmotionLabel(latestAssistantReplyMetadata.emotion) !== 'pending'
    ? latestAssistantReplyMetadata.emotion
    : affectSnapshot.fusion.emotionState;
  const currentAvatarStageLabel = currentAvatarStage || affectSnapshot.currentStage || 'idle';
  const currentAvatarExpressionPreset = resolveAvatarExpressionPreset({
    stage: currentAvatarStageLabel,
    riskLevel: currentAvatarRiskLevel,
    emotion: currentAvatarEmotion,
  });

  const activeSessionId = sessionState?.session?.session_id || null;
  const activeTraceId = sessionState?.session?.trace_id || null;
  const sessionSummary = sessionState?.session || null;
  const sessionMessages = Array.isArray(sessionState?.messages) ? sessionState.messages : [];
  const latestAssistantMessage = [...sessionMessages].reverse().find((message) => message.role === 'assistant') || null;
  const latestUserMessage = [...sessionMessages].reverse().find((message) => message.role === 'user') || null;
  const avatarSpeechState = ttsPlaybackState === 'playing'
    ? 'speaking'
    : ttsPlaybackState === 'completed'
      ? 'completed'
      : 'idle';
  const normalizedAffectEmotion = normalizeEmotionLabel(affectSnapshot.fusion.emotionState);
  const hasResolvedEmotion = ![
    'pending',
    'pending_multimodal',
    'observe_more',
    'needs_clarification',
  ].includes(normalizedAffectEmotion);
  const hasResolvedEmotionDetail = hasResolvedEmotion
    && typeof affectSnapshot.fusion.detail === 'string'
    && affectSnapshot.fusion.detail.trim()
    && !/等待|调试|占位|waiting|debug|placeholder/i.test(affectSnapshot.fusion.detail);
  const hasResolvedEmotionQuote = hasResolvedEmotion
    && typeof affectSnapshot.sourceContext.note === 'string'
    && affectSnapshot.sourceContext.note.trim()
    && !/等待|调试|样本信息|waiting for session sample information|sample information|debug/i.test(affectSnapshot.sourceContext.note);
  const displayedEmotionLabel = hasResolvedEmotion
    ? affectSnapshot.fusion.emotionState
    : t.emoState;
  const displayedEmotionDetail = hasResolvedEmotionDetail
    ? affectSnapshot.fusion.detail
    : t.emoDesc;
  const displayedEmotionQuote = hasResolvedEmotionQuote
    ? affectSnapshot.sourceContext.note
    : t.emoQuote;
  const hasPendingSubmittedText = [
    'sending',
    'awaiting_ack',
    'awaiting_reply',
  ].includes(textSubmitState) && Boolean(pendingSubmittedTextRef.current);
  const liveTranscriptText = isMicModalOpen
    ? ''
    : (partialTranscriptState.status === 'streaming' && partialTranscriptState.text
      ? partialTranscriptState.text
      : (finalTranscriptState.sourceKind === 'test_audio' ? '' : finalTranscriptState.text)
        || (hasPendingSubmittedText ? pendingSubmittedTextRef.current : '')
        || latestUserMessage?.content_text
        || '');
  const micTestTranscriptText = finalTranscriptState.sourceKind === 'test_audio'
    ? finalTranscriptState.text
    : (isMicModalOpen && partialTranscriptState.text ? partialTranscriptState.text : '');

  const storedSessionNotice = sessionErrorMessage ? '' : (storedSessionId ? t.restoreReady : t.noStoredSession);
  const interactionLocked = sessionRequestState === 'creating'
    || sessionRequestState === 'restoring'
    || replayState === 'running';
  const replayLocked = connectionStatus === 'replay' || replayState === 'running';
  const hasReplayCache = Boolean(readExportCache(runtimeConfig.exportCacheStorageKey)?.payload);
  const canSubmitText = Boolean(inputText.trim())
    && activeSessionId
    && connectionStatus === 'connected'
    && textSubmitState === 'idle'
    && !interactionLocked
    && !replayLocked;
  const selectedAvatarProfile = getAvatarProfile(selectedAvatarId, runtimeConfig.defaultAvatarId);
  const localizedSelectedAvatarProfile = useMemo(() => ({
    ...selectedAvatarProfile,
    label: selectedAvatarProfile?.profileId === 'coach' ? t.avatarCoachLabel : t.avatarCompanionLabel,
    stageNote: selectedAvatarProfile?.profileId === 'coach' ? t.avatarCoachStageNote : t.avatarCompanionStageNote,
  }), [
    selectedAvatarProfile,
    t.avatarCoachLabel,
    t.avatarCoachStageNote,
    t.avatarCompanionLabel,
    t.avatarCompanionStageNote,
  ]);
  const localizedEffectiveAvatarProfile = useMemo(() => ({
    ...effectiveAvatarProfile,
    label: effectiveAvatarProfile?.profileId === 'coach' ? t.avatarCoachLabel : t.avatarCompanionLabel,
    stageNote: effectiveAvatarProfile?.profileId === 'coach' ? t.avatarCoachStageNote : t.avatarCompanionStageNote,
  }), [
    effectiveAvatarProfile,
    t.avatarCoachLabel,
    t.avatarCoachStageNote,
    t.avatarCompanionLabel,
    t.avatarCompanionStageNote,
  ]);
  const normalizedSelectedUserAvatarId = normalizeUserAvatarId(selectedUserAvatarId);
  const resolvedUserAvatarId = normalizedSelectedUserAvatarId;
  const resolvedActiveMessage = bubbleDisplayMode === 'auto'
    ? activeMessage
    : bubbleDisplayMode === 'assistant'
      ? 1
      : 0;

  const formatRoleLabel = useCallback((role) => {
    if (role === 'assistant') {
      return t.assistantRoleLabel;
    }
    if (role === 'user') {
      return t.userRoleLabel;
    }
    return t.systemRoleLabel;
  }, [t.assistantRoleLabel, t.systemRoleLabel, t.userRoleLabel]);

  const clearReplayTimer = useCallback(() => {
    if (replayTimerRef.current) {
      window.clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }
  }, []);

  const clearBubbleResumeTimer = useCallback(() => {
    if (bubbleResumeTimerRef.current) {
      window.clearTimeout(bubbleResumeTimerRef.current);
      bubbleResumeTimerRef.current = null;
    }
  }, []);

  const resetReplayState = useCallback((message = DEFAULT_REPLAY_MESSAGE) => {
    replayRunIdRef.current += 1;
    clearReplayTimer();
    setReplayState('idle');
    setReplayMessage(message);
    setReplayEventCount(0);
    setReplaySourceName(null);
    setReplaySequenceLength(0);
  }, [clearReplayTimer]);

  const finishReplay = useCallback((sequenceLength) => {
    replayRunIdRef.current += 1;
    clearReplayTimer();
    clearBubbleResumeTimer();
    pendingSubmittedTextRef.current = '';
    pendingMessageIdRef.current = null;
    textSubmitStateRef.current = 'idle';
    setSessionState((previousState) => {
      const baseState = normalizeSessionStatePayload(previousState);
      return baseState.session
        ? {
          ...baseState,
          session: {
            ...baseState.session,
            status: 'replay_ready',
            updated_at: new Date().toISOString(),
          },
        }
        : baseState;
    });
    setReplayState('completed');
    setReplaySequenceLength(sequenceLength);
    setReplayEventCount(sequenceLength);
    setReplayMessage(`回放完成：共重现 ${sequenceLength} 个事件。`);
    connectionStatusRef.current = 'replay';
    setConnectionStatus('replay');
    setConnectionStatusMessage('replay completed');
    setSessionRequestState('ready');
    setSessionStatusMessage(t.replayComplete);
    setTextSubmitState('idle');
    setPendingMessageId(null);
    setBubbleDisplayMode('auto');
  }, [clearBubbleResumeTimer, clearReplayTimer, t.replayComplete]);

  const {
    stopAssistantAudioPlayback,
    stopAvatarMouthAnimation,
  } = useAssistantAudioPlayback({
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
  });

  const {
    handleMicAction,
    handleMicTestAction,
    teardownMicrophone,
  } = useAudioRecording({
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
  });

  const {
    applyAffectSnapshot,
    clearAffectRefreshTimer,
    scheduleAffectRefresh,
    startCameraPreview,
    stopCameraPreview,
    teardownCamera,
  } = useCameraAffect({
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
    persistentVideoRef,
    sessionRuntimeVideoRef,
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
  });

  const {
    applyRealtimeEnvelope,
    clearSession,
    createSession,
    restoreSession,
    submitText,
    teardownRealtime,
  } = useSessionRealtime({
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
  });

  useEffect(() => {
    pendingMessageIdRef.current = pendingMessageId;
  }, [pendingMessageId]);

  useEffect(() => () => {
    clearReplayTimer();
    clearBubbleResumeTimer();
    teardownMicrophone();
    teardownCamera(true);
    clearAffectRefreshTimer();
    stopAssistantAudioPlayback();
  }, [clearAffectRefreshTimer, clearBubbleResumeTimer, clearReplayTimer, stopAssistantAudioPlayback, teardownCamera, teardownMicrophone]);

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setActiveMessage((prev) => (prev === 0 ? 1 : 0));
    }, 6000);
    return () => clearInterval(msgInterval);
  }, []);

  useEffect(() => {
    writeStoredUserAvatarId(runtimeConfig.userAvatarStorageKey, normalizedSelectedUserAvatarId);
  }, [normalizedSelectedUserAvatarId, runtimeConfig.userAvatarStorageKey]);

  useEffect(() => {
    const previousTextSubmitState = previousTextSubmitStateRef.current;
    if (textSubmitState === 'sending' && previousTextSubmitState !== 'sending') {
      clearBubbleResumeTimer();
      pendingSubmittedTextRef.current = inputText.trim();
      setBubbleDisplayMode('user');
    }
    if (textSubmitState === 'error') {
      clearBubbleResumeTimer();
      pendingSubmittedTextRef.current = '';
      setBubbleDisplayMode('auto');
    }
    previousTextSubmitStateRef.current = textSubmitState;
  }, [clearBubbleResumeTimer, inputText, textSubmitState]);

  useEffect(() => {
    const finalTranscriptSignature = finalTranscriptState.sourceKind === 'test_audio'
      ? ''
      : `${finalTranscriptState.sourceKind || ''}:${finalTranscriptState.recordingId || ''}:${finalTranscriptState.messageId || ''}:${finalTranscriptState.updatedAt || ''}:${finalTranscriptState.text || ''}`;
    if (
      finalTranscriptSignature
      && finalTranscriptSignature !== previousFinalTranscriptSignatureRef.current
      && finalTranscriptState.text
    ) {
      clearBubbleResumeTimer();
      setBubbleDisplayMode('user');
    }
    previousFinalTranscriptSignatureRef.current = finalTranscriptSignature;
  }, [clearBubbleResumeTimer, finalTranscriptState]);

  useEffect(() => {
    const assistantMessageId = latestAssistantMessage?.message_id || '';
    if (
      assistantMessageId
      && assistantMessageId !== previousAssistantMessageIdRef.current
      && bubbleDisplayMode !== 'auto'
    ) {
      clearBubbleResumeTimer();
      pendingSubmittedTextRef.current = '';
      setBubbleDisplayMode('assistant');
    }
    previousAssistantMessageIdRef.current = assistantMessageId;
  }, [bubbleDisplayMode, clearBubbleResumeTimer, latestAssistantMessage]);

  useEffect(() => {
    const previousTtsPlaybackState = previousTtsPlaybackStateRef.current;
    if (ttsPlaybackState === 'completed' && previousTtsPlaybackState !== 'completed') {
      clearBubbleResumeTimer();
      bubbleResumeTimerRef.current = window.setTimeout(() => {
        bubbleResumeTimerRef.current = null;
        pendingSubmittedTextRef.current = '';
        setBubbleDisplayMode('auto');
      }, BUBBLE_RESUME_DELAY_MS);
    }
    previousTtsPlaybackStateRef.current = ttsPlaybackState;
  }, [clearBubbleResumeTimer, ttsPlaybackState]);

  useEffect(() => {
    if (!activeSessionId || replayState === 'running' || connectionStatus === 'replay') {
      clearBubbleResumeTimer();
      pendingSubmittedTextRef.current = '';
      setBubbleDisplayMode('auto');
    }
  }, [activeSessionId, clearBubbleResumeTimer, connectionStatus, replayState]);

  const scheduleReplayStep = useCallback((sequence, index, runId, sourceName) => {
    if (runId !== replayRunIdRef.current) {
      return;
    }
    if (index >= sequence.length) {
      finishReplay(sequence.length);
      return;
    }
    const previousEnvelope = index > 0 ? sequence[index - 1] : null;
    const nextEnvelope = sequence[index];
    const delayMs = index === 0
      ? runtimeConfig.replayDelayMinMs
      : getReplayDelayMs(runtimeConfig, previousEnvelope, nextEnvelope);
    replayTimerRef.current = window.setTimeout(() => {
      replayTimerRef.current = null;
      if (runId !== replayRunIdRef.current) {
        return;
      }
      applyRealtimeEnvelope(nextEnvelope, {
        mode: 'replay',
        triggerTts: false,
      });
      setReplayEventCount(index + 1);
      setReplayMessage(`正在回放 ${sourceName || '导出会话'}（${index + 1}/${sequence.length}）`);
      scheduleReplayStep(sequence, index + 1, runId, sourceName);
    }, delayMs);
  }, [applyRealtimeEnvelope, finishReplay, runtimeConfig]);

  const startReplayFromExport = useCallback(async () => {
    const cachedExport = readExportCache(runtimeConfig.exportCacheStorageKey);
    if (!cachedExport || !cachedExport.payload) {
      setReplayState('error');
      setReplayMessage('未找到可回放的导出 JSON，请先执行 Export。');
      return false;
    }

    const exportPayload = cachedExport.payload;
    const replaySequence = buildReplaySequence(exportPayload);
    if (!replaySequence.length) {
      setReplayState('error');
      setReplayMessage('导出 JSON 中没有可回放的事件或消息。');
      return false;
    }

    teardownRealtime(true);
    clearAffectRefreshTimer();
    affectRequestTokenRef.current += 1;
    ttsRequestTokenRef.current += 1;
    clearReplayTimer();
    clearBubbleResumeTimer();
    pendingSubmittedTextRef.current = '';
    teardownCamera(true);
    teardownMicrophone();
    stopAssistantAudioPlayback();
    ttsAudioUrlRef.current = null;
    ttsMessageIdRef.current = null;
    avatarMouthCueSequenceRef.current = [];
    setIsCameraModalOpen(false);
    setIsMicModalOpen(false);

    const replaySessionId = exportPayload.session_id || 'replay_session';
    const replayAvatarId = resolveAvatarId(exportPayload.avatar_id || selectedAvatarId, runtimeConfig.defaultAvatarId);
    const replayTraceId = exportPayload.trace_id || null;
    const replayStartedAt = exportPayload.started_at || exportPayload.exported_at || null;
    const fileName = cachedExport.fileName || buildExportFileName(replaySessionId, exportPayload.exported_at);

    shouldRecoverOnNextConnectRef.current = false;
    pendingSessionAffectReasonRef.current = null;
    sessionStateRef.current = {
      session: {
        session_id: replaySessionId,
        trace_id: replayTraceId,
        status: 'replay_loading',
        stage: 'engage',
        avatar_id: replayAvatarId,
        started_at: replayStartedAt,
        updated_at: replayStartedAt,
      },
      messages: [],
    };
    connectionStatusRef.current = 'replay';
    textSubmitStateRef.current = 'idle';
    pendingMessageIdRef.current = null;
    ttsAudioUrlRef.current = null;
    ttsMessageIdRef.current = null;
    avatarMouthCueSequenceRef.current = [];
    affectSnapshotTimestampRef.current = 0;

    setSessionState(sessionStateRef.current);
    setSessionAvatarId(replayAvatarId);
    setSelectedAvatarId(replayAvatarId);
    setSessionRequestState('ready');
    setSessionErrorMessage('');
    setSessionStatusMessage(t.replayModeActive);
    setClientSeq(1);
    setTextSubmitState('idle');
    setDialogueReplyState('idle');
    setPendingMessageId(null);
    setLastHeartbeatAt(null);
    setConnectionStatus('replay');
    setConnectionStatusMessage(`replay source loaded: ${fileName}`);
    setPartialTranscriptState(createInitialPartialTranscriptState());
    setFinalTranscriptState(createInitialFinalTranscriptState());
    setAffectSnapshot(createInitialAffectSnapshot());
    setAffectHistory([]);
    setKnowledgeState(createInitialKnowledgeState());
    setTtsPlaybackState('idle');
    setTtsPlaybackMessage('回放模式准备中。');
    setTtsAudioUrl(null);
    setTtsAudioFormat('pending');
    setTtsVoiceId(getAvatarProfile(replayAvatarId, runtimeConfig.defaultAvatarId).voicePreview);
    setTtsDurationMs(0);
    setTtsGeneratedAt(null);
    setTtsMessageId(null);
    setAvatarMouthState('closed');
    setExportState('exported');
    setExportMessage(`已加载回放源: ${fileName}`);
    setLastExportedAt(exportPayload.exported_at || null);
    setLastExportFileName(fileName);
    setReplayState('running');
    setReplayEventCount(0);
    setReplaySourceName(fileName);
    setReplaySequenceLength(replaySequence.length);
    setReplayMessage(`准备回放 ${fileName}。`);
    setBubbleDisplayMode('auto');

    const runId = replayRunIdRef.current + 1;
    replayRunIdRef.current = runId;
    scheduleReplayStep(replaySequence, 0, runId, fileName);
    return true;
  }, [clearAffectRefreshTimer, clearBubbleResumeTimer, clearReplayTimer, runtimeConfig.exportCacheStorageKey, runtimeConfig.defaultAvatarId, scheduleReplayStep, selectedAvatarId, stopAssistantAudioPlayback, t.replayModeActive, teardownCamera, teardownMicrophone, teardownRealtime]);

  const exportSession = useCallback(async () => {
    if (!activeSessionId) {
      setExportState('error');
      setExportMessage('请先创建或恢复会话。');
      return false;
    }

    setExportState('loading');
    setExportMessage(null);

    try {
      const payload = await requestSessionExport(runtimeConfig.apiBaseUrl, activeSessionId);
      const fileName = buildExportFileName(activeSessionId, payload.exported_at);
      storeExportCache(runtimeConfig.exportCacheStorageKey, payload, fileName);
      triggerExportDownload(payload, fileName);
      setExportState('exported');
      setLastExportedAt(payload.exported_at || new Date().toISOString());
      setLastExportFileName(fileName);
      setExportMessage(`导出成功: ${fileName}`);
      setReplayState('idle');
      setReplayMessage(`导出缓存已更新，可回放 ${fileName}。`);
      setReplaySourceName(fileName);
      setReplaySequenceLength(0);
      setReplayEventCount(0);
      setConnectionStatusMessage(`session exported: ${activeSessionId}`);
      return true;
    } catch (error) {
      setExportState('error');
      setExportMessage(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [activeSessionId, runtimeConfig.apiBaseUrl, runtimeConfig.exportCacheStorageKey]);

  return (
    <div
      className="min-h-screen bg-[#FDFBF7] text-[#5C4D42] font-sans relative overflow-hidden selection:bg-orange-200"
      onClick={() => {
        setIsLangMenuOpen(false);
        setIsUserAvatarMenuOpen(false);
      }}
    >
      {/* 自定义呼吸动画样式 */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes breathe {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        .animate-breathe {
          animation: breathe 4s ease-in-out infinite;
        }
        .animate-breathe-delayed {
          animation: breathe 4.5s ease-in-out infinite 1s;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #fdfbf7; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5d8c8; 
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d4c3b3; 
        }
      `}} />

      {/* 背景治愈系装饰元素 */}
      <div className="absolute top-10 left-10 text-orange-200/40 pointer-events-none">
        <Sun size={120} strokeWidth={1} />
      </div>
      <div className="absolute bottom-20 right-10 text-green-200/40 pointer-events-none">
        <Leaf size={100} strokeWidth={1} />
      </div>
      <div className="absolute top-1/3 right-1/4 text-amber-200/30 pointer-events-none">
        <Wind size={80} strokeWidth={1} />
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 relative z-10 flex flex-col gap-8">
        
        <AppHeader
          isLangMenuOpen={isLangMenuOpen}
          isLoggedIn={isLoggedIn}
          isTimelineOpen={isTimelineOpen}
          isUserAvatarMenuOpen={isUserAvatarMenuOpen}
          lang={lang}
          onAuthOpen={() => {
            setAuthMode('login');
            setIsAuthModalOpen(true);
          }}
          onHomeOpen={() => setIsTimelineOpen(false)}
          onSelectLang={(nextLang) => {
            setLang(nextLang);
            setIsLangMenuOpen(false);
          }}
          onSelectUserAvatar={(nextUserAvatarId) => {
            setSelectedUserAvatarId(normalizeUserAvatarId(nextUserAvatarId));
            setIsUserAvatarMenuOpen(false);
          }}
          onTimelineOpen={() => setIsTimelineOpen((previous) => !previous)}
          onToggleLangMenu={() => {
            setIsUserAvatarMenuOpen(false);
            setIsLangMenuOpen((previous) => !previous);
          }}
          onToggleUserAvatarMenu={() => {
            setIsLangMenuOpen(false);
            setIsUserAvatarMenuOpen((previous) => !previous);
          }}
          selectedUserAvatarId={resolvedUserAvatarId}
          t={t}
        />

        {isTimelineOpen ? (
          <AssistantRepliesPanel
            formatRoleLabel={formatRoleLabel}
            sessionMessages={sessionMessages}
            t={t}
          />
        ) : (
          <SessionRuntimePanel
            cameraState={cameraState}
            clearSession={clearSession}
            createSession={createSession}
            effectiveAvatarProfile={localizedEffectiveAvatarProfile}
            exportSession={exportSession}
            handleAvatarSelection={setSelectedAvatarId}
            hasReplayCache={hasReplayCache}
            interactionLocked={interactionLocked}
            onCloseCameraPreview={() => {
              stopCameraPreview();
              setIsCameraModalOpen(false);
            }}
            onOpenCameraModal={() => setIsCameraModalOpen(true)}
            onOpenMicModal={() => setIsMicModalOpen(true)}
            replayState={replayState}
            replayLocked={replayLocked}
            restoreSession={restoreSession}
            runtimeVideoRef={sessionRuntimeVideoRef}
            selectedAvatarId={selectedAvatarId}
            selectedAvatarProfile={localizedSelectedAvatarProfile}
            sessionErrorMessage={sessionErrorMessage}
            sessionRequestState={sessionRequestState}
            sessionStatusMessage={sessionStatusMessage}
            sessionSummary={sessionSummary}
            startReplayFromExport={startReplayFromExport}
            storedSessionId={storedSessionId}
            storedSessionNotice={storedSessionNotice}
            t={t}
            textSubmitState={textSubmitState}
          >
            <DeviceAffectPanel
              affectSnapshot={affectSnapshot}
              displayedEmotionDetail={displayedEmotionDetail}
              displayedEmotionLabel={displayedEmotionLabel}
              displayedEmotionQuote={displayedEmotionQuote}
              t={t}
              variant="emotionOnly"
            />
          </SessionRuntimePanel>
        )}

        <AvatarComposerPanel
          activeMessage={resolvedActiveMessage}
          assistantAudioRef={assistantAudioRef}
          avatarProfile={localizedSelectedAvatarProfile}
          avatarMouthState={avatarMouthState}
          avatarSpeechState={avatarSpeechState}
          canSubmitText={canSubmitText}
          handleMicAction={handleMicAction}
          inputText={inputText}
          latestAssistantMessage={latestAssistantMessage}
          liveTranscriptText={liveTranscriptText}
          onInputChange={setInputText}
          recordingDurationMs={recordingDurationMs}
          recordingState={recordingState}
          replayLocked={replayLocked}
          submitText={submitText}
          t={t}
          textSubmitState={textSubmitState}
          userAvatarId={resolvedUserAvatarId}
        />

      </div>

      {/* Keep a mounted preview host so real frame capture survives view switches. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-[-9999px] top-0 h-px w-px overflow-hidden opacity-0"
      >
        <video ref={persistentVideoRef} autoPlay playsInline muted />
      </div>

      <CameraModal
        cameraPermissionState={cameraPermissionState}
        cameraState={cameraState}
        isOpen={isCameraModalOpen}
        modalVideoRef={modalVideoRef}
        onClose={() => setIsCameraModalOpen(false)}
        onTogglePreview={() => {
          if (!replayLocked) {
            if (cameraState === 'previewing') {
              stopCameraPreview();
            } else {
              void startCameraPreview();
            }
          }
        }}
        replayLocked={replayLocked}
        t={t}
      />

      <MicModal
        isOpen={isMicModalOpen}
        isTesting
        liveTranscriptText={micTestTranscriptText}
        onClose={() => {
          if (recordingState === 'recording') {
            void handleMicTestAction();
          }
          setIsMicModalOpen(false);
        }}
        onToggleRecording={() => {
          if (!replayLocked) {
            void handleMicTestAction();
          }
        }}
        recordingState={recordingState}
        replayLocked={replayLocked}
        t={t}
      />

      <AuthModal
        authMode={authMode}
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSubmit={(e) => {
          e.preventDefault();
          setIsLoggedIn(true);
          setIsAuthModalOpen(false);
        }}
        onSwitchMode={setAuthMode}
        t={t}
      />

    </div>
  );
}
