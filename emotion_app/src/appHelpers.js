import {
  avatarExpressionPresets,
  avatarProfiles,
  dialogueRiskLevels,
  dialogueStages,
} from './appContent';

const defaultAppConfig = {
  apiBaseUrl: 'http://127.0.0.1:8000',
  wsUrl: 'ws://127.0.0.1:8000/ws',
  asrBaseUrl: 'http://127.0.0.1:8020',
  ttsBaseUrl: 'http://127.0.0.1:8040',
  affectBaseUrl: 'http://127.0.0.1:8060',
  defaultAvatarId: 'companion_female_01',
  activeSessionStorageKey: 'virtual-human-active-session-id',
  exportCacheStorageKey: 'virtual-human-last-export',
  userAvatarStorageKey: 'virtual-human-user-avatar-id',
  heartbeatIntervalMs: 5000,
  reconnectDelayMs: 1000,
  enableAudioFinalize: true,
  enableAudioPreview: true,
  audioPreviewChunkThreshold: 2,
  videoFrameUploadIntervalMs: 1800,
  autoplayAssistantAudio: true,
  replayDelayScale: 0.25,
  replayDelayMinMs: 120,
  replayDelayMaxMs: 850,
};

export function readStringConfigValue(config, keys, fallback) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

export function readNumberConfigValue(config, keys, fallback) {
  for (const key of keys) {
    const rawValue = config[key];
    const numericValue = Number(rawValue);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return numericValue;
    }
  }
  return fallback;
}

export function readBooleanConfigValue(config, keys, fallback) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return fallback;
}

export function resolveAppConfig(config, fallbackSourceLabel = 'built-in defaults') {
  const nextConfig = config && typeof config === 'object' ? config : {};

  return {
    sourceLabel: readStringConfigValue(nextConfig, ['sourceLabel', 'source_label'], fallbackSourceLabel),
    apiBaseUrl: readStringConfigValue(
      nextConfig,
      ['apiBaseUrl', 'gatewayBaseUrl', 'api_base_url'],
      defaultAppConfig.apiBaseUrl,
    ),
    wsUrl: readStringConfigValue(nextConfig, ['wsUrl', 'ws_url'], defaultAppConfig.wsUrl),
    asrBaseUrl: readStringConfigValue(
      nextConfig,
      ['asrBaseUrl', 'asr_base_url'],
      defaultAppConfig.asrBaseUrl,
    ),
    ttsBaseUrl: readStringConfigValue(
      nextConfig,
      ['ttsBaseUrl', 'tts_base_url'],
      defaultAppConfig.ttsBaseUrl,
    ),
    affectBaseUrl: readStringConfigValue(
      nextConfig,
      ['affectBaseUrl', 'affect_base_url'],
      defaultAppConfig.affectBaseUrl,
    ),
    defaultAvatarId: readStringConfigValue(
      nextConfig,
      ['defaultAvatarId', 'default_avatar_id'],
      defaultAppConfig.defaultAvatarId,
    ),
    activeSessionStorageKey: readStringConfigValue(
      nextConfig,
      ['activeSessionStorageKey', 'active_session_storage_key'],
      defaultAppConfig.activeSessionStorageKey,
    ),
    exportCacheStorageKey: readStringConfigValue(
      nextConfig,
      ['exportCacheStorageKey', 'export_cache_storage_key'],
      defaultAppConfig.exportCacheStorageKey,
    ),
    userAvatarStorageKey: readStringConfigValue(
      nextConfig,
      ['userAvatarStorageKey', 'user_avatar_storage_key'],
      defaultAppConfig.userAvatarStorageKey,
    ),
    heartbeatIntervalMs: readNumberConfigValue(
      nextConfig,
      ['heartbeatIntervalMs', 'heartbeat_interval_ms'],
      defaultAppConfig.heartbeatIntervalMs,
    ),
    reconnectDelayMs: readNumberConfigValue(
      nextConfig,
      ['reconnectDelayMs', 'reconnect_delay_ms'],
      defaultAppConfig.reconnectDelayMs,
    ),
    enableAudioFinalize: readBooleanConfigValue(
      nextConfig,
      ['enableAudioFinalize', 'enable_audio_finalize'],
      defaultAppConfig.enableAudioFinalize,
    ),
    enableAudioPreview: readBooleanConfigValue(
      nextConfig,
      ['enableAudioPreview', 'enable_audio_preview'],
      defaultAppConfig.enableAudioPreview,
    ),
    audioPreviewChunkThreshold: readNumberConfigValue(
      nextConfig,
      ['audioPreviewChunkThreshold', 'audio_preview_chunk_threshold'],
      defaultAppConfig.audioPreviewChunkThreshold,
    ),
    videoFrameUploadIntervalMs: readNumberConfigValue(
      nextConfig,
      ['videoFrameUploadIntervalMs', 'video_frame_upload_interval_ms'],
      defaultAppConfig.videoFrameUploadIntervalMs,
    ),
    autoplayAssistantAudio: readBooleanConfigValue(
      nextConfig,
      ['autoplayAssistantAudio', 'autoplay_assistant_audio'],
      defaultAppConfig.autoplayAssistantAudio,
    ),
    replayDelayScale: readNumberConfigValue(
      nextConfig,
      ['replayDelayScale', 'replay_delay_scale'],
      defaultAppConfig.replayDelayScale,
    ),
    replayDelayMinMs: readNumberConfigValue(
      nextConfig,
      ['replayDelayMinMs', 'replay_delay_min_ms'],
      defaultAppConfig.replayDelayMinMs,
    ),
    replayDelayMaxMs: readNumberConfigValue(
      nextConfig,
      ['replayDelayMaxMs', 'replay_delay_max_ms'],
      defaultAppConfig.replayDelayMaxMs,
    ),
  };
}

export function normalizeMessage(message) {
  const metadata = message?.metadata && typeof message.metadata === 'object'
    ? message.metadata
    : {};

  return {
    message_id: typeof message?.message_id === 'string' ? message.message_id : '',
    session_id: typeof message?.session_id === 'string' ? message.session_id : null,
    trace_id: typeof message?.trace_id === 'string' ? message.trace_id : null,
    role: typeof message?.role === 'string' ? message.role : 'system',
    status: typeof message?.status === 'string' ? message.status : null,
    source_kind: typeof message?.source_kind === 'string' ? message.source_kind : 'text',
    content_text: typeof message?.content_text === 'string' ? message.content_text : '',
    submitted_at: message?.submitted_at || null,
    metadata,
  };
}

export function upsertMessageById(messages, nextMessage) {
  if (!nextMessage?.message_id) {
    return Array.isArray(messages) ? messages : [];
  }

  const currentMessages = Array.isArray(messages) ? messages : [];
  const existingIndex = currentMessages.findIndex(
    (message) => message?.message_id === nextMessage.message_id,
  );

  if (existingIndex === -1) {
    return [...currentMessages, nextMessage];
  }

  const nextMessages = [...currentMessages];
  nextMessages[existingIndex] = {
    ...nextMessages[existingIndex],
    ...nextMessage,
    metadata: nextMessage.metadata || nextMessages[existingIndex]?.metadata || {},
  };
  return nextMessages;
}

export function hasMessageId(messages, messageId) {
  if (!messageId) {
    return false;
  }
  return Array.isArray(messages)
    && messages.some((message) => message?.message_id === messageId);
}

export function normalizeSessionStatePayload(payload) {
  const session = payload?.session && typeof payload.session === 'object'
    ? payload.session
    : null;
  const messages = Array.isArray(payload?.messages)
    ? payload.messages.reduce((items, message) => upsertMessageById(items, normalizeMessage(message)), [])
    : [];

  return {
    session,
    messages,
  };
}

export function buildAcceptedMessageFromEnvelope(envelope) {
  const payload = envelope?.payload && typeof envelope.payload === 'object'
    ? envelope.payload
    : null;
  const messageId = payload?.message_id || envelope?.message_id;

  if (typeof messageId !== 'string' || !messageId.trim()) {
    return null;
  }

  return normalizeMessage({
    message_id: messageId,
    session_id: payload?.session_id || envelope?.session_id || null,
    trace_id: payload?.trace_id || envelope?.trace_id || null,
    role: payload?.role || 'user',
    status: payload?.status || 'accepted',
    source_kind: payload?.source_kind || 'text',
    content_text: payload?.content_text || '',
    submitted_at: payload?.submitted_at || envelope?.emitted_at || null,
    metadata: payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
  });
}

export function buildReplyMessageFromEnvelope(envelope) {
  const payload = envelope?.payload && typeof envelope.payload === 'object'
    ? envelope.payload
    : null;
  const messageId = payload?.message_id || envelope?.message_id;
  const replyText = payload?.reply;

  if (
    typeof messageId !== 'string'
    || !messageId.trim()
    || typeof replyText !== 'string'
    || !replyText.trim()
  ) {
    return null;
  }

  return normalizeMessage({
    message_id: messageId,
    session_id: payload?.session_id || envelope?.session_id || null,
    trace_id: payload?.trace_id || envelope?.trace_id || null,
    role: 'assistant',
    status: 'completed',
    source_kind: 'text',
    content_text: replyText,
    submitted_at: payload?.submitted_at || envelope?.emitted_at || null,
    metadata: {
      stage: payload?.stage,
      emotion: payload?.emotion,
      risk_level: payload?.risk_level,
      next_action: payload?.next_action,
    },
  });
}

export function validateTranscriptPartialPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (payload.transcript_kind !== 'partial') {
    return null;
  }
  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    return null;
  }
  if (!Number.isFinite(payload.preview_seq) || payload.preview_seq < 1) {
    return null;
  }
  if (typeof payload.recording_id !== 'string' || !payload.recording_id.trim()) {
    return null;
  }

  return {
    text: payload.text,
    previewSeq: Number(payload.preview_seq),
    recordingId: payload.recording_id,
    generatedAt: typeof payload.generated_at === 'string' ? payload.generated_at : null,
    language: typeof payload.language === 'string' ? payload.language : null,
    confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
  };
}

export function validateTranscriptFinalPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (payload.transcript_kind !== 'final') {
    return null;
  }
  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    return null;
  }

  return {
    text: payload.text,
    messageId: typeof payload.message_id === 'string' ? payload.message_id : null,
    sourceKind: typeof payload.source_kind === 'string' ? payload.source_kind : 'audio',
    recordingId: typeof payload.recording_id === 'string' ? payload.recording_id : null,
    generatedAt: typeof payload.generated_at === 'string' ? payload.generated_at : null,
    language: typeof payload.language === 'string' ? payload.language : null,
    confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
  };
}

export function normalizeAffectPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const sourceContext = payload.source_context;
  const textResult = payload.text_result;
  const audioResult = payload.audio_result;
  const videoResult = payload.video_result;
  const fusionResult = payload.fusion_result;
  if (
    !sourceContext
    || typeof sourceContext.origin !== 'string'
    || typeof sourceContext.dataset !== 'string'
    || typeof sourceContext.record_id !== 'string'
    || !textResult
    || typeof textResult.label !== 'string'
    || !audioResult
    || typeof audioResult.label !== 'string'
    || !videoResult
    || typeof videoResult.label !== 'string'
    || !fusionResult
    || typeof fusionResult.emotion_state !== 'string'
    || typeof fusionResult.risk_level !== 'string'
  ) {
    return null;
  }

  return {
    panelState: 'ready',
    panelMessage: 'Affect snapshot updated.',
    currentStage: typeof payload.current_stage === 'string' ? payload.current_stage : 'idle',
    generatedAt: typeof payload.generated_at === 'string' ? payload.generated_at : null,
    sourceContext: {
      origin: sourceContext.origin,
      dataset: sourceContext.dataset,
      recordId: sourceContext.record_id,
      note: typeof sourceContext.note === 'string' ? sourceContext.note : '',
    },
    text: {
      status: typeof textResult.status === 'string' ? textResult.status : 'pending',
      label: textResult.label,
      confidence: typeof textResult.confidence === 'number' ? textResult.confidence : null,
      detail: typeof textResult.detail === 'string' ? textResult.detail : '',
    },
    audio: {
      status: typeof audioResult.status === 'string' ? audioResult.status : 'pending',
      label: audioResult.label,
      confidence: typeof audioResult.confidence === 'number' ? audioResult.confidence : null,
      detail: typeof audioResult.detail === 'string' ? audioResult.detail : '',
    },
    video: {
      status: typeof videoResult.status === 'string' ? videoResult.status : 'pending',
      label: videoResult.label,
      confidence: typeof videoResult.confidence === 'number' ? videoResult.confidence : null,
      detail: typeof videoResult.detail === 'string' ? videoResult.detail : '',
    },
    fusion: {
      emotionState: fusionResult.emotion_state,
      riskLevel: fusionResult.risk_level,
      confidence: typeof fusionResult.confidence === 'number' ? fusionResult.confidence : null,
      conflict: fusionResult.conflict === true,
      conflictReason: typeof fusionResult.conflict_reason === 'string' ? fusionResult.conflict_reason : '',
      detail: typeof fusionResult.detail === 'string' ? fusionResult.detail : '',
    },
  };
}

export function normalizeKnowledgeRetrievedPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return {
    sourceIds: Array.isArray(payload.source_ids)
      ? payload.source_ids.filter((item) => typeof item === 'string' && item.trim())
      : [],
    groundedRefs: Array.isArray(payload.grounded_refs)
      ? payload.grounded_refs.filter((item) => typeof item === 'string' && item.trim())
      : [],
    filtersApplied: Array.isArray(payload.filters_applied)
      ? payload.filters_applied.filter((item) => typeof item === 'string' && item.trim())
      : [],
    candidateCount: Number.isFinite(payload.candidate_count) ? Number(payload.candidate_count) : null,
    retrievalAttempted: payload.retrieval_attempted === true,
    retrievalStatus: typeof payload.retrieval_status === 'string' && payload.retrieval_status.trim()
      ? payload.retrieval_status
      : 'idle',
    riskLevel: typeof payload.risk_level === 'string' ? payload.risk_level : 'pending',
    stage: typeof payload.stage === 'string' ? payload.stage : 'idle',
    errorMessage: typeof payload.error_message === 'string' ? payload.error_message : '',
  };
}

export function createInitialPartialTranscriptState() {
  return {
    status: 'idle',
    text: '',
    previewSeq: 0,
    recordingId: null,
    updatedAt: null,
    language: null,
    confidence: null,
  };
}

export function createInitialFinalTranscriptState() {
  return {
    text: '',
    messageId: null,
    sourceKind: 'pending',
    recordingId: null,
    updatedAt: null,
    language: null,
    confidence: null,
  };
}

export function createInitialAffectSnapshot() {
  return {
    panelState: 'idle',
    panelMessage: '',
    currentStage: 'idle',
    generatedAt: null,
    sourceContext: {
      origin: 'pending',
      dataset: 'pending',
      recordId: 'pending',
      note: '',
    },
    text: {
      status: 'pending',
      label: 'pending',
      confidence: null,
      detail: '',
    },
    audio: {
      status: 'pending',
      label: 'pending',
      confidence: null,
      detail: '',
    },
    video: {
      status: 'pending',
      label: 'pending',
      confidence: null,
      detail: '',
    },
    fusion: {
      emotionState: 'pending',
      riskLevel: 'pending',
      confidence: null,
      conflict: false,
      conflictReason: '',
      detail: '',
    },
  };
}

export function createInitialKnowledgeState() {
  return {
    sourceIds: [],
    groundedRefs: [],
    filtersApplied: [],
    candidateCount: null,
    retrievalAttempted: false,
    retrievalStatus: 'idle',
    riskLevel: 'pending',
    stage: 'idle',
    errorMessage: '',
  };
}

export function formatRealtimeConfidence(value) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '—';
}

export function formatDurationMs(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0.0s';
  }
  return `${(value / 1000).toFixed(1)}s`;
}

export function createRecordingId() {
  return `rec_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function resolveAvatarId(candidateAvatarId, fallbackAvatarId = 'companion_female_01') {
  if (typeof candidateAvatarId === 'string' && avatarProfiles[candidateAvatarId]) {
    return candidateAvatarId;
  }
  if (typeof fallbackAvatarId === 'string' && avatarProfiles[fallbackAvatarId]) {
    return fallbackAvatarId;
  }
  return 'companion_female_01';
}

export function getAvatarProfile(candidateAvatarId, fallbackAvatarId = 'companion_female_01') {
  return avatarProfiles[resolveAvatarId(candidateAvatarId, fallbackAvatarId)];
}

export function normalizeEmotionLabel(value) {
  if (typeof value !== 'string') {
    return 'pending';
  }
  const normalized = value.trim().toLowerCase();
  return normalized || 'pending';
}

export function resolveAvatarExpressionPreset({ stage, riskLevel, emotion }) {
  const currentStage = dialogueStages.has(stage) ? stage : 'idle';
  const currentRiskLevel = dialogueRiskLevels.has(riskLevel) ? riskLevel : 'low';
  const currentEmotion = normalizeEmotionLabel(emotion);

  if (currentStage === 'idle' || currentEmotion === 'pending') {
    return avatarExpressionPresets.ready_idle;
  }
  if (currentRiskLevel === 'high' || currentStage === 'handoff') {
    return avatarExpressionPresets.guarded_handoff;
  }
  if (currentStage === 'reassess') {
    return avatarExpressionPresets.calm_checkin;
  }
  if (currentStage === 'intervene') {
    return avatarExpressionPresets.steady_support;
  }
  if (currentStage === 'assess') {
    return avatarExpressionPresets.focused_assess;
  }
  if (currentEmotion.includes('distress') || currentEmotion.includes('anxious')) {
    return avatarExpressionPresets.open_warm;
  }
  return avatarExpressionPresets.open_warm;
}

export function resolvePlayableTtsAudioUrl(audioUrl, appConfig) {
  if (typeof audioUrl !== 'string' || !audioUrl.trim()) {
    return null;
  }
  const normalized = audioUrl.trim();
  if (normalized.startsWith('data:') || normalized.startsWith('blob:')) {
    return normalized;
  }

  try {
    const publicBaseUrl = new URL(appConfig.ttsBaseUrl);
    const candidateUrl = new URL(normalized, publicBaseUrl);
    const internalHosts = new Set(['tts-service', '0.0.0.0', '::']);
    if (
      candidateUrl.pathname.startsWith('/media/tts/')
      && internalHosts.has(candidateUrl.hostname.toLowerCase())
    ) {
      return new URL(
        `${candidateUrl.pathname}${candidateUrl.search}${candidateUrl.hash}`,
        publicBaseUrl,
      ).toString();
    }
    return candidateUrl.toString();
  } catch (error) {
    return normalized;
  }
}

export function sameAudioSource(left, right) {
  if (!left || !right) {
    return false;
  }
  try {
    return new URL(left).toString() === new URL(right).toString();
  } catch (error) {
    return left === right;
  }
}

export function getAudioPlaybackRetryMessage(error) {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const normalized = rawMessage.toLowerCase();
  if (normalized.includes('supported source')) {
    return '语音资源已生成，但浏览器未能加载音频资源，可点击重播语音重试。';
  }
  if (normalized.includes("user didn't interact") || normalized.includes('notallowederror')) {
    return '语音资源已生成，但浏览器拦截了自动播放，可点击重播语音继续。';
  }
  return '语音资源已生成，但当前未能开始播放，可点击重播语音重试。';
}

export function buildMouthCueSequence(text, durationMs) {
  const safeDurationMs = Math.max(1200, durationMs || 0);
  const characters = Array.from(String(text || '').trim());
  if (!characters.length) {
    return [{ startMs: 0, endMs: safeDurationMs, mouthState: 'closed' }];
  }

  const visibleCharacters = characters.filter((character) => !/\s/.test(character));
  const cueCharacters = visibleCharacters.length ? visibleCharacters : characters;
  const stepMs = Math.max(90, Math.min(220, Math.floor(safeDurationMs / Math.max(cueCharacters.length, 1))));
  const cues = [];
  let cursorMs = 0;

  cueCharacters.forEach((character, index) => {
    const codePoint = character.codePointAt(0) || 0;
    const isPause = /[，。！？,.!?、；;：:]/.test(character);
    let mouthState = 'closed';
    if (!isPause) {
      const variant = (codePoint + index) % 3;
      mouthState = variant === 0 ? 'small' : variant === 1 ? 'wide' : 'round';
    }

    cues.push({
      startMs: cursorMs,
      endMs: Math.min(safeDurationMs, cursorMs + stepMs),
      mouthState,
    });
    cursorMs += stepMs;
  });

  if (!cues.length || cues[cues.length - 1].mouthState !== 'closed') {
    cues.push({
      startMs: Math.min(cursorMs, safeDurationMs),
      endMs: safeDurationMs,
      mouthState: 'closed',
    });
  } else {
    cues[cues.length - 1].endMs = safeDurationMs;
  }

  return cues;
}

export function normalizeUserAvatarId(value) {
  return value === 'male' ? 'male' : 'female';
}

export function readStoredUserAvatarId(storageKey) {
  try {
    return normalizeUserAvatarId(window?.localStorage?.getItem(storageKey));
  } catch (error) {
    return 'female';
  }
}

export function writeStoredUserAvatarId(storageKey, userAvatarId) {
  try {
    window?.localStorage?.setItem(storageKey, normalizeUserAvatarId(userAvatarId));
  } catch (error) {
    // Ignore localStorage availability errors in browser-restricted contexts.
  }
}

export function readExportCache(storageKey) {
  if (window && window.__virtualHumanLastExportPayload) {
    return {
      payload: window.__virtualHumanLastExportPayload,
      fileName: window.__virtualHumanLastExportFileName || null,
    };
  }
  try {
    const raw = window?.localStorage?.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.payload) {
      return null;
    }
    return {
      payload: parsed.payload,
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : null,
    };
  } catch (error) {
    return null;
  }
}

export function storeExportCache(storageKey, payload, fileName) {
  if (window && typeof window === 'object') {
    window.__virtualHumanLastExportPayload = payload;
    window.__virtualHumanLastExportFileName = fileName;
  }
  try {
    window?.localStorage?.setItem(storageKey, JSON.stringify({ payload, fileName }));
  } catch (error) {
    // Ignore localStorage availability errors in browser-restricted contexts.
  }
}

export function buildExportFileName(sessionId, exportedAt) {
  const safeTimestamp = String(exportedAt || new Date().toISOString())
    .replaceAll(':', '-')
    .replaceAll('.', '-');
  return `${sessionId || 'session'}_${safeTimestamp}.json`;
}

export function triggerExportDownload(payload, fileName) {
  if (typeof Blob !== 'function' || !window?.URL || typeof window.URL.createObjectURL !== 'function') {
    return false;
  }
  if (!document || typeof document.createElement !== 'function') {
    return false;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const objectUrl = window.URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    if (!anchor || typeof anchor.click !== 'function') {
      return false;
    }
    anchor.href = objectUrl;
    anchor.download = fileName;
    if (document.body && typeof document.body.appendChild === 'function') {
      document.body.appendChild(anchor);
    }
    anchor.click();
    if (anchor.parentNode && typeof anchor.parentNode.removeChild === 'function') {
      anchor.parentNode.removeChild(anchor);
    }
    return true;
  } finally {
    if (typeof window.URL.revokeObjectURL === 'function') {
      window.URL.revokeObjectURL(objectUrl);
    }
  }
}

function normalizeReplayEventEnvelope(rawEvent, index = 0) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return null;
  }
  const eventType = typeof rawEvent.event_type === 'string' ? rawEvent.event_type : null;
  if (!eventType) {
    return null;
  }
  return {
    event_id: typeof rawEvent.event_id === 'string'
      ? rawEvent.event_id
      : `evt_replay_${String(index + 1).padStart(3, '0')}`,
    event_type: eventType,
    session_id: typeof rawEvent.session_id === 'string' ? rawEvent.session_id : null,
    trace_id: typeof rawEvent.trace_id === 'string' ? rawEvent.trace_id : null,
    message_id: typeof rawEvent.message_id === 'string' ? rawEvent.message_id : null,
    emitted_at: typeof rawEvent.emitted_at === 'string' ? rawEvent.emitted_at : null,
    payload: rawEvent.payload && typeof rawEvent.payload === 'object' ? rawEvent.payload : {},
  };
}

function buildReplayEventsFromMessages(exportPayload) {
  const messages = Array.isArray(exportPayload?.messages) ? exportPayload.messages : [];
  return messages.map((message, index) => {
    const metadata = message?.metadata && typeof message.metadata === 'object'
      ? message.metadata
      : {};
    if (message?.role === 'user') {
      return normalizeReplayEventEnvelope(
        {
          event_type: 'message.accepted',
          session_id: exportPayload?.session_id || null,
          trace_id: message?.trace_id || exportPayload?.trace_id || null,
          message_id: message?.message_id || null,
          emitted_at: message?.submitted_at || null,
          payload: {
            message_id: message?.message_id || null,
            trace_id: message?.trace_id || exportPayload?.trace_id || null,
            source_kind: message?.source_kind || 'text',
            content_text: message?.content_text || '',
            submitted_at: message?.submitted_at || null,
          },
        },
        index,
      );
    }
    if (message?.role === 'assistant') {
      return normalizeReplayEventEnvelope(
        {
          event_type: 'dialogue.reply',
          session_id: exportPayload?.session_id || null,
          trace_id: message?.trace_id || exportPayload?.trace_id || null,
          message_id: message?.message_id || null,
          emitted_at: message?.submitted_at || null,
          payload: {
            session_id: exportPayload?.session_id || '',
            trace_id: message?.trace_id || exportPayload?.trace_id || '',
            message_id: message?.message_id || '',
            reply: message?.content_text || '',
            emotion: metadata.emotion || 'neutral',
            risk_level: metadata.risk_level || 'low',
            stage: metadata.stage || exportPayload?.stage || 'engage',
            next_action: metadata.next_action || 'ask_followup',
            knowledge_refs: Array.isArray(metadata.knowledge_refs) ? metadata.knowledge_refs : [],
            safety_flags: Array.isArray(metadata.safety_flags) ? metadata.safety_flags : [],
          },
        },
        index,
      );
    }
    return null;
  }).filter(Boolean);
}

export function buildReplaySequence(exportPayload) {
  const rawEvents = Array.isArray(exportPayload?.events) ? exportPayload.events : [];
  const normalizedEvents = rawEvents
    .map((event, index) => normalizeReplayEventEnvelope(event, index))
    .filter(Boolean)
    .sort((left, right) => {
      const leftMs = left.emitted_at ? new Date(left.emitted_at).getTime() : 0;
      const rightMs = right.emitted_at ? new Date(right.emitted_at).getTime() : 0;
      return leftMs - rightMs;
    });

  if (normalizedEvents.length > 0) {
    return normalizedEvents;
  }
  return buildReplayEventsFromMessages(exportPayload);
}

export function getReplayDelayMs(runtimeConfig, previousEnvelope, nextEnvelope) {
  if (!previousEnvelope || !nextEnvelope) {
    return runtimeConfig.replayDelayMinMs;
  }
  const previousTime = previousEnvelope.emitted_at ? new Date(previousEnvelope.emitted_at).getTime() : Number.NaN;
  const nextTime = nextEnvelope.emitted_at ? new Date(nextEnvelope.emitted_at).getTime() : Number.NaN;
  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime) || nextTime <= previousTime) {
    return Math.round((runtimeConfig.replayDelayMinMs + runtimeConfig.replayDelayMaxMs) / 2);
  }
  const scaled = Math.round((nextTime - previousTime) * runtimeConfig.replayDelayScale);
  return Math.max(runtimeConfig.replayDelayMinMs, Math.min(runtimeConfig.replayDelayMaxMs, scaled));
}
