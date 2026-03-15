(function () {
  const panelIds = ["capture", "avatar", "emotion", "chat", "control"];
  const moduleIds = ["capture", "avatar", "conversation", "emotion", "session"];
  const dialogueStages = new Set(["engage", "assess", "intervene", "reassess", "handoff"]);
  const dialogueRiskLevels = new Set(["low", "medium", "high"]);
  const defaultSessionIdLabel = "未创建";
  const defaultApiBaseUrl = "http://127.0.0.1:8000";
  const defaultWsUrl = "ws://127.0.0.1:8000/ws";
  const defaultTtsBaseUrl = "http://127.0.0.1:8040";
  const defaultAffectBaseUrl = "http://127.0.0.1:8060";
  const defaultAvatarId = "companion_female_01";
  const avatarProfiles = {
    companion_female_01: {
      avatarId: "companion_female_01",
      profileId: "companion",
      label: "陪伴角色 A",
      meta: "温和、稳定、陪你慢慢说",
      stageNote: "更适合温和接住情绪、慢慢展开对话。",
      idleDetail: "陪伴角色已准备好开始回应。",
      speakingDetail: "陪伴角色正在温和回应。",
      voicePreview: "zh-CN-XiaoxiaoNeural",
    },
    coach_male_01: {
      avatarId: "coach_male_01",
      profileId: "coach",
      label: "引导角色 B",
      meta: "帮助梳理重点，陪你往下走",
      stageNote: "更适合帮助梳理重点，带着你往下一步走。",
      idleDetail: "引导角色已准备好继续对话。",
      speakingDetail: "引导角色正在给出更清晰的建议。",
      voicePreview: "zh-CN-YunxiNeural",
    },
  };
  const avatarExpressionPresets = {
    ready_idle: {
      presetId: "ready_idle",
      label: "ready_idle",
      detail: "当前保持平稳自然的待机表情。",
    },
    open_warm: {
      presetId: "open_warm",
      label: "open_warm",
      detail: "建立联系阶段保持开放和低压，表情轻微上扬。",
    },
    focused_assess: {
      presetId: "focused_assess",
      label: "focused_assess",
      detail: "评估阶段收敛动作，表情更专注，方便继续追问。",
    },
    steady_support: {
      presetId: "steady_support",
      label: "steady_support",
      detail: "干预阶段保持稳定支持，动作柔和，不做夸张变化。",
    },
    calm_checkin: {
      presetId: "calm_checkin",
      label: "calm_checkin",
      detail: "再评估阶段回到中性稳定，观察用户反馈变化。",
    },
    guarded_handoff: {
      presetId: "guarded_handoff",
      label: "guarded_handoff",
      detail: "高风险或 handoff 阶段降低轻快感，保持严肃和稳定。",
    },
  };

  function resolveAvatarId(candidateAvatarId) {
    if (typeof candidateAvatarId === "string" && avatarProfiles[candidateAvatarId]) {
      return candidateAvatarId;
    }
    return defaultAvatarId;
  }

  function getAvatarProfile(candidateAvatarId) {
    return avatarProfiles[resolveAvatarId(candidateAvatarId)];
  }

  function getEffectiveAvatarId(state) {
    if (state.sessionId && state.sessionAvatarId) {
      return resolveAvatarId(state.sessionAvatarId);
    }
    return resolveAvatarId(state.activeAvatarId);
  }

  function getEffectiveAvatarProfile(state) {
    return getAvatarProfile(getEffectiveAvatarId(state));
  }

  function normalizeEmotionLabel(value) {
    if (typeof value !== "string") {
      return "pending";
    }
    const normalized = value.trim().toLowerCase();
    return normalized || "pending";
  }

  function resolveAvatarExpressionPreset(state) {
    const currentStage = dialogueStages.has(state.stage) ? state.stage : "idle";
    const currentRiskLevel = dialogueRiskLevels.has(state.lastReplyRiskLevel)
      ? state.lastReplyRiskLevel
      : "low";
    const currentEmotion = normalizeEmotionLabel(state.lastReplyEmotion);

    if (currentStage === "idle" || currentEmotion === "pending") {
      return avatarExpressionPresets.ready_idle;
    }
    if (currentRiskLevel === "high" || currentStage === "handoff") {
      return avatarExpressionPresets.guarded_handoff;
    }
    if (currentStage === "reassess") {
      return avatarExpressionPresets.calm_checkin;
    }
    if (currentStage === "intervene") {
      return avatarExpressionPresets.steady_support;
    }
    if (currentStage === "assess") {
      return avatarExpressionPresets.focused_assess;
    }
    if (currentEmotion.includes("distress") || currentEmotion.includes("anxious")) {
      return avatarExpressionPresets.open_warm;
    }
    return avatarExpressionPresets.open_warm;
  }

  function findMissingPanels(rootDocument) {
    return panelIds.filter(
      (panelId) => !rootDocument.querySelector(`[data-panel="${panelId}"]`),
    );
  }

  function resolveModuleId(candidateModuleId) {
    if (typeof candidateModuleId === "string" && moduleIds.includes(candidateModuleId)) {
      return candidateModuleId;
    }
    return "conversation";
  }

  function getAppConfig(rootWindow) {
    const config = rootWindow.__APP_CONFIG__ || {};
    return {
      apiBaseUrl: config.apiBaseUrl || config.gatewayBaseUrl || defaultApiBaseUrl,
      wsUrl: config.wsUrl || defaultWsUrl,
      ttsBaseUrl: config.ttsBaseUrl || defaultTtsBaseUrl,
      affectBaseUrl: config.affectBaseUrl || defaultAffectBaseUrl,
      defaultAvatarId: resolveAvatarId(config.defaultAvatarId || defaultAvatarId),
      activeSessionStorageKey: config.activeSessionStorageKey || "virtual-human-active-session-id",
      exportCacheStorageKey: config.exportCacheStorageKey || "virtual-human-last-export",
      heartbeatIntervalMs: config.heartbeatIntervalMs || 5000,
      reconnectDelayMs: config.reconnectDelayMs || 1000,
      enableAudioFinalize: config.enableAudioFinalize !== false,
      enableAudioPreview: config.enableAudioPreview !== false,
      audioPreviewChunkThreshold: config.audioPreviewChunkThreshold || 2,
      videoFrameUploadIntervalMs: config.videoFrameUploadIntervalMs || 1800,
      autoplayAssistantAudio: config.autoplayAssistantAudio !== false,
      replayDelayScale: typeof config.replayDelayScale === "number" ? config.replayDelayScale : 0.25,
      replayDelayMinMs: config.replayDelayMinMs || 120,
      replayDelayMaxMs: config.replayDelayMaxMs || 850,
    };
  }

  function createInitialAffectSnapshot() {
    return {
      panelState: "idle",
      panelMessage: "等待本轮对话的情绪摘要。",
      sourceContext: {
        origin: "live_web_session",
        dataset: "live_web",
        recordId: "session/pending",
        note: "等待会话样本信息",
      },
      text: {
        status: "pending",
        label: "pending",
        confidence: 0,
        detail: "文字线索尚未更新。",
      },
      audio: {
        status: "pending",
        label: "pending",
        confidence: 0,
        detail: "语音线索尚未更新。",
      },
      video: {
        status: "pending",
        label: "pending",
        confidence: 0,
        detail: "画面线索尚未更新。",
      },
      fusion: {
        emotionState: "pending",
        riskLevel: "pending",
        confidence: 0,
        conflict: false,
        conflictReason: null,
        detail: "等待更完整的情绪线索。",
      },
    };
  }

  function createInitialSessionState() {
    return {
      sessionId: null,
      activeModule: "conversation",
      activeAvatarId: defaultAvatarId,
      sessionAvatarId: null,
      traceId: null,
      status: "idle",
      stage: "idle",
      updatedAt: null,
      requestState: "idle",
      error: null,
      connectionStatus: "idle",
      lastHeartbeatAt: null,
      connectionLog: ["realtime idle"],
      cameraPermissionState: "idle",
      cameraPermissionMessage: "摄像头尚未授权。",
      cameraState: "idle",
      cameraPreviewMessage: "尚未开启摄像头预览。",
      videoUploadState: "idle",
      videoUploadMessage: "当前没有视频帧上传。",
      uploadedVideoFrameCount: 0,
      lastUploadedVideoFrameId: null,
      lastVideoUploadedAt: null,
      nextVideoFrameSeq: 1,
      micPermissionState: "idle",
      micPermissionMessage: "麦克风尚未授权。",
      recordingState: "idle",
      recordingDurationMs: 0,
      recordingChunkCount: 0,
      recordingMimeType: "pending",
      recordingStartedAt: null,
      audioUploadState: "idle",
      audioUploadMessage: "当前没有音频分片上传。",
      uploadedChunkCount: 0,
      lastUploadedChunkId: null,
      lastUploadedAt: null,
      nextAudioChunkSeq: 1,
      partialTranscriptState: "idle",
      partialTranscriptText: "",
      partialTranscriptUpdatedAt: null,
      lastPartialPreviewSeq: 0,
      draftText: "我这两天总是睡不好，脑子停不下来。",
      timelineEntries: [],
      historyRestoreState: "idle",
      textSubmitState: "idle",
      textSubmitMessage: null,
      pendingMessageId: null,
      lastAcceptedMessageId: null,
      lastAcceptedSourceKind: null,
      lastAcceptedTraceId: null,
      lastAcceptedAt: null,
      lastAcceptedText: "",
      dialogueReplyState: "idle",
      lastReplyMessageId: null,
      lastReplyTraceId: null,
      lastReplyAt: null,
      lastReplyText: "",
      lastReplyEmotion: "pending",
      lastReplyRiskLevel: "pending",
      lastReplyNextAction: "pending",
      lastStageTransition: "idle → idle",
      affectSnapshot: createInitialAffectSnapshot(),
      ttsPlaybackState: "idle",
      ttsPlaybackMessage: "等待新的回应并准备语音。",
      ttsAudioUrl: null,
      ttsAudioFormat: "pending",
      ttsVoiceId: "pending",
      ttsDurationMs: 0,
      ttsGeneratedAt: null,
      avatarMouthState: "closed",
      avatarMouthTransitionCount: 0,
      exportState: "idle",
      exportMessage: "开始或恢复会话后，就可以导出当前记录。",
      lastExportedAt: null,
      lastExportFileName: null,
      replayState: "idle",
      replayMessage: "导出当前记录后，就可以回放这段对话。",
      replayEventCount: 0,
      replaySourceName: null,
      nextClientSeq: 1,
    };
  }

  function findRequiredElement(rootDocument, elementId) {
    const element = rootDocument.getElementById(elementId);
    if (!element) {
      throw new Error(`Missing required element: ${elementId}`);
    }
    return element;
  }

  function findOptionalElement(rootDocument, elementId) {
    return rootDocument.getElementById(elementId);
  }

  function getViewElements(rootDocument) {
    return {
      moduleOptionCapture: findOptionalElement(rootDocument, "module-option-capture"),
      moduleOptionAvatar: findOptionalElement(rootDocument, "module-option-avatar"),
      moduleOptionConversation: findOptionalElement(rootDocument, "module-option-conversation"),
      moduleOptionEmotion: findOptionalElement(rootDocument, "module-option-emotion"),
      moduleOptionSession: findOptionalElement(rootDocument, "module-option-session"),
      startButton: findRequiredElement(rootDocument, "session-start-button"),
      cameraRequestButton: findOptionalElement(rootDocument, "camera-request-button"),
      cameraStartButton: findOptionalElement(rootDocument, "camera-start-button"),
      cameraStopButton: findOptionalElement(rootDocument, "camera-stop-button"),
      micRequestButton: findOptionalElement(rootDocument, "mic-request-button"),
      micStartButton: findOptionalElement(rootDocument, "mic-start-button"),
      micStopButton: findOptionalElement(rootDocument, "mic-stop-button"),
      avatarMicStartButton: findOptionalElement(rootDocument, "avatar-mic-start-button"),
      avatarMicStopButton: findOptionalElement(rootDocument, "avatar-mic-stop-button"),
      cameraPreviewVideo: findOptionalElement(rootDocument, "camera-preview-video"),
      textInputField: findRequiredElement(rootDocument, "text-input-field"),
      textSubmitButton: findRequiredElement(rootDocument, "text-submit-button"),
      captureMicPill: findOptionalElement(rootDocument, "capture-mic-pill"),
      captureCameraPill: findOptionalElement(rootDocument, "capture-camera-pill"),
      captureInputPill: findOptionalElement(rootDocument, "capture-input-pill"),
      cameraPermissionStatus: findOptionalElement(rootDocument, "camera-permission-status"),
      cameraPreviewStateValue: findOptionalElement(rootDocument, "camera-preview-state-value"),
      cameraPreviewDetailValue: findOptionalElement(rootDocument, "camera-preview-detail-value"),
      videoUploadStateValue: findOptionalElement(rootDocument, "video-upload-state-value"),
      videoUploadDetailValue: findOptionalElement(rootDocument, "video-upload-detail-value"),
      micPermissionStatus: findOptionalElement(rootDocument, "mic-permission-status"),
      micRecordingStateValue: findOptionalElement(rootDocument, "mic-recording-state-value"),
      micRecordingDetailValue: findOptionalElement(rootDocument, "mic-recording-detail-value"),
      audioUploadStateValue: findOptionalElement(rootDocument, "audio-upload-state-value"),
      audioUploadDetailValue: findOptionalElement(rootDocument, "audio-upload-detail-value"),
      textSubmitStatus: findRequiredElement(rootDocument, "text-submit-status"),
      textLastMessageLabelValue: findOptionalElement(rootDocument, "text-last-message-label-value"),
      textLastMessageTimeLabelValue: findOptionalElement(rootDocument, "text-last-message-time-label-value"),
      textLastMessageIdValue: findRequiredElement(rootDocument, "text-last-message-id-value"),
      textLastMessageTimeValue: findRequiredElement(rootDocument, "text-last-message-time-value"),
      transcriptUserPartialText: findOptionalElement(rootDocument, "transcript-user-partial-text"),
      transcriptUserFinalText: findRequiredElement(rootDocument, "transcript-user-final-text"),
      transcriptAssistantReplyText: findRequiredElement(rootDocument, "transcript-assistant-reply-text"),
      avatarLatestReplyText: findRequiredElement(rootDocument, "avatar-latest-reply-text"),
      avatarOptionCompanion: findOptionalElement(rootDocument, "avatar-option-companion"),
      avatarOptionCoach: findOptionalElement(rootDocument, "avatar-option-coach"),
      avatarBaselineCard: findOptionalElement(rootDocument, "avatar-baseline-card"),
      avatarLabelValue: findOptionalElement(rootDocument, "avatar-label-value"),
      avatarMetaValue: findOptionalElement(rootDocument, "avatar-meta-value"),
      avatarCharacterStateValue: findOptionalElement(rootDocument, "avatar-character-state-value"),
      avatarCharacterDetailValue: findOptionalElement(rootDocument, "avatar-character-detail-value"),
      avatarStageNoteValue: findOptionalElement(rootDocument, "avatar-stage-note-value"),
      avatarExpressionPresetValue: findOptionalElement(rootDocument, "avatar-expression-preset-value"),
      avatarExpressionDetailValue: findOptionalElement(rootDocument, "avatar-expression-detail-value"),
      avatarMouthShape: findOptionalElement(rootDocument, "avatar-mouth-shape"),
      avatarMouthStateValue: findOptionalElement(rootDocument, "avatar-mouth-state-value"),
      avatarMouthDetailValue: findOptionalElement(rootDocument, "avatar-mouth-detail-value"),
      avatarSpeechStateValue: findOptionalElement(rootDocument, "avatar-speech-state-value"),
      avatarSpeechDetailValue: findOptionalElement(rootDocument, "avatar-speech-detail-value"),
      avatarVoiceValue: findOptionalElement(rootDocument, "avatar-voice-value"),
      avatarDurationValue: findOptionalElement(rootDocument, "avatar-duration-value"),
      avatarReplayButton: findOptionalElement(rootDocument, "avatar-replay-button"),
      avatarAudioPlayer: findOptionalElement(rootDocument, "avatar-audio-player"),
      emotionPanelStatus: findOptionalElement(rootDocument, "emotion-panel-status"),
      textSignalValue: findOptionalElement(rootDocument, "text-signal-value"),
      textSignalConfidence: findOptionalElement(rootDocument, "text-signal-confidence"),
      textSignalDetail: findOptionalElement(rootDocument, "text-signal-detail"),
      audioSignalValue: findOptionalElement(rootDocument, "audio-signal-value"),
      audioSignalConfidence: findOptionalElement(rootDocument, "audio-signal-confidence"),
      audioSignalDetail: findOptionalElement(rootDocument, "audio-signal-detail"),
      videoSignalValue: findOptionalElement(rootDocument, "video-signal-value"),
      videoSignalConfidence: findOptionalElement(rootDocument, "video-signal-confidence"),
      videoSignalDetail: findOptionalElement(rootDocument, "video-signal-detail"),
      fusionEmotionLabelValue: findOptionalElement(rootDocument, "fusion-emotion-label-value"),
      fusionEmotionValue: findOptionalElement(rootDocument, "fusion-emotion-value"),
      fusionRiskLabelValue: findOptionalElement(rootDocument, "fusion-risk-label-value"),
      fusionRiskValue: findRequiredElement(rootDocument, "fusion-risk-value"),
      fusionConfidenceValue: findOptionalElement(rootDocument, "fusion-confidence-value"),
      fusionConflictValue: findOptionalElement(rootDocument, "fusion-conflict-value"),
      fusionDetailValue: findOptionalElement(rootDocument, "fusion-detail-value"),
      fusionStageValue: findRequiredElement(rootDocument, "fusion-stage-value"),
      emotionSourceOriginValue: findOptionalElement(rootDocument, "emotion-source-origin-value"),
      emotionSourceDatasetValue: findOptionalElement(rootDocument, "emotion-source-dataset-value"),
      emotionSourceRecordValue: findOptionalElement(rootDocument, "emotion-source-record-value"),
      emotionSourceNoteValue: findOptionalElement(rootDocument, "emotion-source-note-value"),
      timelineUserText: findOptionalElement(rootDocument, "timeline-user-text"),
      timelineAssistantText: findOptionalElement(rootDocument, "timeline-assistant-text"),
      timelineStageText: findOptionalElement(rootDocument, "timeline-stage-text"),
      chatTimelineList: findRequiredElement(rootDocument, "chat-timeline-list"),
      sessionIdValue: findRequiredElement(rootDocument, "session-id-value"),
      sessionStatusValue: findRequiredElement(rootDocument, "session-status-value"),
      sessionStatusLabelValue: findOptionalElement(rootDocument, "session-status-label-value"),
      sessionStageValue: findRequiredElement(rootDocument, "session-stage-value"),
      sessionStageLabelValue: findOptionalElement(rootDocument, "session-stage-label-value"),
      sessionTraceValue: findRequiredElement(rootDocument, "session-trace-value"),
      lastUserTraceValue: findOptionalElement(rootDocument, "last-user-trace-value"),
      lastReplyTraceValue: findOptionalElement(rootDocument, "last-reply-trace-value"),
      sessionUpdatedAtValue: findRequiredElement(rootDocument, "session-updated-at-value"),
      sessionApiBaseUrlValue: findRequiredElement(rootDocument, "session-api-base-url-value"),
      sessionWsUrlValue: findRequiredElement(rootDocument, "session-ws-url-value"),
      sessionFeedback: findRequiredElement(rootDocument, "session-feedback"),
      exportButton: findOptionalElement(rootDocument, "session-export-button"),
      replayButton: findOptionalElement(rootDocument, "session-replay-button"),
      exportStatus: findOptionalElement(rootDocument, "session-export-status"),
      connectionStatusValue: findRequiredElement(rootDocument, "connection-status-value"),
      connectionHeartbeatValue: findRequiredElement(rootDocument, "connection-heartbeat-value"),
      connectionLogValue: findRequiredElement(rootDocument, "connection-log"),
    };
  }

  function formatTimestamp(value) {
    if (!value) {
      return "未开始";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function formatDurationMs(value) {
    if (!value || value < 0) {
      return "0.0s";
    }
    return `${(value / 1000).toFixed(1)}s`;
  }

  function formatConfidence(value) {
    if (typeof value !== "number" || value <= 0) {
      return "置信度：待更新";
    }
    return `置信度：${value.toFixed(2)}`;
  }

  function resolvePlayableTtsAudioUrl(audioUrl, appConfig) {
    if (typeof audioUrl !== "string" || !audioUrl.trim()) {
      return null;
    }
    const normalized = audioUrl.trim();
    if (normalized.startsWith("data:") || normalized.startsWith("blob:")) {
      return normalized;
    }

    try {
      const publicBaseUrl = new URL(appConfig.ttsBaseUrl);
      const candidateUrl = new URL(normalized, publicBaseUrl);
      const internalHosts = new Set(["tts-service", "0.0.0.0", "::"]);
      if (
        candidateUrl.pathname.startsWith("/media/tts/")
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

  function sameAudioSource(left, right) {
    if (!left || !right) {
      return false;
    }
    try {
      return new URL(left).toString() === new URL(right).toString();
    } catch (error) {
      return left === right;
    }
  }

  function getAudioPlaybackRetryMessage(error) {
    const rawMessage = error instanceof Error ? error.message : String(error || "");
    const normalized = rawMessage.toLowerCase();
    if (normalized.includes("supported source")) {
      return "语音资源已生成，但浏览器未能加载音频资源，可点击重播语音重试。";
    }
    if (normalized.includes("user didn't interact") || normalized.includes("notallowederror")) {
      return "语音资源已生成，但浏览器拦截了自动播放，可点击重播语音继续。";
    }
    return "语音资源已生成，但当前未能开始播放，可点击重播语音重试。";
  }

  function getNavigatorLike(rootWindow) {
    if (rootWindow && rootWindow.navigator) {
      return rootWindow.navigator;
    }
    if (typeof navigator !== "undefined") {
      return navigator;
    }
    return null;
  }

  function getMediaRecorderCtor(rootWindow) {
    if (rootWindow && typeof rootWindow.MediaRecorder === "function") {
      return rootWindow.MediaRecorder;
    }
    if (typeof MediaRecorder === "function") {
      return MediaRecorder;
    }
    return null;
  }

  function getStartButtonLabel(state) {
    if (state.requestState === "restoring") {
      return "正在恢复会话...";
    }
    if (state.requestState === "loading") {
      return "正在开始...";
    }
    if (state.requestState === "error") {
      return "重新开始会话";
    }
    if (state.sessionId) {
      return "开始新会话";
    }
    return "开始会话";
  }

  function getFeedbackMessage(state) {
    if (state.replayState === "running") {
      return state.replayMessage || "正在基于导出日志回放会话。";
    }
    if (state.replayState === "completed") {
      return state.replayMessage || "导出日志回放完成，可继续重新播放或创建新会话。";
    }
    if (state.replayState === "error") {
      return state.replayMessage || "导出日志回放失败。";
    }
    if (state.requestState === "restoring") {
      return "正在恢复最近一次会话和历史消息。";
    }
    if (state.requestState === "loading") {
      return "正在创建会话，请稍候。";
    }
    if (state.requestState === "error") {
      return state.error || "会话创建失败。";
    }
    if (state.sessionId) {
      if (state.historyRestoreState === "restored") {
        return "已恢复上次对话，你可以继续从这里开始。";
      }
      return "会话已开始，可以继续发送文字、语音并查看最新进展。";
    }
    return "点击开始会话，开启一次新的对话。";
  }

  function getTextSubmitStatusMessage(state) {
    if (state.replayState === "running" || state.connectionStatus === "replay") {
      return "回放模式下禁用实时文本发送。";
    }
    if (!state.sessionId) {
      return "开始会话并连接后，就可以发送文字。";
    }
    if (state.connectionStatus === "unsupported") {
      return "当前环境不支持 WebSocket，无法等待确认事件。";
    }
    if (state.connectionStatus !== "connected") {
      if (state.connectionStatus === "reconnecting") {
        return "连接正在恢复中，请稍后再发送。";
      }
      return "等待连接完成后，再发送补充文字。";
    }
    if (state.textSubmitState === "sending") {
      return "正在发送文字，请稍候。";
    }
    if (state.textSubmitState === "awaiting_ack") {
      return "文字已发出，正在等待确认。";
    }
    if (state.textSubmitState === "sent") {
      return state.textSubmitMessage || "发送成功。";
    }
    if (state.textSubmitState === "error") {
      return state.textSubmitMessage || "文字发送失败。";
    }
    return "想补充一点文字时，可以在这里输入后发送。";
  }

  function getLatestAcceptedMessageLabel(state) {
    if (state.lastAcceptedText) {
      return state.lastAcceptedText;
    }
    return "还没有发送新的文字。";
  }

  function getLatestAcceptedTimeLabel(state) {
    if (state.lastAcceptedAt) {
      return `接收时间：${formatTimestamp(state.lastAcceptedAt)}`;
    }
    return "发送后会在这里显示接收时间。";
  }

  function getLatestAcceptedMessageIdValue(state) {
    if (state.lastAcceptedMessageId) {
      return state.lastAcceptedMessageId;
    }
    return "not sent";
  }

  function getLatestAcceptedTimeValue(state) {
    if (state.lastAcceptedAt) {
      return state.lastAcceptedAt;
    }
    return "not accepted";
  }

  function getVisibleCaptureMicLabel(state) {
    const labelMap = {
      idle: "未开启",
      requesting: "授权中",
      granted: state.recordingState === "recording" ? "录音中" : "已准备",
      denied: "未授权",
      unsupported: "不可用",
      error: "异常",
    };
    return `麦克风：${labelMap[state.micPermissionState] || "未开启"}`;
  }

  function getVisibleCaptureCameraLabel(state) {
    if (state.cameraState === "previewing") {
      return "摄像头：画面中";
    }
    const labelMap = {
      idle: "未开启",
      requesting: "授权中",
      granted: "已准备",
      denied: "未授权",
      unsupported: "不可用",
      error: "异常",
    };
    return `摄像头：${labelMap[state.cameraPermissionState] || "未开启"}`;
  }

  function getVisibleCaptureInputLabel(state) {
    const activeInputs = ["文字"];
    if (state.recordingState === "recording") {
      activeInputs.push("语音");
    }
    if (state.cameraState === "previewing") {
      activeInputs.push("画面");
    }
    return `当前输入：${activeInputs.join(" + ")}`;
  }

  function getVisibleSessionStatusLabel(state) {
    const labelMap = {
      idle: "等待开始",
      created: "已开始",
      active: "进行中",
      replay_ready: "可回放",
      replay_loading: "准备回放",
    };
    return labelMap[state.status] || state.status || "等待开始";
  }

  function getVisibleSessionStageLabel(state) {
    const labelMap = {
      idle: "刚开始",
      engage: "倾听中",
      assess: "了解中",
      intervene: "回应中",
      reassess: "继续陪伴",
      handoff: "准备转接",
    };
    return labelMap[state.stage] || state.stage || "刚开始";
  }

  function getCameraPermissionStatusMessage(state) {
    if (state.replayState === "running" || state.connectionStatus === "replay") {
      return "回放模式下不请求摄像头权限。";
    }
    if (state.cameraPermissionState === "requesting") {
      return "正在请求摄像头权限。";
    }
    if (state.cameraPermissionState === "granted") {
      return state.cameraState === "previewing"
        ? "摄像头已授权，预览与抽帧上传进行中。"
        : "摄像头已授权，可以开始预览。";
    }
    if (state.cameraPermissionState === "denied") {
      return state.cameraPermissionMessage || "摄像头权限被拒绝。";
    }
    if (state.cameraPermissionState === "unsupported") {
      return "当前环境不支持摄像头采集。";
    }
    if (state.cameraPermissionState === "error") {
      return state.cameraPermissionMessage || "摄像头初始化失败。";
    }
    return state.cameraPermissionMessage || "摄像头尚未授权。";
  }

  function getCameraPreviewDetailMessage(state) {
    if (state.cameraState === "previewing") {
      return state.cameraPreviewMessage || "摄像头预览中，正在低频抽帧上传。";
    }
    if (state.cameraState === "stopped") {
      return state.cameraPreviewMessage || "摄像头预览已停止。";
    }
    if (state.cameraState === "error") {
      return state.cameraPreviewMessage || "摄像头预览失败。";
    }
    return state.cameraPreviewMessage || "尚未开启摄像头预览。";
  }

  function getVideoUploadStatusMessage(state) {
    if (state.videoUploadState === "uploading") {
      return state.videoUploadMessage || "视频帧上传中。";
    }
    if (state.videoUploadState === "completed") {
      return state.videoUploadMessage || "视频帧上传完成。";
    }
    if (state.videoUploadState === "local_only") {
      return state.videoUploadMessage || "当前只做本地预览，没有上传到网关。";
    }
    if (state.videoUploadState === "error") {
      return state.videoUploadMessage || "视频帧上传失败。";
    }
    return state.videoUploadMessage || "当前没有视频帧上传。";
  }

  function getMicPermissionStatusMessage(state) {
    if (state.replayState === "running" || state.connectionStatus === "replay") {
      return "回放模式下不请求麦克风权限。";
    }
    if (state.micPermissionState === "requesting") {
      return "正在请求麦克风权限。";
    }
    if (state.micPermissionState === "granted") {
      return state.recordingState === "recording"
        ? "麦克风已授权，录音进行中。"
        : "麦克风已授权，可以开始录音。";
    }
    if (state.micPermissionState === "denied") {
      return state.micPermissionMessage || "麦克风权限被拒绝。";
    }
    if (state.micPermissionState === "unsupported") {
      return "当前环境不支持麦克风采集。";
    }
    if (state.micPermissionState === "error") {
      return state.micPermissionMessage || "麦克风初始化失败。";
    }
    return state.micPermissionMessage || "麦克风尚未授权。";
  }

  function getRecordingDetailMessage(state) {
    if (state.recordingState === "recording") {
      return `录音进行中，已收集 ${state.recordingChunkCount} 个分片，时长 ${formatDurationMs(state.recordingDurationMs)}。`;
    }
    if (state.recordingState === "stopped") {
      return `录音已停止，共收集 ${state.recordingChunkCount} 个分片，时长 ${formatDurationMs(state.recordingDurationMs)}，格式 ${state.recordingMimeType}。`;
    }
    if (state.recordingState === "error") {
      return state.micPermissionMessage || "录音失败。";
    }
    return "尚未开始录音。";
  }

  function getAudioUploadStatusMessage(state) {
    if (state.audioUploadState === "uploading") {
      return state.audioUploadMessage || "音频分片上传中。";
    }
    if (state.audioUploadState === "processing_final") {
      return state.audioUploadMessage || "录音结束，正在提交完整音频并等待 ASR 结果。";
    }
    if (state.audioUploadState === "awaiting_realtime") {
      return state.audioUploadMessage || "完整音频已提交，等待实时确认事件。";
    }
    if (state.audioUploadState === "completed") {
      return state.audioUploadMessage || "音频分片已全部落盘。";
    }
    if (state.audioUploadState === "local_only") {
      return state.audioUploadMessage || "当前只做本地录音，没有上传到网关。";
    }
    if (state.audioUploadState === "error") {
      return state.audioUploadMessage || "音频分片上传失败。";
    }
    return state.audioUploadMessage || "当前没有音频分片上传。";
  }

  function getPartialTranscriptMessage(state) {
    if (state.partialTranscriptState === "streaming" && state.partialTranscriptText) {
      return state.partialTranscriptText;
    }
    if (state.partialTranscriptState === "error") {
      return state.partialTranscriptText || "暂时没能显示正在说的话。";
    }
    if (state.recordingState === "recording" || state.audioUploadState === "processing_final") {
      return "正在整理你刚才的话...";
    }
    return "等待你开口说话...";
  }

  function getTextSubmitButtonLabel(state) {
    if (state.textSubmitState === "sending") {
      return "发送中...";
    }
    return "发送文字";
  }

  function getAvatarSpeechStatusMessage(state) {
    if (state.ttsPlaybackState === "synthesizing") {
      return state.ttsPlaybackMessage || "正在准备这段语音。";
    }
    if (state.ttsPlaybackState === "ready") {
      return state.ttsPlaybackMessage || "语音已准备好，可以重播。";
    }
    if (state.ttsPlaybackState === "playing") {
      return state.ttsPlaybackMessage || "正在播放这段回应。";
    }
    if (state.ttsPlaybackState === "completed") {
      return state.ttsPlaybackMessage || "这段回应已播放完成。";
    }
    if (state.ttsPlaybackState === "error") {
      return state.ttsPlaybackMessage || "这段语音暂时无法播放。";
    }
    return state.ttsPlaybackMessage || "等待新的回应并准备语音。";
  }

  function getAvatarVisualState(state) {
    return state.ttsPlaybackState === "playing" ? "speaking" : "idle";
  }

  function getAvatarVisualDetail(state) {
    const avatarProfile = getEffectiveAvatarProfile(state);
    if (state.ttsPlaybackState === "playing") {
      return avatarProfile.speakingDetail;
    }
    return avatarProfile.idleDetail;
  }

  function getAvatarStageNote(state) {
    const effectiveAvatar = getEffectiveAvatarProfile(state);
    const selectedAvatar = getAvatarProfile(state.activeAvatarId);
    if (
      state.sessionId
      && state.sessionAvatarId
      && resolveAvatarId(state.sessionAvatarId) !== resolveAvatarId(state.activeAvatarId)
    ) {
      return `已选 ${selectedAvatar.label}，开始新会话后会切换成这个角色。`;
    }
    return effectiveAvatar.stageNote;
  }

  function getAvatarVoicePreview(state) {
    return getEffectiveAvatarProfile(state).voicePreview;
  }

  function getAvatarMouthDetail(state) {
    if (state.avatarMouthState === "closed") {
      return "当前嘴型闭合。";
    }
    return `当前嘴型：${state.avatarMouthState}。`;
  }

  function buildMouthCueSequence(text, durationMs) {
    const safeDurationMs = Math.max(1200, durationMs || 0);
    const characters = Array.from(String(text || "").trim());
    if (!characters.length) {
      return [{ startMs: 0, endMs: safeDurationMs, mouthState: "closed" }];
    }

    const visibleCharacters = characters.filter(function (character) {
      return !/\s/.test(character);
    });
    const cueCharacters = visibleCharacters.length ? visibleCharacters : characters;
    const stepMs = Math.max(90, Math.min(220, Math.floor(safeDurationMs / Math.max(cueCharacters.length, 1))));
    const cues = [];
    let cursorMs = 0;

    cueCharacters.forEach(function (character, index) {
      const codePoint = character.codePointAt(0) || 0;
      const isPause = /[，。！？,.!?、；;：:]/.test(character);
      let mouthState = "closed";
      if (!isPause) {
        const variant = (codePoint + index) % 3;
        if (variant === 0) {
          mouthState = "small";
        } else if (variant === 1) {
          mouthState = "wide";
        } else {
          mouthState = "round";
        }
      }

      cues.push({
        startMs: cursorMs,
        endMs: Math.min(safeDurationMs, cursorMs + stepMs),
        mouthState,
      });
      cursorMs += stepMs;
    });

    if (!cues.length || cues[cues.length - 1].mouthState !== "closed") {
      cues.push({
        startMs: Math.min(cursorMs, safeDurationMs),
        endMs: safeDurationMs,
        mouthState: "closed",
      });
    } else {
      cues[cues.length - 1].endMs = safeDurationMs;
    }

    return cues;
  }

  function getExportStatusMessage(state) {
    if (state.replayState === "running") {
      return state.replayMessage || "正在按导出日志顺序回放。";
    }
    if (state.replayState === "completed") {
      return state.replayMessage || "回放完成。";
    }
    if (state.replayState === "error") {
      return state.replayMessage || "回放失败。";
    }
    if (!state.sessionId) {
      return "开始或恢复会话后，就可以导出当前记录。";
    }
    if (state.exportState === "loading") {
      return "正在准备会话导出，请稍候。";
    }
    if (state.exportState === "error") {
      return state.exportMessage || "会话导出失败。";
    }
    if (state.exportState === "exported") {
      return state.exportMessage || "会话导出成功。";
    }
    return state.exportMessage || "点击导出，保存当前会话记录。";
  }

  function getExportButtonLabel(state) {
    if (state.exportState === "loading") {
      return "导出中...";
    }
    return "导出记录";
  }

  function getReplayButtonLabel(state) {
    if (state.replayState === "running") {
      return "回放中...";
    }
    return "回放记录";
  }

  function pushConnectionLog(state, message) {
    state.connectionLog = [message].concat(state.connectionLog).slice(0, 6);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderModuleState(rootDocument, elements, state) {
    const activeModule = resolveModuleId(state.activeModule);
    if (rootDocument.body && typeof rootDocument.body.dataset === "object") {
      rootDocument.body.dataset.activeModule = activeModule;
    }

    const moduleButtons = [
      [elements.moduleOptionCapture, "capture"],
      [elements.moduleOptionAvatar, "avatar"],
      [elements.moduleOptionConversation, "conversation"],
      [elements.moduleOptionEmotion, "emotion"],
      [elements.moduleOptionSession, "session"],
    ];

    moduleButtons.forEach(function ([button, moduleId]) {
      if (!button || typeof button.dataset !== "object") {
        return;
      }
      button.dataset.selected = moduleId === activeModule ? "true" : "false";
    });
  }

  function renderTimeline(elements, state) {
    let markup = "";
    let plainText = "";
    let renderKey = "对话记录 | 开始会话后，对话记录会显示在这里。";

    if (!state.timelineEntries.length) {
      markup = [
        '<article class="timeline-item system timeline-empty">',
        '<span class="timeline-role">对话记录</span>',
        "<p>开始会话后，对话记录会显示在这里。</p>",
        "</article>",
      ].join("");
      plainText = "对话记录 | 开始会话后，对话记录会显示在这里。";
    } else {
      markup = state.timelineEntries.map(function (entry) {
        const timestampLabel = entry.timestamp ? formatTimestamp(entry.timestamp) : "未开始";
        return [
          `<article class="timeline-item ${escapeHtml(entry.kind)}">`,
          `<span class="timeline-role">${escapeHtml(entry.label)}</span>`,
          `<p>${escapeHtml(entry.text)}</p>`,
          `<small class="timeline-meta">${escapeHtml(timestampLabel)}</small>`,
          "</article>",
        ].join("");
      }).join("");

      plainText = state.timelineEntries.map(function (entry) {
        const timestampLabel = entry.timestamp ? formatTimestamp(entry.timestamp) : "未开始";
        return `${entry.label} | ${timestampLabel} | ${entry.text}`;
      }).join("\n");
      renderKey = plainText;
    }

    if (
      typeof elements.chatTimelineList.dataset === "object"
      && elements.chatTimelineList.dataset
      && elements.chatTimelineList.dataset.timelineRenderKey === renderKey
    ) {
      return;
    }

    elements.chatTimelineList.innerHTML = markup;
    if (typeof elements.chatTimelineList.querySelector !== "function") {
      elements.chatTimelineList.textContent = plainText;
    }
    if (typeof elements.chatTimelineList.dataset === "object" && elements.chatTimelineList.dataset) {
      elements.chatTimelineList.dataset.timelineText = plainText;
      elements.chatTimelineList.dataset.timelineRenderKey = renderKey;
    }
  }

  function renderAvatarMouthState(rootDocument, elements, state) {
    if (elements.avatarMouthShape && typeof elements.avatarMouthShape.dataset === "object") {
      elements.avatarMouthShape.dataset.mouthState = state.avatarMouthState;
    }
    if (elements.avatarMouthStateValue) {
      elements.avatarMouthStateValue.textContent = state.avatarMouthState;
    }
    if (elements.avatarMouthDetailValue) {
      elements.avatarMouthDetailValue.textContent = getAvatarMouthDetail(state);
    }
    if (rootDocument.body && typeof rootDocument.body.dataset === "object") {
      rootDocument.body.dataset.avatarMouthState = state.avatarMouthState;
      rootDocument.body.dataset.avatarMouthTransitionCount = String(state.avatarMouthTransitionCount);
    }
  }

  function renderAffectPanel(rootDocument, elements, state) {
    const affectSnapshot = state.affectSnapshot || createInitialAffectSnapshot();
    if (elements.emotionPanelStatus) {
      elements.emotionPanelStatus.textContent = affectSnapshot.panelMessage;
    }
    if (elements.textSignalValue) {
      elements.textSignalValue.textContent = affectSnapshot.text.label;
    }
    if (elements.textSignalConfidence) {
      elements.textSignalConfidence.textContent = formatConfidence(affectSnapshot.text.confidence);
    }
    if (elements.textSignalDetail) {
      elements.textSignalDetail.textContent = affectSnapshot.text.detail;
    }
    if (elements.audioSignalValue) {
      elements.audioSignalValue.textContent = affectSnapshot.audio.label;
    }
    if (elements.audioSignalConfidence) {
      elements.audioSignalConfidence.textContent = formatConfidence(affectSnapshot.audio.confidence);
    }
    if (elements.audioSignalDetail) {
      elements.audioSignalDetail.textContent = affectSnapshot.audio.detail;
    }
    if (elements.videoSignalValue) {
      elements.videoSignalValue.textContent = affectSnapshot.video.label;
    }
    if (elements.videoSignalConfidence) {
      elements.videoSignalConfidence.textContent = formatConfidence(affectSnapshot.video.confidence);
    }
    if (elements.videoSignalDetail) {
      elements.videoSignalDetail.textContent = affectSnapshot.video.detail;
    }
    if (elements.fusionEmotionValue) {
      elements.fusionEmotionValue.textContent = affectSnapshot.fusion.emotionState;
    }
    if (elements.fusionEmotionLabelValue) {
      elements.fusionEmotionLabelValue.textContent = (
        affectSnapshot.fusion.emotionState && affectSnapshot.fusion.emotionState !== "pending"
          ? affectSnapshot.fusion.emotionState
          : "待更新"
      );
    }
    const visibleRiskLevel = (
      affectSnapshot.fusion.riskLevel && affectSnapshot.fusion.riskLevel !== "pending"
        ? affectSnapshot.fusion.riskLevel
        : state.lastReplyRiskLevel
    );
    elements.fusionRiskValue.textContent = visibleRiskLevel;
    if (elements.fusionRiskLabelValue) {
      elements.fusionRiskLabelValue.textContent = visibleRiskLevel && visibleRiskLevel !== "pending"
        ? visibleRiskLevel
        : "待更新";
    }
    if (elements.fusionConfidenceValue) {
      elements.fusionConfidenceValue.textContent = formatConfidence(affectSnapshot.fusion.confidence);
    }
    if (elements.fusionConflictValue) {
      elements.fusionConflictValue.textContent = affectSnapshot.fusion.conflict
        ? `conflict: ${affectSnapshot.fusion.conflictReason || "true"}`
        : "conflict: false";
    }
    if (elements.fusionDetailValue) {
      elements.fusionDetailValue.textContent = affectSnapshot.fusion.detail;
    }
    elements.fusionStageValue.textContent = state.lastReplyNextAction && state.lastReplyNextAction !== "pending"
      ? `接下来会更偏向：${state.lastReplyNextAction}`
      : "当前仍在了解你的状态";
    if (elements.emotionSourceOriginValue) {
      elements.emotionSourceOriginValue.textContent = affectSnapshot.sourceContext.origin;
    }
    if (elements.emotionSourceDatasetValue) {
      elements.emotionSourceDatasetValue.textContent = affectSnapshot.sourceContext.dataset;
    }
    if (elements.emotionSourceRecordValue) {
      elements.emotionSourceRecordValue.textContent = affectSnapshot.sourceContext.recordId;
    }
    if (elements.emotionSourceNoteValue) {
      elements.emotionSourceNoteValue.textContent = affectSnapshot.sourceContext.note;
    }
    if (rootDocument.body && typeof rootDocument.body.dataset === "object") {
      rootDocument.body.dataset.affectPanelState = affectSnapshot.panelState;
    }
    return affectSnapshot;
  }

  function renderSessionState(rootDocument, elements, state, appConfig) {
    renderModuleState(rootDocument, elements, state);
    const selectedAvatar = getAvatarProfile(state.activeAvatarId);
    const effectiveAvatar = getEffectiveAvatarProfile(state);
    const avatarExpressionPreset = resolveAvatarExpressionPreset(state);
    const interactionLocked = (
      state.requestState === "loading"
      || state.requestState === "restoring"
      || state.replayState === "running"
    );
    elements.sessionIdValue.textContent = state.sessionId || defaultSessionIdLabel;
    elements.sessionStatusValue.textContent = state.status;
    if (elements.sessionStatusLabelValue) {
      elements.sessionStatusLabelValue.textContent = getVisibleSessionStatusLabel(state);
    }
    elements.sessionStageValue.textContent = state.stage;
    if (elements.sessionStageLabelValue) {
      elements.sessionStageLabelValue.textContent = getVisibleSessionStageLabel(state);
    }
    elements.sessionTraceValue.textContent = state.traceId || "未分配";
    if (elements.lastUserTraceValue) {
      elements.lastUserTraceValue.textContent = state.lastAcceptedTraceId || "暂未记录";
    }
    if (elements.lastReplyTraceValue) {
      elements.lastReplyTraceValue.textContent = state.lastReplyTraceId || "暂未记录";
    }
    elements.sessionUpdatedAtValue.textContent = formatTimestamp(state.updatedAt);
    elements.sessionApiBaseUrlValue.textContent = appConfig.apiBaseUrl;
    elements.sessionWsUrlValue.textContent = appConfig.wsUrl;
    elements.sessionFeedback.textContent = getFeedbackMessage(state);
    elements.startButton.textContent = getStartButtonLabel(state);
    elements.startButton.disabled = interactionLocked;
    if (elements.captureMicPill) {
      elements.captureMicPill.textContent = getVisibleCaptureMicLabel(state);
    }
    if (elements.captureCameraPill) {
      elements.captureCameraPill.textContent = getVisibleCaptureCameraLabel(state);
    }
    if (elements.captureInputPill) {
      elements.captureInputPill.textContent = getVisibleCaptureInputLabel(state);
    }
    if (elements.cameraPermissionStatus) {
      elements.cameraPermissionStatus.textContent = getCameraPermissionStatusMessage(state);
    }
    if (elements.cameraPreviewStateValue) {
      elements.cameraPreviewStateValue.textContent = state.cameraState;
    }
    if (elements.cameraPreviewDetailValue) {
      elements.cameraPreviewDetailValue.textContent = getCameraPreviewDetailMessage(state);
    }
    if (elements.videoUploadStateValue) {
      elements.videoUploadStateValue.textContent = state.videoUploadState;
    }
    if (elements.videoUploadDetailValue) {
      elements.videoUploadDetailValue.textContent = getVideoUploadStatusMessage(state);
    }
    if (elements.micPermissionStatus) {
      elements.micPermissionStatus.textContent = getMicPermissionStatusMessage(state);
    }
    if (elements.micRecordingStateValue) {
      elements.micRecordingStateValue.textContent = state.recordingState;
    }
    if (elements.micRecordingDetailValue) {
      elements.micRecordingDetailValue.textContent = getRecordingDetailMessage(state);
    }
    if (elements.audioUploadStateValue) {
      elements.audioUploadStateValue.textContent = state.audioUploadState;
    }
    if (elements.audioUploadDetailValue) {
      elements.audioUploadDetailValue.textContent = getAudioUploadStatusMessage(state);
    }
    if (elements.transcriptUserPartialText) {
      elements.transcriptUserPartialText.textContent = getPartialTranscriptMessage(state);
    }
    if (elements.micRequestButton) {
      elements.micRequestButton.disabled = (
        state.micPermissionState === "requesting"
        || state.recordingState === "recording"
        || state.connectionStatus === "replay"
      );
    }
    if (elements.cameraRequestButton) {
      elements.cameraRequestButton.disabled = (
        state.cameraPermissionState === "requesting"
        || state.cameraState === "previewing"
        || state.connectionStatus === "replay"
      );
    }
    if (elements.cameraStartButton) {
      elements.cameraStartButton.disabled = (
        state.cameraPermissionState !== "granted"
        || state.cameraState === "previewing"
        || state.connectionStatus === "replay"
      );
    }
    if (elements.cameraStopButton) {
      elements.cameraStopButton.disabled = state.cameraState !== "previewing";
    }
    const micStartDisabled = (
      state.micPermissionState !== "granted"
      || state.recordingState === "recording"
      || state.connectionStatus === "replay"
    );
    const micStopDisabled = state.recordingState !== "recording";
    if (elements.micStartButton) {
      elements.micStartButton.disabled = micStartDisabled;
    }
    if (elements.micStopButton) {
      elements.micStopButton.disabled = micStopDisabled;
    }
    if (elements.avatarMicStartButton) {
      elements.avatarMicStartButton.disabled = micStartDisabled;
    }
    if (elements.avatarMicStopButton) {
      elements.avatarMicStopButton.disabled = micStopDisabled;
    }
    if (elements.exportButton) {
      elements.exportButton.textContent = getExportButtonLabel(state);
      elements.exportButton.disabled = (
        !state.sessionId
        || interactionLocked
        || state.exportState === "loading"
        || state.connectionStatus === "replay"
      );
    }
    if (elements.replayButton) {
      const cachedExport = readExportCache(
        typeof window !== "undefined" ? window : null,
        appConfig,
      );
      elements.replayButton.textContent = getReplayButtonLabel(state);
      elements.replayButton.disabled = (
        !cachedExport
        || !cachedExport.payload
        || interactionLocked
      );
    }
    if (elements.exportStatus) {
      elements.exportStatus.textContent = getExportStatusMessage(state);
    }
    elements.connectionStatusValue.textContent = state.connectionStatus;
    elements.connectionHeartbeatValue.textContent = formatTimestamp(state.lastHeartbeatAt);
    elements.connectionLogValue.textContent = state.connectionLog.join("\n");
    if (elements.textInputField.value !== state.draftText) {
      elements.textInputField.value = state.draftText;
    }
    elements.textInputField.disabled = interactionLocked || state.connectionStatus === "replay";
    elements.textSubmitButton.textContent = getTextSubmitButtonLabel(state);
    elements.textSubmitButton.disabled = (
      !state.sessionId
      || interactionLocked
      || state.connectionStatus !== "connected"
      || state.textSubmitState === "sending"
    );
    elements.textSubmitStatus.textContent = getTextSubmitStatusMessage(state);
    elements.textLastMessageIdValue.textContent = getLatestAcceptedMessageIdValue(state);
    elements.textLastMessageTimeValue.textContent = getLatestAcceptedTimeValue(state);
    if (elements.textLastMessageLabelValue) {
      elements.textLastMessageLabelValue.textContent = getLatestAcceptedMessageLabel(state);
    }
    if (elements.textLastMessageTimeLabelValue) {
      elements.textLastMessageTimeLabelValue.textContent = getLatestAcceptedTimeLabel(state);
    }
    elements.transcriptUserFinalText.textContent = state.lastAcceptedText || "等待你的第一条消息...";
    elements.transcriptAssistantReplyText.textContent = state.lastReplyText || "等待新的回应...";
    elements.avatarLatestReplyText.textContent = state.lastReplyText || "等待新的回应...";
    const avatarVisualState = getAvatarVisualState(state);
    if (elements.avatarBaselineCard && typeof elements.avatarBaselineCard.dataset === "object") {
      elements.avatarBaselineCard.dataset.avatarState = avatarVisualState;
      elements.avatarBaselineCard.dataset.avatarProfile = effectiveAvatar.profileId;
      elements.avatarBaselineCard.dataset.avatarExpressionPreset = avatarExpressionPreset.presetId;
    }
    if (elements.avatarOptionCompanion && typeof elements.avatarOptionCompanion.dataset === "object") {
      elements.avatarOptionCompanion.dataset.selected = selectedAvatar.avatarId === "companion_female_01" ? "true" : "false";
      elements.avatarOptionCompanion.dataset.effective = effectiveAvatar.avatarId === "companion_female_01" ? "true" : "false";
    }
    if (elements.avatarOptionCoach && typeof elements.avatarOptionCoach.dataset === "object") {
      elements.avatarOptionCoach.dataset.selected = selectedAvatar.avatarId === "coach_male_01" ? "true" : "false";
      elements.avatarOptionCoach.dataset.effective = effectiveAvatar.avatarId === "coach_male_01" ? "true" : "false";
    }
    if (elements.avatarOptionCompanion) {
      elements.avatarOptionCompanion.disabled = interactionLocked;
    }
    if (elements.avatarOptionCoach) {
      elements.avatarOptionCoach.disabled = interactionLocked;
    }
    if (elements.avatarLabelValue) {
      elements.avatarLabelValue.textContent = effectiveAvatar.label;
    }
    if (elements.avatarMetaValue) {
      elements.avatarMetaValue.textContent = effectiveAvatar.meta;
    }
    if (elements.avatarCharacterStateValue) {
      elements.avatarCharacterStateValue.textContent = avatarVisualState;
    }
    if (elements.avatarCharacterDetailValue) {
      elements.avatarCharacterDetailValue.textContent = getAvatarVisualDetail(state);
    }
    if (elements.avatarStageNoteValue) {
      elements.avatarStageNoteValue.textContent = getAvatarStageNote(state);
    }
    if (elements.avatarExpressionPresetValue) {
      elements.avatarExpressionPresetValue.textContent = avatarExpressionPreset.label;
    }
    if (elements.avatarExpressionDetailValue) {
      elements.avatarExpressionDetailValue.textContent = avatarExpressionPreset.detail;
    }
    renderAvatarMouthState(rootDocument, elements, state);
    if (elements.avatarSpeechStateValue) {
      elements.avatarSpeechStateValue.textContent = state.ttsPlaybackState;
    }
    if (elements.avatarSpeechDetailValue) {
      elements.avatarSpeechDetailValue.textContent = getAvatarSpeechStatusMessage(state);
    }
    if (elements.avatarVoiceValue) {
      elements.avatarVoiceValue.textContent = state.ttsVoiceId !== "pending"
        ? state.ttsVoiceId
        : getAvatarVoicePreview(state);
    }
    if (elements.avatarDurationValue) {
      elements.avatarDurationValue.textContent = state.ttsDurationMs
        ? `${formatDurationMs(state.ttsDurationMs)} / ${state.ttsAudioFormat}`
        : `0.0s / preview`;
    }
    if (elements.avatarReplayButton) {
      elements.avatarReplayButton.disabled = !state.ttsAudioUrl || state.ttsPlaybackState === "synthesizing";
    }
    const affectSnapshot = renderAffectPanel(rootDocument, elements, state);
    if (elements.timelineUserText) {
      elements.timelineUserText.textContent = (
        state.lastAcceptedText
          || state.partialTranscriptText
          || "等待你开口说话..."
      );
    }
    if (elements.timelineAssistantText) {
      elements.timelineAssistantText.textContent = state.lastReplyText || "等待新的回应...";
    }
    if (elements.timelineStageText) {
      elements.timelineStageText.textContent = state.lastStageTransition;
    }
    renderTimeline(elements, state);

    rootDocument.body.dataset.uiReady = "true";
    rootDocument.body.dataset.sessionState = state.requestState;
    rootDocument.body.dataset.connectionState = state.connectionStatus;
    rootDocument.body.dataset.textSubmitState = state.textSubmitState;
    rootDocument.body.dataset.dialogueReplyState = state.dialogueReplyState;
    rootDocument.body.dataset.historyRestoreState = state.historyRestoreState;
    rootDocument.body.dataset.exportState = state.exportState;
    rootDocument.body.dataset.cameraPermissionState = state.cameraPermissionState;
    rootDocument.body.dataset.cameraState = state.cameraState;
    rootDocument.body.dataset.videoUploadState = state.videoUploadState;
    rootDocument.body.dataset.micPermissionState = state.micPermissionState;
    rootDocument.body.dataset.recordingState = state.recordingState;
    rootDocument.body.dataset.audioUploadState = state.audioUploadState;
    rootDocument.body.dataset.partialTranscriptState = state.partialTranscriptState;
    rootDocument.body.dataset.ttsPlaybackState = state.ttsPlaybackState;
    rootDocument.body.dataset.avatarVisualState = avatarVisualState;
    rootDocument.body.dataset.activeAvatarId = selectedAvatar.avatarId;
    rootDocument.body.dataset.effectiveAvatarId = effectiveAvatar.avatarId;
    rootDocument.body.dataset.effectiveAvatarProfile = effectiveAvatar.profileId;
    rootDocument.body.dataset.avatarExpressionPreset = avatarExpressionPreset.presetId;
  }

  function validateDialogueReplyPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const requiredStringFields = [
      "session_id",
      "trace_id",
      "message_id",
      "reply",
      "emotion",
      "risk_level",
      "stage",
      "next_action",
    ];
    for (const fieldName of requiredStringFields) {
      if (typeof payload[fieldName] !== "string" || payload[fieldName].trim() === "") {
        return null;
      }
    }
    if (!dialogueStages.has(payload.stage)) {
      return null;
    }
    if (!dialogueRiskLevels.has(payload.risk_level)) {
      return null;
    }
    if (payload.knowledge_refs && !Array.isArray(payload.knowledge_refs)) {
      return null;
    }
    if (payload.safety_flags && !Array.isArray(payload.safety_flags)) {
      return null;
    }

    return payload;
  }

  function validateTranscriptPartialPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    if (payload.transcript_kind !== "partial") {
      return null;
    }
    if (typeof payload.text !== "string" || payload.text.trim() === "") {
      return null;
    }
    if (typeof payload.preview_seq !== "number" || payload.preview_seq < 1) {
      return null;
    }
    if (typeof payload.recording_id !== "string" || payload.recording_id.trim() === "") {
      return null;
    }
    return payload;
  }

  function validateTranscriptFinalPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    if (payload.transcript_kind !== "final") {
      return null;
    }
    if (typeof payload.text !== "string" || payload.text.trim() === "") {
      return null;
    }
    return payload;
  }

  async function requestSession(fetchImpl, appConfig) {
    const response = await fetchImpl(`${appConfig.apiBaseUrl}/api/session/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input_modes: ["text", "audio", "video"],
        avatar_id: resolveAvatarId(appConfig.activeAvatarId || appConfig.defaultAvatarId),
        metadata: {
          source: "web-shell",
        },
      }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload && typeof payload.message === "string"
        ? payload.message
        : `Session create failed with status ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  async function requestTextMessage(fetchImpl, appConfig, state, contentText, clientSeq) {
    const response = await fetchImpl(
      `${appConfig.apiBaseUrl}/api/session/${encodeURIComponent(state.sessionId)}/text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content_text: contentText,
          client_seq: clientSeq,
          metadata: {
            source: "web-shell",
          },
        }),
      },
    );

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload && typeof payload.message === "string"
        ? payload.message
        : `Text submit failed with status ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  async function requestAudioChunkUpload(fetchImpl, appConfig, state, payload) {
    const query = new URLSearchParams();
    query.set("chunk_seq", String(payload.chunkSeq));
    if (typeof payload.chunkStartedAtMs === "number") {
      query.set("chunk_started_at_ms", String(payload.chunkStartedAtMs));
    }
    if (typeof payload.durationMs === "number") {
      query.set("duration_ms", String(payload.durationMs));
    }
    query.set("is_final", payload.isFinal ? "true" : "false");

    const response = await fetchImpl(
      `${appConfig.apiBaseUrl}/api/session/${encodeURIComponent(state.sessionId)}/audio/chunk?${query.toString()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": payload.mimeType || "application/octet-stream",
        },
        body: payload.blob,
      },
    );

    let responsePayload = null;
    try {
      responsePayload = await response.json();
    } catch (error) {
      responsePayload = null;
    }

    if (!response.ok) {
      const message = responsePayload && typeof responsePayload.message === "string"
        ? responsePayload.message
        : `Audio chunk upload failed with status ${response.status}`;
      throw new Error(message);
    }

    return responsePayload;
  }

  async function requestVideoFrameUpload(fetchImpl, appConfig, state, payload) {
    const query = new URLSearchParams();
    query.set("frame_seq", String(payload.frameSeq));
    if (typeof payload.capturedAtMs === "number") {
      query.set("captured_at_ms", String(payload.capturedAtMs));
    }
    if (typeof payload.width === "number") {
      query.set("width", String(payload.width));
    }
    if (typeof payload.height === "number") {
      query.set("height", String(payload.height));
    }

    const response = await fetchImpl(
      `${appConfig.apiBaseUrl}/api/session/${encodeURIComponent(state.sessionId)}/video/frame?${query.toString()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": payload.mimeType || "application/octet-stream",
        },
        body: payload.blob,
      },
    );

    let responsePayload = null;
    try {
      responsePayload = await response.json();
    } catch (error) {
      responsePayload = null;
    }

    if (!response.ok) {
      const message = responsePayload && typeof responsePayload.message === "string"
        ? responsePayload.message
        : `Video frame upload failed with status ${response.status}`;
      throw new Error(message);
    }

    return responsePayload;
  }

  async function requestAudioFinalize(fetchImpl, appConfig, state, payload) {
    const query = new URLSearchParams();
    if (typeof payload.durationMs === "number") {
      query.set("duration_ms", String(payload.durationMs));
    }

    const response = await fetchImpl(
      `${appConfig.apiBaseUrl}/api/session/${encodeURIComponent(state.sessionId)}/audio/finalize?${query.toString()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": payload.mimeType || "application/octet-stream",
        },
        body: payload.blob,
      },
    );

    let responsePayload = null;
    try {
      responsePayload = await response.json();
    } catch (error) {
      responsePayload = null;
    }

    if (!response.ok) {
      const message = responsePayload && typeof responsePayload.message === "string"
        ? responsePayload.message
        : `Audio finalize failed with status ${response.status}`;
      throw new Error(message);
    }

    return responsePayload;
  }

  async function requestAudioPreview(fetchImpl, appConfig, state, payload) {
    const query = new URLSearchParams();
    query.set("preview_seq", String(payload.previewSeq));
    query.set("recording_id", payload.recordingId);
    if (typeof payload.durationMs === "number") {
      query.set("duration_ms", String(payload.durationMs));
    }

    const response = await fetchImpl(
      `${appConfig.apiBaseUrl}/api/session/${encodeURIComponent(state.sessionId)}/audio/preview?${query.toString()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": payload.mimeType || "application/octet-stream",
        },
        body: payload.blob,
      },
    );

    let responsePayload = null;
    try {
      responsePayload = await response.json();
    } catch (error) {
      responsePayload = null;
    }

    if (!response.ok) {
      const message = responsePayload && typeof responsePayload.message === "string"
        ? responsePayload.message
        : `Audio preview failed with status ${response.status}`;
      throw new Error(message);
    }

    return responsePayload;
  }

  async function requestSessionState(fetchImpl, appConfig, sessionId) {
    const response = await fetchImpl(
      `${appConfig.apiBaseUrl}/api/session/${encodeURIComponent(sessionId)}/state`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload && typeof payload.message === "string"
        ? payload.message
        : `Session state fetch failed with status ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  async function requestSessionExport(fetchImpl, appConfig, sessionId) {
    const response = await fetchImpl(
      `${appConfig.apiBaseUrl}/api/session/${encodeURIComponent(sessionId)}/export`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload && typeof payload.message === "string"
        ? payload.message
        : `Session export failed with status ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  async function requestTTSSynthesis(fetchImpl, appConfig, payload) {
    const response = await fetchImpl(
      `${appConfig.ttsBaseUrl}/internal/tts/synthesize`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    let responsePayload = null;
    try {
      responsePayload = await response.json();
    } catch (error) {
      responsePayload = null;
    }

    if (!response.ok) {
      const message = responsePayload && typeof responsePayload.detail === "string"
        ? responsePayload.detail
        : `TTS synthesize failed with status ${response.status}`;
      throw new Error(message);
    }

    return responsePayload;
  }

  async function requestRuntimeEvent(fetchImpl, appConfig, state, payload) {
    const response = await fetchImpl(
      `${appConfig.apiBaseUrl}/api/session/${encodeURIComponent(state.sessionId)}/runtime-event`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    let responsePayload = null;
    try {
      responsePayload = await response.json();
    } catch (error) {
      responsePayload = null;
    }

    if (!response.ok) {
      const message = responsePayload && typeof responsePayload.message === "string"
        ? responsePayload.message
        : `Runtime event failed with status ${response.status}`;
      throw new Error(message);
    }

    return responsePayload;
  }

  async function requestAffectAnalysis(fetchImpl, appConfig, payload) {
    const response = await fetchImpl(
      `${appConfig.affectBaseUrl}/internal/affect/analyze`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    let responsePayload = null;
    try {
      responsePayload = await response.json();
    } catch (error) {
      responsePayload = null;
    }

    if (!response.ok) {
      const message = responsePayload && typeof responsePayload.detail === "string"
        ? responsePayload.detail
        : `Affect analyze failed with status ${response.status}`;
      throw new Error(message);
    }

    return responsePayload;
  }

  function validateAffectPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const sourceContext = payload.source_context;
    const textResult = payload.text_result;
    const audioResult = payload.audio_result;
    const videoResult = payload.video_result;
    const fusionResult = payload.fusion_result;
    if (
      !sourceContext
      || typeof sourceContext.origin !== "string"
      || typeof sourceContext.dataset !== "string"
      || typeof sourceContext.record_id !== "string"
      || !textResult
      || typeof textResult.label !== "string"
      || !audioResult
      || typeof audioResult.label !== "string"
      || !videoResult
      || typeof videoResult.label !== "string"
      || !fusionResult
      || typeof fusionResult.emotion_state !== "string"
      || typeof fusionResult.risk_level !== "string"
    ) {
      return null;
    }

    return {
      panelState: "ready",
      panelMessage: "情绪摘要已更新，可继续查看这一轮的整体状态。",
      sourceContext: {
        origin: sourceContext.origin,
        dataset: sourceContext.dataset,
        recordId: sourceContext.record_id,
        note: typeof sourceContext.note === "string"
          ? sourceContext.note
          : "等待会话样本信息",
      },
      text: {
        status: textResult.status || "pending",
        label: textResult.label,
        confidence: typeof textResult.confidence === "number" ? textResult.confidence : 0,
        detail: typeof textResult.detail === "string" ? textResult.detail : "文字线索尚未更新。",
      },
      audio: {
        status: audioResult.status || "pending",
        label: audioResult.label,
        confidence: typeof audioResult.confidence === "number" ? audioResult.confidence : 0,
        detail: typeof audioResult.detail === "string" ? audioResult.detail : "语音线索尚未更新。",
      },
      video: {
        status: videoResult.status || "pending",
        label: videoResult.label,
        confidence: typeof videoResult.confidence === "number" ? videoResult.confidence : 0,
        detail: typeof videoResult.detail === "string" ? videoResult.detail : "画面线索尚未更新。",
      },
      fusion: {
        emotionState: fusionResult.emotion_state,
        riskLevel: fusionResult.risk_level,
        confidence: typeof fusionResult.confidence === "number" ? fusionResult.confidence : 0,
        conflict: fusionResult.conflict === true,
        conflictReason: typeof fusionResult.conflict_reason === "string"
          ? fusionResult.conflict_reason
          : null,
        detail: typeof fusionResult.detail === "string" ? fusionResult.detail : "等待更完整的情绪线索。",
      },
    };
  }

  function buildRealtimeSocketUrl(appConfig, state) {
    const base = appConfig.wsUrl.replace(/\/+$/, "");
    return `${base}/session/${encodeURIComponent(state.sessionId)}?trace_id=${encodeURIComponent(state.traceId || "")}`;
  }

  function getStorage(rootWindow) {
    try {
      if (rootWindow && rootWindow.localStorage) {
        return rootWindow.localStorage;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function readStoredSessionId(rootWindow, appConfig) {
    const storage = getStorage(rootWindow);
    if (!storage || typeof storage.getItem !== "function") {
      return null;
    }
    return storage.getItem(appConfig.activeSessionStorageKey);
  }

  function writeStoredSessionId(rootWindow, appConfig, sessionId) {
    const storage = getStorage(rootWindow);
    if (!storage || typeof storage.setItem !== "function") {
      return;
    }
    storage.setItem(appConfig.activeSessionStorageKey, sessionId);
  }

  function clearStoredSessionId(rootWindow, appConfig) {
    const storage = getStorage(rootWindow);
    if (!storage || typeof storage.removeItem !== "function") {
      return;
    }
    storage.removeItem(appConfig.activeSessionStorageKey);
  }

  function hasTimelineEntry(state, entryId) {
    return state.timelineEntries.some(function (currentEntry) {
      return currentEntry.entryId === entryId;
    });
  }

  function appendTimelineEntry(state, entry) {
    const existingIndex = state.timelineEntries.findIndex(function (currentEntry) {
      return currentEntry.entryId === entry.entryId;
    });
    if (existingIndex === -1) {
      state.timelineEntries = state.timelineEntries.concat([entry]);
      return;
    }
    state.timelineEntries = state.timelineEntries.map(function (currentEntry, index) {
      if (index !== existingIndex) {
        return currentEntry;
      }
      return entry;
    });
  }

  function readExportCache(rootWindow, appConfig) {
    if (rootWindow && rootWindow.__virtualHumanLastExportPayload) {
      return {
        payload: rootWindow.__virtualHumanLastExportPayload,
        fileName: rootWindow.__virtualHumanLastExportFileName || null,
      };
    }
    const storage = getStorage(rootWindow);
    if (!storage || typeof storage.getItem !== "function") {
      return null;
    }
    try {
      const raw = storage.getItem(appConfig.exportCacheStorageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.payload) {
        return null;
      }
      return {
        payload: parsed.payload,
        fileName: typeof parsed.fileName === "string" ? parsed.fileName : null,
      };
    } catch (error) {
      return null;
    }
  }

  function clearExportCache(rootWindow, appConfig) {
    if (!rootWindow || typeof rootWindow !== "object") {
      return;
    }
    rootWindow.__virtualHumanLastExportPayload = null;
    rootWindow.__virtualHumanLastExportFileName = null;
    const storage = getStorage(rootWindow);
    if (storage && typeof storage.removeItem === "function") {
      storage.removeItem(appConfig.exportCacheStorageKey);
    }
  }

  function storeExportCache(rootWindow, appConfig, payload, fileName) {
    if (!rootWindow || typeof rootWindow !== "object") {
      return;
    }
    rootWindow.__virtualHumanLastExportPayload = payload;
    rootWindow.__virtualHumanLastExportFileName = fileName;
    const storage = getStorage(rootWindow);
    if (storage && typeof storage.setItem === "function") {
      storage.setItem(
        appConfig.exportCacheStorageKey,
        JSON.stringify({ payload, fileName }),
      );
    }
  }

  function buildExportFileName(sessionId, exportedAt) {
    const safeTimestamp = String(exportedAt || new Date().toISOString())
      .replaceAll(":", "-")
      .replaceAll(".", "-");
    return `${sessionId || "session"}_${safeTimestamp}.json`;
  }

  function triggerExportDownload(rootDocument, rootWindow, payload, fileName) {
    if (typeof Blob !== "function") {
      return false;
    }
    if (!rootWindow || !rootWindow.URL || typeof rootWindow.URL.createObjectURL !== "function") {
      return false;
    }
    if (!rootDocument || typeof rootDocument.createElement !== "function") {
      return false;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const objectUrl = rootWindow.URL.createObjectURL(blob);
    try {
      const anchor = rootDocument.createElement("a");
      if (!anchor || typeof anchor.click !== "function") {
        return false;
      }
      anchor.href = objectUrl;
      anchor.download = fileName;
      if (rootDocument.body && typeof rootDocument.body.appendChild === "function") {
        rootDocument.body.appendChild(anchor);
      }
      anchor.click();
      if (anchor.parentNode && typeof anchor.parentNode.removeChild === "function") {
        anchor.parentNode.removeChild(anchor);
      }
      return true;
    } finally {
      if (typeof rootWindow.URL.revokeObjectURL === "function") {
        rootWindow.URL.revokeObjectURL(objectUrl);
      }
    }
  }

  function rebuildTimelineFromMessages(messages) {
    const timelineEntries = [];
    let currentStage = "engage";
    let lastAcceptedText = "";
    let lastAcceptedAt = null;
    let lastAcceptedMessageId = null;
    let lastAcceptedSourceKind = null;
    let lastAcceptedTraceId = null;
    let lastReplyText = "";
    let lastReplyAt = null;
    let lastReplyMessageId = null;
    let lastReplyTraceId = null;
    let lastReplyRiskLevel = "pending";
    let lastReplyEmotion = "pending";
    let lastReplyNextAction = "pending";
    let lastStageTransition = "idle → idle";

    messages.forEach(function (message) {
      const metadata = message && typeof message.metadata === "object" && message.metadata
        ? message.metadata
        : {};
      if (message.role === "user") {
        lastAcceptedText = message.content_text;
        lastAcceptedAt = message.submitted_at;
        lastAcceptedMessageId = message.message_id;
        lastAcceptedSourceKind = typeof message.source_kind === "string" ? message.source_kind : null;
        lastAcceptedTraceId = typeof message.trace_id === "string" ? message.trace_id : null;
        timelineEntries.push({
          entryId: `timeline-${message.message_id}`,
          kind: "user",
          label: "用户",
          text: message.content_text,
          timestamp: message.submitted_at,
        });
        return;
      }

      if (message.role === "assistant") {
        const nextStage = typeof metadata.stage === "string" && dialogueStages.has(metadata.stage)
          ? metadata.stage
          : currentStage;
        lastReplyText = message.content_text;
        lastReplyAt = message.submitted_at;
        lastReplyMessageId = message.message_id;
        lastReplyTraceId = typeof message.trace_id === "string" ? message.trace_id : null;
        lastReplyRiskLevel = typeof metadata.risk_level === "string" ? metadata.risk_level : "pending";
        lastReplyEmotion = typeof metadata.emotion === "string" ? metadata.emotion : "pending";
        lastReplyNextAction = typeof metadata.next_action === "string" ? metadata.next_action : "pending";
        lastStageTransition = `${currentStage} → ${nextStage}`;
        timelineEntries.push({
          entryId: `timeline-${message.message_id}`,
          kind: "assistant",
          label: "陪伴方",
          text: message.content_text,
          timestamp: message.submitted_at,
        });
        currentStage = nextStage;
      }
    });

    return {
      timelineEntries,
      currentStage,
      lastAcceptedText,
      lastAcceptedAt,
      lastAcceptedMessageId,
      lastAcceptedSourceKind,
      lastAcceptedTraceId,
      lastReplyText,
      lastReplyAt,
      lastReplyMessageId,
      lastReplyTraceId,
      lastReplyRiskLevel,
      lastReplyEmotion,
      lastReplyNextAction,
      lastStageTransition,
    };
  }

  function normalizeReplayEventEnvelope(rawEvent, index) {
    if (!rawEvent || typeof rawEvent !== "object") {
      return null;
    }
    const eventType = typeof rawEvent.event_type === "string" ? rawEvent.event_type : null;
    if (!eventType) {
      return null;
    }
    return {
      event_id: typeof rawEvent.event_id === "string"
        ? rawEvent.event_id
        : `evt_replay_${String(index + 1).padStart(3, "0")}`,
      event_type: eventType,
      session_id: typeof rawEvent.session_id === "string" ? rawEvent.session_id : null,
      trace_id: typeof rawEvent.trace_id === "string" ? rawEvent.trace_id : null,
      message_id: typeof rawEvent.message_id === "string" ? rawEvent.message_id : null,
      emitted_at: rawEvent.emitted_at || null,
      payload: rawEvent.payload && typeof rawEvent.payload === "object" ? rawEvent.payload : {},
    };
  }

  function buildReplayEventsFromMessages(exportPayload) {
    const messages = Array.isArray(exportPayload && exportPayload.messages)
      ? exportPayload.messages
      : [];
    return messages.map(function (message, index) {
      const metadata = message && typeof message.metadata === "object" && message.metadata
        ? message.metadata
        : {};
      if (message.role === "user") {
        return normalizeReplayEventEnvelope(
          {
            event_type: "message.accepted",
            session_id: exportPayload.session_id || null,
            trace_id: message.trace_id || exportPayload.trace_id || null,
            message_id: message.message_id || null,
            emitted_at: message.submitted_at || null,
            payload: {
              message_id: message.message_id || null,
              trace_id: message.trace_id || exportPayload.trace_id || null,
              source_kind: message.source_kind || "text",
              content_text: message.content_text || "",
              submitted_at: message.submitted_at || null,
            },
          },
          index,
        );
      }
      if (message.role === "assistant") {
        return normalizeReplayEventEnvelope(
          {
            event_type: "dialogue.reply",
            session_id: exportPayload.session_id || null,
            trace_id: message.trace_id || exportPayload.trace_id || null,
            message_id: message.message_id || null,
            emitted_at: message.submitted_at || null,
            payload: {
              session_id: exportPayload.session_id || "",
              trace_id: message.trace_id || exportPayload.trace_id || "",
              message_id: message.message_id || "",
              reply: message.content_text || "",
              emotion: metadata.emotion || "neutral",
              risk_level: metadata.risk_level || "low",
              stage: metadata.stage || exportPayload.stage || "engage",
              next_action: metadata.next_action || "ask_followup",
              knowledge_refs: Array.isArray(metadata.knowledge_refs) ? metadata.knowledge_refs : [],
              safety_flags: Array.isArray(metadata.safety_flags) ? metadata.safety_flags : [],
            },
          },
          index,
        );
      }
      return normalizeReplayEventEnvelope(
        {
          event_type: "session.event",
          session_id: exportPayload.session_id || null,
          trace_id: message.trace_id || exportPayload.trace_id || null,
          message_id: message.message_id || null,
          emitted_at: message.submitted_at || null,
          payload: {
            content_text: message.content_text || "",
          },
        },
        index,
      );
    }).filter(Boolean);
  }

  function buildReplaySequence(exportPayload) {
    const rawEvents = Array.isArray(exportPayload && exportPayload.events) ? exportPayload.events : [];
    const normalizedEvents = rawEvents
      .map(normalizeReplayEventEnvelope)
      .filter(Boolean)
      .sort(function (left, right) {
        const leftMs = left.emitted_at ? new Date(left.emitted_at).getTime() : 0;
        const rightMs = right.emitted_at ? new Date(right.emitted_at).getTime() : 0;
        return leftMs - rightMs;
      });

    if (normalizedEvents.length > 0) {
      return normalizedEvents;
    }
    return buildReplayEventsFromMessages(exportPayload);
  }

  function getReplayDelayMs(appConfig, previousEnvelope, nextEnvelope) {
    if (!previousEnvelope || !nextEnvelope) {
      return appConfig.replayDelayMinMs;
    }
    const previousTime = previousEnvelope.emitted_at ? new Date(previousEnvelope.emitted_at).getTime() : Number.NaN;
    const nextTime = nextEnvelope.emitted_at ? new Date(nextEnvelope.emitted_at).getTime() : Number.NaN;
    if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime) || nextTime <= previousTime) {
      return Math.round((appConfig.replayDelayMinMs + appConfig.replayDelayMaxMs) / 2);
    }
    const scaled = Math.round((nextTime - previousTime) * appConfig.replayDelayScale);
    return Math.max(appConfig.replayDelayMinMs, Math.min(appConfig.replayDelayMaxMs, scaled));
  }

  function hydrateStateFromSessionState(state, payload) {
    const session = payload && payload.session ? payload.session : null;
    const messages = payload && Array.isArray(payload.messages) ? payload.messages : [];
    const reconstructed = rebuildTimelineFromMessages(messages);

    if (!session) {
      return;
    }

    state.sessionId = session.session_id;
    state.sessionAvatarId = resolveAvatarId(session.avatar_id || state.activeAvatarId);
    state.activeAvatarId = state.sessionAvatarId;
    state.traceId = session.trace_id;
    state.status = session.status || "active";
    state.stage = reconstructed.currentStage || session.stage || "engage";
    state.updatedAt = session.updated_at || session.started_at || null;
    state.lastAcceptedText = reconstructed.lastAcceptedText;
    state.lastAcceptedAt = reconstructed.lastAcceptedAt;
    state.lastAcceptedMessageId = reconstructed.lastAcceptedMessageId;
    state.lastAcceptedSourceKind = reconstructed.lastAcceptedSourceKind;
    state.lastAcceptedTraceId = reconstructed.lastAcceptedTraceId;
    state.lastReplyText = reconstructed.lastReplyText;
    state.lastReplyAt = reconstructed.lastReplyAt;
    state.lastReplyMessageId = reconstructed.lastReplyMessageId;
    state.lastReplyTraceId = reconstructed.lastReplyTraceId;
    state.lastReplyRiskLevel = reconstructed.lastReplyRiskLevel;
    state.lastReplyEmotion = reconstructed.lastReplyEmotion;
    state.lastReplyNextAction = reconstructed.lastReplyNextAction;
    state.lastStageTransition = reconstructed.lastStageTransition;
    state.timelineEntries = reconstructed.timelineEntries;
    state.dialogueReplyState = reconstructed.lastReplyMessageId ? "received" : "idle";
    state.affectSnapshot = createInitialAffectSnapshot();
  }

  function initializeConsole(rootDocument, rootWindow, fetchImpl) {
    const missingPanels = findMissingPanels(rootDocument);
    if (missingPanels.length > 0) {
      throw new Error(`Missing static panels: ${missingPanels.join(", ")}`);
    }

    const resolvedFetch = fetchImpl || rootWindow.fetch;
    if (typeof resolvedFetch !== "function") {
      throw new Error("fetch is required to create a session from the frontend shell");
    }

    const appConfig = getAppConfig(rootWindow);
    const elements = getViewElements(rootDocument);
    const state = createInitialSessionState();
    state.activeAvatarId = resolveAvatarId(appConfig.defaultAvatarId);
    const runtime = {
      socket: null,
      heartbeatTimerId: null,
      reconnectTimerId: null,
      cameraFrameTimerId: null,
      recordingTimerId: null,
      reconnectAttempt: 0,
      connectionToken: 0,
      manualClose: false,
      cameraStream: null,
      cameraCanvas: null,
      pendingVideoUploads: 0,
      micStream: null,
      mediaRecorder: null,
      pendingAudioUploads: 0,
      stopRequested: false,
      recordedAudioParts: [],
      finalizingAudio: false,
      previewInFlight: false,
      lastPreviewChunkCount: 0,
      nextPreviewSeq: 1,
      currentRecordingId: null,
      ttsRequestToken: 0,
      avatarMouthTimerId: null,
      avatarMouthCueSequence: [],
      avatarMouthPlaybackStartedAt: null,
      affectRefreshTimerId: null,
      affectRequestToken: 0,
      lastAvatarCommandKey: null,
      replayTimerId: null,
    };

    async function logRuntimeEvent(eventType, payload, messageId) {
      if (!state.sessionId) {
        return null;
      }
      try {
        return await requestRuntimeEvent(resolvedFetch, appConfig, state, {
          event_type: eventType,
          message_id: messageId || null,
          payload,
        });
      } catch (error) {
        return null;
      }
    }

    function clearHeartbeatTimer() {
      if (runtime.heartbeatTimerId) {
        rootWindow.clearInterval(runtime.heartbeatTimerId);
        runtime.heartbeatTimerId = null;
      }
    }

    function clearReconnectTimer() {
      if (runtime.reconnectTimerId) {
        rootWindow.clearTimeout(runtime.reconnectTimerId);
        runtime.reconnectTimerId = null;
      }
    }

    function clearCameraFrameTimer() {
      if (runtime.cameraFrameTimerId) {
        rootWindow.clearInterval(runtime.cameraFrameTimerId);
        runtime.cameraFrameTimerId = null;
      }
    }

    function clearRecordingTimer() {
      if (runtime.recordingTimerId) {
        rootWindow.clearInterval(runtime.recordingTimerId);
        runtime.recordingTimerId = null;
      }
    }

    function clearAvatarMouthTimer() {
      if (runtime.avatarMouthTimerId) {
        rootWindow.clearInterval(runtime.avatarMouthTimerId);
        runtime.avatarMouthTimerId = null;
      }
    }

    function clearAffectRefreshTimer() {
      if (runtime.affectRefreshTimerId) {
        rootWindow.clearTimeout(runtime.affectRefreshTimerId);
        runtime.affectRefreshTimerId = null;
      }
    }

    function clearReplayTimer() {
      if (runtime.replayTimerId) {
        rootWindow.clearTimeout(runtime.replayTimerId);
        runtime.replayTimerId = null;
      }
    }

    function buildAffectRequestPayload(reason) {
      const currentSourceContext = state.affectSnapshot && state.affectSnapshot.sourceContext
        ? state.affectSnapshot.sourceContext
        : null;
      return {
        session_id: state.sessionId,
        trace_id: state.traceId,
        current_stage: state.stage,
        text_input: state.lastAcceptedText || state.partialTranscriptText || state.draftText,
        last_source_kind: state.lastAcceptedSourceKind,
        metadata: {
          source: currentSourceContext && currentSourceContext.origin !== "live_web_session"
            ? currentSourceContext.origin
            : "web-shell",
          refresh_reason: reason || "manual_refresh",
          dataset: currentSourceContext
            ? currentSourceContext.dataset
            : "live_web",
          record_id: currentSourceContext && currentSourceContext.recordId !== "session/pending"
            ? currentSourceContext.recordId
            : `session/${state.sessionId || "pending"}`,
          sample_note: currentSourceContext
            ? currentSourceContext.note
            : "等待会话样本信息",
        },
        capture_state: {
          camera_state: state.cameraState,
          video_upload_state: state.videoUploadState,
          uploaded_video_frame_count: state.uploadedVideoFrameCount,
          recording_state: state.recordingState,
          audio_upload_state: state.audioUploadState,
          uploaded_chunk_count: state.uploadedChunkCount,
        },
      };
    }

    async function refreshAffectPanel(reason) {
      if (!state.sessionId) {
        return null;
      }

      const requestToken = runtime.affectRequestToken + 1;
      runtime.affectRequestToken = requestToken;
      state.affectSnapshot.panelState = "loading";
      state.affectSnapshot.panelMessage = "正在整理这一轮的情绪摘要。";
      renderAffectPanel(rootDocument, elements, state);

      try {
        const payload = await requestAffectAnalysis(
          resolvedFetch,
          appConfig,
          buildAffectRequestPayload(reason),
        );
        if (requestToken !== runtime.affectRequestToken) {
          return null;
        }
        const normalized = validateAffectPayload(payload);
        if (!normalized) {
          state.affectSnapshot = {
            ...state.affectSnapshot,
            panelState: "error",
            panelMessage: "这次情绪摘要暂时无法更新，先保留上一版结果。",
          };
        } else {
          state.affectSnapshot = normalized;
        }
      } catch (error) {
        if (requestToken !== runtime.affectRequestToken) {
          return null;
        }
        state.affectSnapshot = {
          ...state.affectSnapshot,
          panelState: "error",
          panelMessage: error instanceof Error
            ? `情绪摘要暂时不可用：${error.message}`
            : `情绪摘要暂时不可用：${String(error)}`,
        };
      }

      renderAffectPanel(rootDocument, elements, state);
      return state.affectSnapshot;
    }

    function scheduleAffectRefresh(reason, delayMs) {
      if (!state.sessionId) {
        return;
      }
      clearAffectRefreshTimer();
      runtime.affectRefreshTimerId = rootWindow.setTimeout(function () {
        runtime.affectRefreshTimerId = null;
        void refreshAffectPanel(reason);
      }, typeof delayMs === "number" ? delayMs : 180);
    }

    function setAvatarMouthState(nextState) {
      if (state.avatarMouthState === nextState) {
        return;
      }
      state.avatarMouthState = nextState;
      state.avatarMouthTransitionCount += 1;
      renderAvatarMouthState(rootDocument, elements, state);
    }

    function updateAvatarMouthFromElapsed(elapsedMs) {
      const cues = runtime.avatarMouthCueSequence;
      if (!cues.length) {
        setAvatarMouthState("closed");
        return;
      }
      const activeCue = cues.find(function (cue) {
        return elapsedMs >= cue.startMs && elapsedMs < cue.endMs;
      }) || cues[cues.length - 1];
      setAvatarMouthState(activeCue.mouthState);
    }

    function startAvatarMouthAnimation() {
      clearAvatarMouthTimer();
      runtime.avatarMouthPlaybackStartedAt = Date.now();
      updateAvatarMouthFromElapsed(0);
      runtime.avatarMouthTimerId = rootWindow.setInterval(function () {
        const elapsedMs = Math.max(0, Date.now() - (runtime.avatarMouthPlaybackStartedAt || Date.now()));
        updateAvatarMouthFromElapsed(elapsedMs);
      }, 90);
    }

    function stopAvatarMouthAnimation() {
      clearAvatarMouthTimer();
      runtime.avatarMouthPlaybackStartedAt = null;
      runtime.avatarMouthCueSequence = [];
      setAvatarMouthState("closed");
    }

    function buildRecordedAudioBlob() {
      const BlobCtor = getBlobCtor();
      if (!BlobCtor || !runtime.recordedAudioParts.length) {
        return null;
      }
      return new BlobCtor(runtime.recordedAudioParts, {
        type: state.recordingMimeType === "pending"
          ? "application/octet-stream"
          : state.recordingMimeType,
      });
    }

    function stopAvatarAudioPlayback() {
      clearReplayTimer();
      stopAvatarMouthAnimation();
      if (!elements.avatarAudioPlayer) {
        return;
      }
      try {
        if (typeof elements.avatarAudioPlayer.pause === "function") {
          elements.avatarAudioPlayer.pause();
        }
      } catch (error) {
        console.warn("Failed to pause avatar audio cleanly", error);
      }
      if ("currentTime" in elements.avatarAudioPlayer) {
        try {
          elements.avatarAudioPlayer.currentTime = 0;
        } catch (error) {
          console.warn("Failed to reset avatar audio currentTime", error);
        }
      }
    }

    function applyReplayTtsSynthesis(payload) {
      state.ttsAudioUrl = null;
      state.ttsAudioFormat = typeof payload.audio_format === "string" ? payload.audio_format : "pending";
      state.ttsVoiceId = typeof payload.voice_id === "string"
        ? payload.voice_id
        : getAvatarProfile(getEffectiveAvatarId(state)).voicePreview;
      state.ttsDurationMs = typeof payload.duration_ms === "number" ? payload.duration_ms : 0;
      state.ttsGeneratedAt = payload.generated_at || new Date().toISOString();
      runtime.avatarMouthCueSequence = buildMouthCueSequence(state.lastReplyText, state.ttsDurationMs);
      state.ttsPlaybackState = "ready";
      state.ttsPlaybackMessage = "回放模式：语音资源已准备。";
    }

    function applyReplayPlaybackStarted(payload) {
      state.ttsPlaybackState = "playing";
      state.ttsPlaybackMessage = "回放模式：数字人语音播放中。";
      if (typeof payload.duration_ms === "number" && payload.duration_ms > 0) {
        state.ttsDurationMs = payload.duration_ms;
      }
      if (!runtime.avatarMouthCueSequence.length) {
        runtime.avatarMouthCueSequence = buildMouthCueSequence(state.lastReplyText, state.ttsDurationMs);
      }
      startAvatarMouthAnimation();
    }

    function applyReplayPlaybackEnded() {
      state.ttsPlaybackState = "completed";
      state.ttsPlaybackMessage = "回放模式：本轮语音播放完成。";
      stopAvatarMouthAnimation();
    }

    async function replayAssistantAudio() {
      if (!state.ttsAudioUrl || !elements.avatarAudioPlayer || typeof elements.avatarAudioPlayer.play !== "function") {
        state.ttsPlaybackState = "error";
        state.ttsPlaybackMessage = "当前环境不支持语音播放。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return { ...state };
      }

      try {
        if (elements.avatarAudioPlayer.src !== state.ttsAudioUrl) {
          elements.avatarAudioPlayer.src = state.ttsAudioUrl;
          if (typeof elements.avatarAudioPlayer.load === "function") {
            elements.avatarAudioPlayer.load();
          }
        }
        const playResult = elements.avatarAudioPlayer.play();
        if (playResult && typeof playResult.then === "function") {
          await playResult;
        }
      } catch (error) {
        state.ttsPlaybackState = "ready";
        state.ttsPlaybackMessage = getAudioPlaybackRetryMessage(error);
        pushConnectionLog(state, "avatar audio playback failed");
        renderSessionState(rootDocument, elements, state, appConfig);
      }
      return { ...state };
    }

    async function synthesizeAssistantAudio(replyPayload) {
      const requestToken = runtime.ttsRequestToken + 1;
      runtime.ttsRequestToken = requestToken;
      stopAvatarAudioPlayback();
      state.ttsPlaybackState = "synthesizing";
      state.ttsPlaybackMessage = "正在合成语音。";
      state.ttsAudioUrl = null;
      state.ttsAudioFormat = "pending";
      state.ttsVoiceId = "pending";
      state.ttsDurationMs = 0;
      state.ttsGeneratedAt = null;
      runtime.avatarMouthCueSequence = [];
      state.avatarMouthState = "closed";
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        const payload = await requestTTSSynthesis(resolvedFetch, appConfig, {
          text: replyPayload.reply,
          voice_id: getEffectiveAvatarId(state),
          session_id: state.sessionId,
          trace_id: replyPayload.trace_id || state.traceId,
          message_id: replyPayload.message_id,
          subtitle: replyPayload.reply,
        });

        if (requestToken !== runtime.ttsRequestToken) {
          return;
        }

        state.ttsAudioUrl = resolvePlayableTtsAudioUrl(payload.audio_url, appConfig);
        state.ttsAudioFormat = payload.audio_format || "pending";
        state.ttsVoiceId = payload.voice_id || "pending";
        state.ttsDurationMs = typeof payload.duration_ms === "number" ? payload.duration_ms : 0;
        state.ttsGeneratedAt = payload.generated_at || new Date().toISOString();
        runtime.avatarMouthCueSequence = buildMouthCueSequence(payload.subtitle || replyPayload.reply, state.ttsDurationMs);
        state.ttsPlaybackState = "ready";
        state.ttsPlaybackMessage = "语音已生成，准备播放。";
        pushConnectionLog(state, `tts asset ready: ${payload.tts_id || "unknown"}`);
        void logRuntimeEvent(
          "tts.synthesized",
          {
            tts_id: payload.tts_id || null,
            voice_id: payload.voice_id || null,
            audio_format: payload.audio_format || null,
            duration_ms: typeof payload.duration_ms === "number" ? payload.duration_ms : null,
            provider_used: payload.provider_used || null,
            avatar_id: getEffectiveAvatarId(state),
            stage: state.stage,
            risk_level: state.lastReplyRiskLevel,
            emotion: state.lastReplyEmotion,
          },
          replyPayload.message_id,
        );
        renderSessionState(rootDocument, elements, state, appConfig);

        if (elements.avatarAudioPlayer && appConfig.autoplayAssistantAudio) {
          if (typeof elements.avatarAudioPlayer.dataset === "object") {
            elements.avatarAudioPlayer.dataset.mockPlaybackDurationMs = String(
              Math.min(Math.max(state.ttsDurationMs, 700), 1800),
            );
          }
          elements.avatarAudioPlayer.src = state.ttsAudioUrl;
          if (typeof elements.avatarAudioPlayer.load === "function") {
            elements.avatarAudioPlayer.load();
          }
          await replayAssistantAudio();
        }
      } catch (error) {
        if (requestToken !== runtime.ttsRequestToken) {
          return;
        }
        state.ttsPlaybackState = "error";
        state.ttsPlaybackMessage = error instanceof Error ? error.message : String(error);
        pushConnectionLog(state, "tts synthesize failed");
        renderSessionState(rootDocument, elements, state, appConfig);
      }
    }

    function teardownMicrophone() {
      clearRecordingTimer();
      runtime.stopRequested = true;
      runtime.pendingAudioUploads = 0;
      runtime.recordedAudioParts = [];
      runtime.finalizingAudio = false;
      runtime.previewInFlight = false;
      runtime.lastPreviewChunkCount = 0;
      runtime.nextPreviewSeq = 1;
      runtime.currentRecordingId = null;
      stopAvatarAudioPlayback();
      if (runtime.mediaRecorder && runtime.mediaRecorder.state === "recording") {
        try {
          runtime.mediaRecorder.stop();
        } catch (error) {
          console.warn("Failed to stop media recorder cleanly", error);
        }
      }
      runtime.mediaRecorder = null;
      if (runtime.micStream && typeof runtime.micStream.getTracks === "function") {
        runtime.micStream.getTracks().forEach(function (track) {
          if (track && typeof track.stop === "function") {
            track.stop();
          }
        });
      }
      runtime.micStream = null;
    }

    function teardownRealtime(manualClose) {
      clearHeartbeatTimer();
      clearReconnectTimer();
      runtime.manualClose = manualClose;

      if (!runtime.socket) {
        return;
      }

      const socket = runtime.socket;
      runtime.socket = null;
      try {
        socket.close(1000, "session_replaced");
      } catch (error) {
        console.warn("Failed to close previous websocket cleanly", error);
      }
    }

    function sendHeartbeat(connectionToken) {
      if (!runtime.socket || connectionToken !== runtime.connectionToken) {
        return;
      }

      const websocketCtor = rootWindow.WebSocket;
      if (
        typeof websocketCtor !== "function"
        || runtime.socket.readyState !== websocketCtor.OPEN
      ) {
        return;
      }

      runtime.socket.send(
        JSON.stringify({
          type: "ping",
          session_id: state.sessionId,
          trace_id: state.traceId,
          sent_at: new Date().toISOString(),
        }),
      );
    }

    function isTerminalRealtimeClose(event) {
      if (!event || typeof event !== "object") {
        return false;
      }
      const closeCode = typeof event.code === "number" ? event.code : 1000;
      const closeReason = typeof event.reason === "string" ? event.reason : "";
      if (closeCode === 4404) {
        return true;
      }
      return closeReason === "session_not_found";
    }

    function scheduleReconnect() {
      clearReconnectTimer();
      runtime.reconnectAttempt += 1;
      state.connectionStatus = "reconnecting";
      pushConnectionLog(state, `reconnect attempt ${runtime.reconnectAttempt} scheduled`);
      renderSessionState(rootDocument, elements, state, appConfig);

      runtime.reconnectTimerId = rootWindow.setTimeout(function () {
        connectRealtime();
      }, appConfig.reconnectDelayMs);
    }

    function handleRealtimeEnvelope(envelope, options) {
      const resolvedOptions = options || {};
      const shouldTriggerTts = resolvedOptions.triggerTts !== false;
      const shouldScheduleAffect = resolvedOptions.scheduleAffect !== false;
      const replayMode = resolvedOptions.mode === "replay";
      if (!envelope || typeof envelope !== "object") {
        return;
      }

      if (envelope.event_type === "session.connection.ready") {
        state.connectionStatus = "connected";
        pushConnectionLog(state, "socket ready event received");
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (envelope.event_type === "session.heartbeat") {
        state.connectionStatus = "connected";
        state.lastHeartbeatAt = envelope.payload && envelope.payload.server_time
          ? envelope.payload.server_time
          : envelope.emitted_at;
        pushConnectionLog(state, "heartbeat acknowledged");
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (envelope.event_type === "transcript.partial") {
        const payload = validateTranscriptPartialPayload(envelope.payload || null);
        if (!payload) {
          pushConnectionLog(state, "partial transcript rejected: invalid payload");
          renderSessionState(rootDocument, elements, state, appConfig);
          return;
        }
        if (runtime.currentRecordingId && payload.recording_id !== runtime.currentRecordingId) {
          return;
        }
        if (state.lastAcceptedSourceKind === "audio" && state.audioUploadState === "completed") {
          return;
        }
        if (payload.preview_seq < state.lastPartialPreviewSeq) {
          return;
        }
        state.partialTranscriptState = "streaming";
        state.partialTranscriptText = payload.text;
        state.partialTranscriptUpdatedAt = payload.generated_at || envelope.emitted_at;
        state.lastPartialPreviewSeq = payload.preview_seq;
        pushConnectionLog(state, `partial transcript updated: ${payload.preview_seq}`);
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (envelope.event_type === "transcript.final") {
        const payload = validateTranscriptFinalPayload(envelope.payload || null);
        if (!payload) {
          pushConnectionLog(state, "final transcript rejected: invalid payload");
          renderSessionState(rootDocument, elements, state, appConfig);
          return;
        }
        state.partialTranscriptState = "idle";
        state.partialTranscriptText = "";
        state.partialTranscriptUpdatedAt = payload.generated_at || envelope.emitted_at;
        state.lastAcceptedText = payload.text;
        state.lastAcceptedAt = payload.generated_at || envelope.emitted_at;
        state.lastAcceptedSourceKind = payload.source_kind || "audio";
        pushConnectionLog(state, "final transcript received");
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (envelope.event_type === "message.accepted") {
        const payload = envelope.payload || {};
        const acceptedSourceKind = typeof payload.source_kind === "string"
          ? payload.source_kind
          : "text";
        state.status = "active";
        state.updatedAt = payload.submitted_at || envelope.emitted_at;
        state.lastAcceptedMessageId = payload.message_id || envelope.message_id || null;
        state.lastAcceptedSourceKind = acceptedSourceKind;
        state.lastAcceptedTraceId = payload.trace_id || envelope.trace_id || state.traceId;
        state.lastAcceptedAt = payload.submitted_at || envelope.emitted_at;
        state.lastAcceptedText = payload.content_text || state.lastAcceptedText;
        appendTimelineEntry(state, {
          entryId: `timeline-${state.lastAcceptedMessageId || envelope.event_id}`,
          kind: "user",
          label: "用户",
          text: state.lastAcceptedText || "user message",
          timestamp: state.lastAcceptedAt,
        });
        state.pendingMessageId = null;
        if (acceptedSourceKind === "audio") {
          runtime.currentRecordingId = null;
          state.audioUploadState = "completed";
          state.audioUploadMessage = `语音转写完成: ${state.lastAcceptedMessageId || "message.accepted"}`;
          state.partialTranscriptState = "idle";
          state.partialTranscriptText = "";
          state.partialTranscriptUpdatedAt = null;
          state.lastPartialPreviewSeq = 0;
          pushConnectionLog(state, `audio message accepted: ${state.lastAcceptedMessageId || "unknown"}`);
        } else {
          state.textSubmitState = "sent";
          state.textSubmitMessage = `发送成功: ${state.lastAcceptedMessageId || "message.accepted"}`;
          state.draftText = "";
          pushConnectionLog(state, `message accepted: ${state.lastAcceptedMessageId || "unknown"}`);
        }
        renderSessionState(rootDocument, elements, state, appConfig);
        if (shouldScheduleAffect) {
          scheduleAffectRefresh("message_accepted", 80);
        }
        return;
      }

      if (envelope.event_type === "affect.snapshot") {
        const payload = validateAffectPayload(envelope.payload || null);
        if (!payload) {
          pushConnectionLog(state, "affect snapshot rejected: invalid payload");
          renderSessionState(rootDocument, elements, state, appConfig);
          return;
        }
        state.affectSnapshot = payload;
        pushConnectionLog(state, "affect snapshot received");
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (envelope.event_type === "knowledge.retrieved") {
        const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};
        const sources = Array.isArray(payload.source_ids) ? payload.source_ids : [];
        pushConnectionLog(
          state,
          sources.length > 0 ? `knowledge retrieved: ${sources.join(", ")}` : "knowledge retrieved",
        );
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (envelope.event_type === "dialogue.reply") {
        const payload = validateDialogueReplyPayload(envelope.payload || null);
        if (!payload) {
          state.dialogueReplyState = "invalid";
          pushConnectionLog(state, "dialogue reply rejected: invalid payload");
          renderSessionState(rootDocument, elements, state, appConfig);
          return;
        }

        const timelineEntryId = `timeline-${payload.message_id}`;
        const isDuplicateReply = hasTimelineEntry(state, timelineEntryId);
        state.status = "active";
        const replyTimestamp = payload.submitted_at || envelope.emitted_at;
        state.updatedAt = replyTimestamp;
        state.lastReplyMessageId = payload.message_id;
        state.lastReplyTraceId = payload.trace_id || envelope.trace_id || state.traceId;
        state.lastReplyAt = replyTimestamp;
        state.lastReplyText = payload.reply;
        state.lastReplyEmotion = payload.emotion;
        state.lastReplyRiskLevel = payload.risk_level;
        state.lastReplyNextAction = payload.next_action;
        if (!isDuplicateReply) {
          state.lastStageTransition = `${state.stage} → ${payload.stage}`;
        }
        appendTimelineEntry(state, {
          entryId: timelineEntryId,
          kind: "assistant",
          label: "陪伴方",
          text: payload.reply,
          timestamp: replyTimestamp,
        });
        state.stage = payload.stage;
        state.dialogueReplyState = "received";
        pushConnectionLog(state, `dialogue reply received: ${payload.message_id}`);
        renderSessionState(rootDocument, elements, state, appConfig);
        if (shouldScheduleAffect) {
          scheduleAffectRefresh("dialogue_reply", 80);
        }
        if (shouldTriggerTts) {
          void synthesizeAssistantAudio(payload);
        }
        return;
      }

      if (envelope.event_type === "tts.synthesized") {
        const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};
        applyReplayTtsSynthesis(payload);
        pushConnectionLog(state, "replay tts synthesized");
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (envelope.event_type === "tts.playback.started") {
        const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};
        applyReplayPlaybackStarted(payload);
        pushConnectionLog(state, "replay playback started");
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (envelope.event_type === "tts.playback.ended") {
        applyReplayPlaybackEnded();
        pushConnectionLog(state, "replay playback ended");
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (envelope.event_type === "avatar.command") {
        const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};
        if (typeof payload.mouth_state === "string" && payload.mouth_state.trim() !== "") {
          setAvatarMouthState(payload.mouth_state);
        }
        if (replayMode && payload.command === "idle" && state.ttsPlaybackState === "playing") {
          applyReplayPlaybackEnded();
        }
        runtime.lastAvatarCommandKey = `${payload.command || "unknown"}:${envelope.message_id || "pending"}`;
        pushConnectionLog(state, `avatar command: ${payload.command || "unknown"}`);
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (envelope.event_type === "session.error") {
        const errorCode = envelope.payload && envelope.payload.error_code
          ? envelope.payload.error_code
          : "unknown_error";
        if (typeof errorCode === "string" && errorCode.startsWith("dialogue_")) {
          state.dialogueReplyState = "error";
        }
        pushConnectionLog(state, `socket error event: ${errorCode}`);
        renderSessionState(rootDocument, elements, state, appConfig);
      }
    }

    function connectRealtime() {
      if (!state.sessionId) {
        return;
      }

      if (typeof rootWindow.WebSocket !== "function") {
        state.connectionStatus = "unsupported";
        pushConnectionLog(state, "WebSocket unsupported in current runtime");
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      teardownRealtime(false);
      runtime.manualClose = false;
      runtime.connectionToken += 1;
      const connectionToken = runtime.connectionToken;
      const socketUrl = buildRealtimeSocketUrl(appConfig, state);
      const socket = new rootWindow.WebSocket(socketUrl);
      runtime.socket = socket;
      state.connectionStatus = "connecting";
      pushConnectionLog(state, `socket connecting: ${socketUrl}`);
      renderSessionState(rootDocument, elements, state, appConfig);

      socket.addEventListener("open", function () {
        if (connectionToken !== runtime.connectionToken) {
          return;
        }
        state.connectionStatus = "connected";
        runtime.reconnectAttempt = 0;
        pushConnectionLog(state, "socket connected");
        renderSessionState(rootDocument, elements, state, appConfig);
        sendHeartbeat(connectionToken);
        clearHeartbeatTimer();
        runtime.heartbeatTimerId = rootWindow.setInterval(function () {
          sendHeartbeat(connectionToken);
        }, appConfig.heartbeatIntervalMs);
      });

      socket.addEventListener("message", function (event) {
        if (connectionToken !== runtime.connectionToken) {
          return;
        }
        try {
          const envelope = JSON.parse(event.data);
          handleRealtimeEnvelope(envelope);
        } catch (error) {
          pushConnectionLog(state, "received invalid realtime payload");
          renderSessionState(rootDocument, elements, state, appConfig);
        }
      });

      socket.addEventListener("error", function () {
        if (connectionToken !== runtime.connectionToken) {
          return;
        }
        pushConnectionLog(state, "socket transport error");
        renderSessionState(rootDocument, elements, state, appConfig);
      });

      socket.addEventListener("close", function (event) {
        if (connectionToken !== runtime.connectionToken) {
          return;
        }
        clearHeartbeatTimer();
        runtime.socket = null;
        if (runtime.manualClose) {
          return;
        }
        pushConnectionLog(state, `socket closed (${event.code || 1000})`);
        if (isTerminalRealtimeClose(event)) {
          state.connectionStatus = "closed";
          pushConnectionLog(state, `terminal realtime close: ${event.reason || "unknown"}`);
          renderSessionState(rootDocument, elements, state, appConfig);
          return;
        }
        scheduleReconnect();
      });
    }

    async function restoreSessionFromStorage() {
      const storedSessionId = readStoredSessionId(rootWindow, appConfig);
      if (!storedSessionId) {
        return false;
      }

      state.requestState = "restoring";
      state.historyRestoreState = "restoring";
      state.error = null;
      state.connectionStatus = "idle";
      state.lastHeartbeatAt = null;
      state.connectionLog = ["realtime idle"];

      try {
        const payload = await requestSessionState(resolvedFetch, appConfig, storedSessionId);
        hydrateStateFromSessionState(state, payload);
        state.requestState = "ready";
        state.historyRestoreState = "restored";
        pushConnectionLog(state, `session restored: ${storedSessionId}`);
        connectRealtime();
        scheduleAffectRefresh("session_restored", 40);
        return true;
      } catch (error) {
        clearStoredSessionId(rootWindow, appConfig);
        state.requestState = "idle";
        state.historyRestoreState = "error";
        state.error = error instanceof Error ? error.message : String(error);
        pushConnectionLog(state, "session restore failed");
        renderSessionState(rootDocument, elements, state, appConfig);
        return false;
      }
    }

    function finishReplay(sequenceLength) {
      clearReplayTimer();
      state.replayState = "completed";
      state.replayMessage = `回放完成：共重现 ${sequenceLength} 个事件。`;
      state.connectionStatus = "replay";
      state.status = "replay_ready";
      renderSessionState(rootDocument, elements, state, appConfig);
    }

    function scheduleReplayStep(sequence, index) {
      if (index >= sequence.length) {
        finishReplay(sequence.length);
        return;
      }
      const previousEnvelope = index > 0 ? sequence[index - 1] : null;
      const nextEnvelope = sequence[index];
      const delayMs = index === 0
        ? appConfig.replayDelayMinMs
        : getReplayDelayMs(appConfig, previousEnvelope, nextEnvelope);
      runtime.replayTimerId = rootWindow.setTimeout(function () {
        runtime.replayTimerId = null;
        handleRealtimeEnvelope(nextEnvelope, {
          mode: "replay",
          triggerTts: false,
          scheduleAffect: false,
        });
        state.replayEventCount = index + 1;
        state.replayMessage = `正在回放 ${state.replaySourceName || "导出会话"}（${index + 1}/${sequence.length}）`;
        renderSessionState(rootDocument, elements, state, appConfig);
        scheduleReplayStep(sequence, index + 1);
      }, delayMs);
    }

    async function startReplayFromExport() {
      const cachedExport = readExportCache(rootWindow, appConfig);
      if (!cachedExport || !cachedExport.payload) {
        state.replayState = "error";
        state.replayMessage = "未找到可回放的导出 JSON，请先执行 Export。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return { ...state };
      }

      const exportPayload = cachedExport.payload;
      const replaySequence = buildReplaySequence(exportPayload);
      if (!replaySequence.length) {
        state.replayState = "error";
        state.replayMessage = "导出 JSON 中没有可回放的事件或消息。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return { ...state };
      }

      teardownRealtime(true);
      clearAffectRefreshTimer();
      runtime.affectRequestToken += 1;
      runtime.ttsRequestToken += 1;
      clearReplayTimer();
      teardownCamera(true);
      teardownMicrophone();
      stopAvatarAudioPlayback();

      state.sessionId = exportPayload.session_id || "replay_session";
      state.sessionAvatarId = resolveAvatarId(exportPayload.avatar_id || state.activeAvatarId);
      state.activeAvatarId = state.sessionAvatarId;
      state.traceId = exportPayload.trace_id || null;
      state.status = "replay_loading";
      state.stage = "engage";
      state.updatedAt = exportPayload.started_at || exportPayload.exported_at || null;
      state.requestState = "ready";
      state.historyRestoreState = "idle";
      state.error = null;
      state.connectionStatus = "replay";
      state.lastHeartbeatAt = null;
      state.connectionLog = [`replay source loaded: ${cachedExport.fileName || state.sessionId}`];
      state.timelineEntries = [];
      state.textSubmitState = "idle";
      state.textSubmitMessage = "回放模式下禁用实时发送。";
      state.pendingMessageId = null;
      state.lastAcceptedMessageId = null;
      state.lastAcceptedSourceKind = null;
      state.lastAcceptedTraceId = null;
      state.lastAcceptedAt = null;
      state.lastAcceptedText = "";
      state.dialogueReplyState = "idle";
      state.lastReplyMessageId = null;
      state.lastReplyTraceId = null;
      state.lastReplyAt = null;
      state.lastReplyText = "";
      state.lastReplyEmotion = "pending";
      state.lastReplyRiskLevel = "pending";
      state.lastReplyNextAction = "pending";
      state.lastStageTransition = "idle → idle";
      state.affectSnapshot = createInitialAffectSnapshot();
      state.ttsPlaybackState = "idle";
      state.ttsPlaybackMessage = "回放模式准备中。";
      state.ttsAudioUrl = null;
      state.ttsAudioFormat = "pending";
      state.ttsVoiceId = getAvatarProfile(state.sessionAvatarId).voicePreview;
      state.ttsDurationMs = 0;
      state.ttsGeneratedAt = null;
      state.avatarMouthState = "closed";
      state.avatarMouthTransitionCount = 0;
      state.partialTranscriptState = "idle";
      state.partialTranscriptText = "";
      state.partialTranscriptUpdatedAt = null;
      state.lastPartialPreviewSeq = 0;
      state.exportState = "exported";
      state.exportMessage = `已加载回放源: ${cachedExport.fileName || state.sessionId}`;
      state.lastExportedAt = exportPayload.exported_at || null;
      state.lastExportFileName = cachedExport.fileName || null;
      state.replayState = "running";
      state.replayEventCount = 0;
      state.replaySourceName = cachedExport.fileName || state.sessionId;
      state.replayMessage = `准备回放 ${state.replaySourceName}。`;
      renderSessionState(rootDocument, elements, state, appConfig);
      scheduleReplayStep(replaySequence, 0);
      return { ...state };
    }

    async function startSession() {
      teardownRealtime(true);
      clearAffectRefreshTimer();
      runtime.affectRequestToken += 1;
      clearReplayTimer();
      state.sessionId = null;
      state.sessionAvatarId = null;
      state.traceId = null;
      state.status = "idle";
      state.stage = "idle";
      state.updatedAt = null;
      state.requestState = "loading";
      state.historyRestoreState = "idle";
      state.error = null;
      state.connectionStatus = "idle";
      state.lastHeartbeatAt = null;
      state.connectionLog = ["realtime idle"];
      state.timelineEntries = [];
      state.textSubmitState = "idle";
      state.textSubmitMessage = null;
      state.pendingMessageId = null;
      state.lastAcceptedMessageId = null;
      state.lastAcceptedSourceKind = null;
      state.lastAcceptedTraceId = null;
      state.lastAcceptedAt = null;
      state.lastAcceptedText = "";
      state.dialogueReplyState = "idle";
      state.lastReplyMessageId = null;
      state.lastReplyTraceId = null;
      state.lastReplyAt = null;
      state.lastReplyText = "";
      state.lastReplyEmotion = "pending";
      state.lastReplyRiskLevel = "pending";
      state.lastReplyNextAction = "pending";
      state.lastStageTransition = "idle → idle";
      state.affectSnapshot = createInitialAffectSnapshot();
      state.ttsPlaybackState = "idle";
      state.ttsPlaybackMessage = "等待新的回应并准备语音。";
      state.ttsAudioUrl = null;
      state.ttsAudioFormat = "pending";
      state.ttsVoiceId = "pending";
      state.ttsDurationMs = 0;
      state.ttsGeneratedAt = null;
      state.avatarMouthState = "closed";
      state.avatarMouthTransitionCount = 0;
      state.exportState = "idle";
      state.exportMessage = "开始或恢复会话后，就可以导出当前记录。";
      state.lastExportedAt = null;
      state.lastExportFileName = null;
      state.replayState = "idle";
      state.replayMessage = "导出当前记录后，就可以回放这段对话。";
      state.replayEventCount = 0;
      state.replaySourceName = null;
      state.audioUploadState = "idle";
      state.audioUploadMessage = "当前没有音频分片上传。";
      state.uploadedChunkCount = 0;
      state.lastUploadedChunkId = null;
      state.lastUploadedAt = null;
      state.nextAudioChunkSeq = 1;
      state.partialTranscriptState = "idle";
      state.partialTranscriptText = "";
      state.partialTranscriptUpdatedAt = null;
      state.lastPartialPreviewSeq = 0;
      runtime.recordedAudioParts = [];
      runtime.finalizingAudio = false;
      runtime.previewInFlight = false;
      runtime.lastPreviewChunkCount = 0;
      runtime.nextPreviewSeq = 1;
      runtime.currentRecordingId = null;
      runtime.ttsRequestToken += 1;
      stopAvatarAudioPlayback();
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        appConfig.activeAvatarId = resolveAvatarId(state.activeAvatarId);
        const payload = await requestSession(resolvedFetch, appConfig);
        state.sessionId = payload.session_id;
        state.sessionAvatarId = resolveAvatarId(payload.avatar_id || state.activeAvatarId);
        state.traceId = payload.trace_id;
        state.status = payload.status || "created";
        state.stage = payload.stage || "engage";
        state.updatedAt = payload.updated_at || payload.started_at || null;
        state.requestState = "ready";
        writeStoredSessionId(rootWindow, appConfig, state.sessionId);
        pushConnectionLog(state, `session created: ${state.sessionId}`);
        renderSessionState(rootDocument, elements, state, appConfig);
        connectRealtime();
        scheduleAffectRefresh("session_created", 40);
      } catch (error) {
        state.requestState = "error";
        state.error = error instanceof Error ? error.message : String(error);
        renderSessionState(rootDocument, elements, state, appConfig);
      }

      return { ...state };
    }

    function setActiveModule(nextModuleId) {
      const resolvedModuleId = resolveModuleId(nextModuleId);
      if (resolvedModuleId === state.activeModule) {
        return { ...state };
      }
      state.activeModule = resolvedModuleId;
      renderSessionState(rootDocument, elements, state, appConfig);
      return { ...state };
    }

    function selectAvatar(nextAvatarId) {
      const resolvedAvatarId = resolveAvatarId(nextAvatarId);
      if (resolvedAvatarId === state.activeAvatarId) {
        return { ...state };
      }
      state.activeAvatarId = resolvedAvatarId;
      state.activeModule = "avatar";
      appConfig.activeAvatarId = resolvedAvatarId;
      if (!state.sessionId) {
        state.ttsPlaybackState = "idle";
        state.ttsPlaybackMessage = "已选择角色，创建会话后会沿用当前声线。";
        state.ttsAudioUrl = null;
        state.ttsAudioFormat = "pending";
        state.ttsVoiceId = "pending";
        state.ttsDurationMs = 0;
        state.ttsGeneratedAt = null;
      }
      renderSessionState(rootDocument, elements, state, appConfig);
      return { ...state };
    }

    async function exportSession() {
      if (!state.sessionId) {
        state.exportState = "error";
        state.exportMessage = "请先创建或恢复会话。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return { ...state };
      }

      state.exportState = "loading";
      state.exportMessage = null;
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        const payload = await requestSessionExport(resolvedFetch, appConfig, state.sessionId);
        const fileName = buildExportFileName(state.sessionId, payload.exported_at);
        storeExportCache(rootWindow, appConfig, payload, fileName);
        triggerExportDownload(rootDocument, rootWindow, payload, fileName);
        state.exportState = "exported";
        state.lastExportedAt = payload.exported_at || new Date().toISOString();
        state.lastExportFileName = fileName;
        state.exportMessage = `导出成功: ${fileName}`;
        state.replayState = "idle";
        state.replayMessage = `导出缓存已更新，可回放 ${fileName}。`;
        state.replaySourceName = fileName;
        pushConnectionLog(state, `session exported: ${state.sessionId}`);
      } catch (error) {
        state.exportState = "error";
        state.exportMessage = error instanceof Error ? error.message : String(error);
      }

      renderSessionState(rootDocument, elements, state, appConfig);
      if (state.sessionId) {
        scheduleAffectRefresh("microphone_permission_changed", 120);
      }
      return { ...state };
    }

    async function submitText() {
      const contentText = state.draftText.trim();
      if (!state.sessionId) {
        state.textSubmitState = "error";
        state.textSubmitMessage = "请先创建会话。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return { ...state };
      }
      if (state.connectionStatus !== "connected") {
        state.textSubmitState = "error";
        state.textSubmitMessage = "实时连接未就绪，暂时不能发送文本。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return { ...state };
      }
      if (!contentText) {
        state.textSubmitState = "error";
        state.textSubmitMessage = "请输入要发送的文本。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return { ...state };
      }

      state.textSubmitState = "sending";
      state.textSubmitMessage = null;
      state.dialogueReplyState = "idle";
      state.lastReplyMessageId = null;
      state.lastReplyTraceId = null;
      state.lastReplyAt = null;
      state.lastReplyText = "";
      state.lastReplyEmotion = "pending";
      state.lastReplyRiskLevel = "pending";
      state.lastReplyNextAction = "pending";
      state.lastStageTransition = `${state.stage} → ${state.stage}`;
      state.ttsPlaybackState = "idle";
      state.ttsPlaybackMessage = "等待新的回应并准备语音。";
      state.ttsAudioUrl = null;
      state.ttsAudioFormat = "pending";
      state.ttsVoiceId = "pending";
      state.ttsDurationMs = 0;
      state.ttsGeneratedAt = null;
      state.avatarMouthState = "closed";
      state.avatarMouthTransitionCount = 0;
      runtime.ttsRequestToken += 1;
      stopAvatarAudioPlayback();
      renderSessionState(rootDocument, elements, state, appConfig);

      const clientSeq = state.nextClientSeq;
      try {
        const payload = await requestTextMessage(
          resolvedFetch,
          appConfig,
          state,
          contentText,
          clientSeq,
        );
        state.nextClientSeq += 1;
        state.pendingMessageId = payload.message_id;
        state.status = "active";
        state.updatedAt = payload.submitted_at || state.updatedAt;
        if (state.lastAcceptedMessageId === payload.message_id) {
          state.textSubmitState = "sent";
          state.textSubmitMessage = `发送成功: ${payload.message_id}`;
          state.pendingMessageId = null;
          state.draftText = "";
        } else {
          state.textSubmitState = "awaiting_ack";
          state.textSubmitMessage = null;
        }
        sendHeartbeat(runtime.connectionToken);
      } catch (error) {
        state.textSubmitState = "error";
        state.textSubmitMessage = error instanceof Error ? error.message : String(error);
      }

      renderSessionState(rootDocument, elements, state, appConfig);
      return { ...state };
    }

    async function requestCameraAccess() {
      if (state.cameraState === "previewing") {
        return { ...state };
      }

      const navigatorLike = getNavigatorLike(rootWindow);
      if (
        !navigatorLike
        || !navigatorLike.mediaDevices
        || typeof navigatorLike.mediaDevices.getUserMedia !== "function"
      ) {
        state.cameraPermissionState = "unsupported";
        state.cameraPermissionMessage = "当前环境不支持摄像头采集。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return { ...state };
      }

      state.cameraPermissionState = "requesting";
      state.cameraPermissionMessage = "正在请求摄像头权限。";
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        if (!runtime.cameraStream) {
          runtime.cameraStream = await navigatorLike.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
        state.cameraPermissionState = "granted";
        state.cameraPermissionMessage = "摄像头已授权，可以开始预览。";
      } catch (error) {
        const name = error && typeof error === "object" ? error.name : "";
        state.cameraState = "idle";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          state.cameraPermissionState = "denied";
          state.cameraPermissionMessage = "摄像头权限被拒绝，请检查浏览器授权设置。";
        } else {
          state.cameraPermissionState = "error";
          state.cameraPermissionMessage = error instanceof Error ? error.message : String(error);
        }
      }

      renderSessionState(rootDocument, elements, state, appConfig);
      if (state.sessionId) {
        scheduleAffectRefresh("camera_permission_changed", 120);
      }
      return { ...state };
    }

    function teardownCamera(stopTracks) {
      clearCameraFrameTimer();
      if (elements.cameraPreviewVideo) {
        try {
          if (typeof elements.cameraPreviewVideo.pause === "function") {
            elements.cameraPreviewVideo.pause();
          }
        } catch (error) {
          // ignore preview shutdown errors in test and browser runtimes
        }
        if ("srcObject" in elements.cameraPreviewVideo) {
          elements.cameraPreviewVideo.srcObject = null;
        }
      }
      if (stopTracks && runtime.cameraStream && typeof runtime.cameraStream.getTracks === "function") {
        runtime.cameraStream.getTracks().forEach(function (track) {
          if (track && typeof track.stop === "function") {
            track.stop();
          }
        });
        runtime.cameraStream = null;
      }
    }

    function finalizeVideoUploadState() {
      if (state.videoUploadState === "error") {
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }
      if (!state.sessionId) {
        state.videoUploadState = state.cameraState === "previewing" ? "local_only" : "idle";
        state.videoUploadMessage = state.cameraState === "previewing"
          ? "未创建会话，当前只做本地预览，不上传视频帧。"
          : "当前没有视频帧上传。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (state.cameraState === "previewing" || runtime.pendingVideoUploads > 0) {
        state.videoUploadState = "uploading";
        state.videoUploadMessage = runtime.pendingVideoUploads > 0
          ? `正在上传视频帧，已完成 ${state.uploadedVideoFrameCount} 帧，仍有 ${runtime.pendingVideoUploads} 帧进行中。`
          : `摄像头预览中，已上传 ${state.uploadedVideoFrameCount} 帧。`;
      } else if (state.uploadedVideoFrameCount > 0) {
        state.videoUploadState = "completed";
        state.videoUploadMessage = `视频帧上传完成，共 ${state.uploadedVideoFrameCount} 帧。`;
      } else {
        state.videoUploadState = "idle";
        state.videoUploadMessage = "当前没有视频帧上传。";
      }
      renderSessionState(rootDocument, elements, state, appConfig);
    }

    async function buildVideoFramePayload() {
      const BlobCtor = getBlobCtor();
      const previewVideo = elements.cameraPreviewVideo;
      const fallbackMimeType = "image/jpeg";
      const width = previewVideo && previewVideo.videoWidth ? previewVideo.videoWidth : 640;
      const height = previewVideo && previewVideo.videoHeight ? previewVideo.videoHeight : 360;

      if (previewVideo && typeof rootDocument.createElement === "function") {
        const canvas = runtime.cameraCanvas || rootDocument.createElement("canvas");
        runtime.cameraCanvas = canvas;
        if (canvas) {
          canvas.width = width;
          canvas.height = height;
          const context = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
          if (context && typeof context.drawImage === "function") {
            try {
              context.drawImage(previewVideo, 0, 0, width, height);
            } catch (error) {
              // ignore draw failures and fallback to synthetic frame payload
            }
          }
          if (typeof canvas.toBlob === "function") {
            const blob = await new Promise(function (resolve) {
              canvas.toBlob(resolve, fallbackMimeType, 0.82);
            });
            if (blob) {
              return {
                blob,
                mimeType: blob.type || fallbackMimeType,
                width,
                height,
              };
            }
          }
        }
      }

      if (!BlobCtor) {
        return null;
      }

      return {
        blob: new BlobCtor(
          [
            JSON.stringify({
              camera_state: state.cameraState,
              frame_seq: state.nextVideoFrameSeq,
              captured_at: Date.now(),
            }),
          ],
          { type: fallbackMimeType },
        ),
        mimeType: fallbackMimeType,
        width,
        height,
      };
    }

    async function uploadVideoFrame(payload) {
      if (!state.sessionId) {
        state.videoUploadState = "local_only";
        state.videoUploadMessage = "未创建会话，当前只做本地预览，不上传视频帧。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return null;
      }

      runtime.pendingVideoUploads += 1;
      state.videoUploadState = "uploading";
      state.videoUploadMessage = `正在上传第 ${payload.frameSeq} 帧视频快照。`;
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        const responsePayload = await requestVideoFrameUpload(resolvedFetch, appConfig, state, payload);
        state.uploadedVideoFrameCount += 1;
        state.lastUploadedVideoFrameId = responsePayload.media_id || null;
        state.lastVideoUploadedAt = responsePayload.created_at || new Date().toISOString();
        if (state.uploadedVideoFrameCount <= 2) {
          scheduleAffectRefresh("video_frame_uploaded", 120);
        }
        return responsePayload;
      } catch (error) {
        state.videoUploadState = "error";
        state.videoUploadMessage = error instanceof Error ? error.message : String(error);
        renderSessionState(rootDocument, elements, state, appConfig);
        return null;
      } finally {
        runtime.pendingVideoUploads = Math.max(0, runtime.pendingVideoUploads - 1);
        finalizeVideoUploadState();
      }
    }

    async function captureAndUploadVideoFrame() {
      if (state.cameraState !== "previewing") {
        return null;
      }

      const capturePayload = await buildVideoFramePayload();
      if (!capturePayload) {
        state.videoUploadState = "error";
        state.videoUploadMessage = "当前环境不支持视频帧序列化。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return null;
      }

      const frameSeq = state.nextVideoFrameSeq;
      state.nextVideoFrameSeq += 1;
      return uploadVideoFrame({
        blob: capturePayload.blob,
        frameSeq,
        capturedAtMs: Math.max(0, Date.now()),
        width: capturePayload.width,
        height: capturePayload.height,
        mimeType: capturePayload.mimeType,
      });
    }

    async function startCameraPreview() {
      if (state.cameraState === "previewing") {
        return { ...state };
      }

      if (state.cameraPermissionState !== "granted" || !runtime.cameraStream) {
        await requestCameraAccess();
      }
      if (state.cameraPermissionState !== "granted" || !runtime.cameraStream) {
        state.cameraState = "error";
        state.cameraPreviewMessage = "摄像头未就绪，无法开始预览。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return { ...state };
      }

      if (elements.cameraPreviewVideo && "srcObject" in elements.cameraPreviewVideo) {
        elements.cameraPreviewVideo.srcObject = runtime.cameraStream;
      }
      if (elements.cameraPreviewVideo && typeof elements.cameraPreviewVideo.play === "function") {
        try {
          await elements.cameraPreviewVideo.play();
        } catch (error) {
          state.cameraState = "error";
          state.cameraPreviewMessage = error instanceof Error ? error.message : String(error);
          renderSessionState(rootDocument, elements, state, appConfig);
          return { ...state };
        }
      }

      clearCameraFrameTimer();
      state.cameraState = "previewing";
      state.cameraPreviewMessage = "摄像头预览中，正在低频抽帧上传。";
      state.videoUploadState = state.sessionId ? "uploading" : "local_only";
      state.videoUploadMessage = state.sessionId
        ? "摄像头已开启，等待第一帧上传。"
        : "摄像头已开启，但当前会话未创建，只做本地预览。";
      state.uploadedVideoFrameCount = 0;
      state.lastUploadedVideoFrameId = null;
      state.lastVideoUploadedAt = null;
      state.nextVideoFrameSeq = 1;
      renderSessionState(rootDocument, elements, state, appConfig);
      scheduleAffectRefresh("camera_preview_started", 80);

      void captureAndUploadVideoFrame();
      runtime.cameraFrameTimerId = rootWindow.setInterval(function () {
        void captureAndUploadVideoFrame();
      }, appConfig.videoFrameUploadIntervalMs);

      return { ...state };
    }

    function stopCameraPreview() {
      if (state.cameraState !== "previewing") {
        return { ...state };
      }

      teardownCamera(true);
      state.cameraState = "stopped";
      state.cameraPreviewMessage = "摄像头预览已停止。";
      finalizeVideoUploadState();
      scheduleAffectRefresh("camera_preview_stopped", 80);
      return { ...state };
    }

    async function requestMicrophoneAccess() {
      if (state.recordingState === "recording") {
        return { ...state };
      }

      const navigatorLike = getNavigatorLike(rootWindow);
      if (
        !navigatorLike
        || !navigatorLike.mediaDevices
        || typeof navigatorLike.mediaDevices.getUserMedia !== "function"
      ) {
        state.micPermissionState = "unsupported";
        state.micPermissionMessage = "当前环境不支持麦克风采集。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return { ...state };
      }

      state.micPermissionState = "requesting";
      state.micPermissionMessage = "正在请求麦克风权限。";
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        if (runtime.micStream) {
          state.micPermissionState = "granted";
          state.micPermissionMessage = "麦克风已授权，可以开始录音。";
          renderSessionState(rootDocument, elements, state, appConfig);
          return { ...state };
        }

        runtime.micStream = await navigatorLike.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        state.micPermissionState = "granted";
        state.micPermissionMessage = "麦克风已授权，可以开始录音。";
      } catch (error) {
        const name = error && typeof error === "object" ? error.name : "";
        state.recordingState = "idle";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          state.micPermissionState = "denied";
          state.micPermissionMessage = "麦克风权限被拒绝，请检查浏览器授权设置。";
        } else {
          state.micPermissionState = "error";
          state.micPermissionMessage = error instanceof Error ? error.message : String(error);
        }
      }

      renderSessionState(rootDocument, elements, state, appConfig);
      return { ...state };
    }

    function finalizeAudioUploadState() {
      if (state.audioUploadState === "error") {
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }
      if (
        runtime.finalizingAudio
        && (state.audioUploadState === "processing_final" || state.audioUploadState === "awaiting_realtime")
      ) {
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (!state.sessionId) {
        state.audioUploadState = "local_only";
        state.audioUploadMessage = "未创建会话，当前只做本地录音，不上传到网关。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      if (state.recordingState === "recording" || runtime.pendingAudioUploads > 0) {
        state.audioUploadState = "uploading";
        state.audioUploadMessage = (
          runtime.pendingAudioUploads > 0
            ? `正在上传音频分片，已完成 ${state.uploadedChunkCount} 个，仍有 ${runtime.pendingAudioUploads} 个进行中。`
            : `正在等待新的音频分片，已完成 ${state.uploadedChunkCount} 个。`
        );
      } else {
        state.audioUploadState = "completed";
        state.audioUploadMessage = `音频分片上传完成，共 ${state.uploadedChunkCount} 个。`;
      }
      renderSessionState(rootDocument, elements, state, appConfig);
    }

    function getBlobCtor() {
      if (rootWindow && typeof rootWindow.Blob === "function") {
        return rootWindow.Blob;
      }
      if (typeof Blob === "function") {
        return Blob;
      }
      return null;
    }

    async function waitForPendingAudioUploads() {
      while (runtime.pendingAudioUploads > 0) {
        await new Promise(function (resolve) {
          rootWindow.setTimeout(resolve, 20);
        });
      }
    }

    async function maybeSendAudioPreview() {
      if (!appConfig.enableAudioPreview) {
        return;
      }
      if (!state.sessionId || state.recordingState !== "recording") {
        return;
      }
      if (runtime.finalizingAudio || runtime.previewInFlight) {
        return;
      }
      if (runtime.recordedAudioParts.length < appConfig.audioPreviewChunkThreshold) {
        return;
      }
      if (runtime.recordedAudioParts.length === runtime.lastPreviewChunkCount) {
        return;
      }

      const previewBlob = buildRecordedAudioBlob();
      if (!previewBlob) {
        return;
      }

      const previewSeq = runtime.nextPreviewSeq;
      runtime.nextPreviewSeq += 1;
      runtime.previewInFlight = true;
      state.partialTranscriptState = "pending";
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        await requestAudioPreview(resolvedFetch, appConfig, state, {
          blob: previewBlob,
          durationMs: Math.max(0, Math.round(state.recordingDurationMs)),
          mimeType: previewBlob.type || state.recordingMimeType || "application/octet-stream",
          previewSeq,
          recordingId: runtime.currentRecordingId,
        });
        runtime.lastPreviewChunkCount = runtime.recordedAudioParts.length;
      } catch (error) {
        state.partialTranscriptState = "error";
        state.partialTranscriptText = error instanceof Error ? error.message : String(error);
        state.partialTranscriptUpdatedAt = new Date().toISOString();
        pushConnectionLog(state, "audio preview failed");
        renderSessionState(rootDocument, elements, state, appConfig);
      } finally {
        runtime.previewInFlight = false;
        if (
          state.recordingState === "recording"
          && runtime.recordedAudioParts.length > runtime.lastPreviewChunkCount
        ) {
          void maybeSendAudioPreview();
        }
      }
    }

    async function finalizeRecordedAudio() {
      if (!appConfig.enableAudioFinalize || runtime.finalizingAudio) {
        return;
      }
      if (!state.sessionId || !runtime.recordedAudioParts.length) {
        finalizeAudioUploadState();
        return;
      }

      const finalBlob = buildRecordedAudioBlob();
      if (!finalBlob) {
        state.audioUploadState = "error";
        state.audioUploadMessage = "当前环境不支持 Blob，无法提交完整录音。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return;
      }

      runtime.finalizingAudio = true;
      state.dialogueReplyState = "idle";
      state.lastReplyMessageId = null;
      state.lastReplyTraceId = null;
      state.lastReplyAt = null;
      state.lastReplyText = "";
      state.lastReplyEmotion = "pending";
      state.lastReplyRiskLevel = "pending";
      state.lastReplyNextAction = "pending";
      state.lastStageTransition = `${state.stage} → ${state.stage}`;
      state.ttsPlaybackState = "idle";
      state.ttsPlaybackMessage = "等待新的回应并准备语音。";
      state.ttsAudioUrl = null;
      state.ttsAudioFormat = "pending";
      state.ttsVoiceId = "pending";
      state.ttsDurationMs = 0;
      state.ttsGeneratedAt = null;
      state.avatarMouthState = "closed";
      state.avatarMouthTransitionCount = 0;
      runtime.ttsRequestToken += 1;
      stopAvatarAudioPlayback();
      state.audioUploadState = "processing_final";
      state.audioUploadMessage = "录音结束，正在提交完整音频并等待 ASR 结果。";
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        await waitForPendingAudioUploads();
        const payload = await requestAudioFinalize(resolvedFetch, appConfig, state, {
          blob: finalBlob,
          durationMs: Math.max(0, Math.round(state.recordingDurationMs)),
          mimeType: finalBlob.type || state.recordingMimeType || "application/octet-stream",
        });

        state.pendingMessageId = payload.message_id || null;
        if (state.lastAcceptedMessageId === payload.message_id) {
          state.audioUploadState = "completed";
          state.audioUploadMessage = `语音转写完成: ${payload.message_id}`;
        } else {
          state.audioUploadState = "awaiting_realtime";
          state.audioUploadMessage = "完整音频已提交，等待实时确认事件。";
        }
      } catch (error) {
        state.audioUploadState = "error";
        state.audioUploadMessage = error instanceof Error ? error.message : String(error);
      } finally {
        runtime.finalizingAudio = false;
        renderSessionState(rootDocument, elements, state, appConfig);
      }
    }

    async function uploadAudioChunk(blob, options) {
      if (!state.sessionId) {
        state.audioUploadState = "local_only";
        state.audioUploadMessage = "未创建会话，当前只做本地录音，不上传到网关。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return null;
      }

      runtime.pendingAudioUploads += 1;
      state.audioUploadState = "uploading";
      state.audioUploadMessage = `正在上传第 ${options.chunkSeq} 个音频分片。`;
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        const payload = await requestAudioChunkUpload(resolvedFetch, appConfig, state, {
          blob,
          chunkSeq: options.chunkSeq,
          chunkStartedAtMs: options.chunkStartedAtMs,
          durationMs: options.durationMs,
          isFinal: options.isFinal,
          mimeType: options.mimeType,
        });
        state.uploadedChunkCount += 1;
        state.lastUploadedChunkId = payload.media_id || null;
        state.lastUploadedAt = payload.created_at || new Date().toISOString();
        return payload;
      } catch (error) {
        state.audioUploadState = "error";
        state.audioUploadMessage = error instanceof Error ? error.message : String(error);
        renderSessionState(rootDocument, elements, state, appConfig);
        return null;
      } finally {
        runtime.pendingAudioUploads = Math.max(0, runtime.pendingAudioUploads - 1);
        finalizeAudioUploadState();
      }
    }

    async function startRecording() {
      if (state.recordingState === "recording") {
        return { ...state };
      }

      if (state.micPermissionState !== "granted" || !runtime.micStream) {
        await requestMicrophoneAccess();
      }

      if (state.micPermissionState !== "granted" || !runtime.micStream) {
        state.recordingState = "error";
        renderSessionState(rootDocument, elements, state, appConfig);
        return { ...state };
      }

      const MediaRecorderCtor = getMediaRecorderCtor(rootWindow);
      if (!MediaRecorderCtor) {
        state.recordingState = "error";
        state.micPermissionMessage = "当前环境不支持 MediaRecorder。";
        renderSessionState(rootDocument, elements, state, appConfig);
        return { ...state };
      }

      clearRecordingTimer();
      runtime.stopRequested = false;
      runtime.pendingAudioUploads = 0;
      runtime.recordedAudioParts = [];
      runtime.finalizingAudio = false;
      runtime.previewInFlight = false;
      runtime.lastPreviewChunkCount = 0;
      runtime.nextPreviewSeq = 1;
      runtime.currentRecordingId = `rec_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      state.recordingState = "recording";
      state.recordingDurationMs = 0;
      state.recordingChunkCount = 0;
      state.recordingStartedAt = new Date().toISOString();
      state.recordingMimeType = "pending";
      state.audioUploadState = state.sessionId ? "uploading" : "local_only";
      state.audioUploadMessage = state.sessionId
        ? "录音已开始，等待音频分片上传。"
        : "未创建会话，当前只做本地录音，不上传到网关。";
      state.uploadedChunkCount = 0;
      state.lastUploadedChunkId = null;
      state.lastUploadedAt = null;
      state.nextAudioChunkSeq = 1;
      state.partialTranscriptState = "idle";
      state.partialTranscriptText = "";
      state.partialTranscriptUpdatedAt = null;
      state.lastPartialPreviewSeq = 0;

      const recorder = new MediaRecorderCtor(runtime.micStream);
      runtime.mediaRecorder = recorder;
      recorder.addEventListener("dataavailable", function (event) {
        if (event && event.data && (typeof event.data.size !== "number" || event.data.size > 0)) {
          runtime.recordedAudioParts.push(event.data);
          state.recordingChunkCount += 1;
          if (event.data.type) {
            state.recordingMimeType = event.data.type;
          }
          const currentChunkSeq = state.nextAudioChunkSeq;
          state.nextAudioChunkSeq += 1;
          const isFinal = runtime.stopRequested && recorder.state !== "recording";
          void uploadAudioChunk(event.data, {
            chunkSeq: currentChunkSeq,
            chunkStartedAtMs: (currentChunkSeq - 1) * 250,
            durationMs: 250,
            isFinal,
            mimeType: event.data.type || recorder.mimeType || "application/octet-stream",
          });
          void maybeSendAudioPreview();
          renderSessionState(rootDocument, elements, state, appConfig);
        }
      });
      recorder.addEventListener("stop", function () {
        clearRecordingTimer();
        state.recordingState = "stopped";
        runtime.mediaRecorder = null;
        finalizeAudioUploadState();
        if (appConfig.enableAudioFinalize) {
          void finalizeRecordedAudio();
        }
      });
      recorder.addEventListener("error", function (event) {
        clearRecordingTimer();
        runtime.mediaRecorder = null;
        state.recordingState = "error";
        state.micPermissionMessage = event && event.error && event.error.message
          ? event.error.message
          : "录音过程中发生错误。";
        renderSessionState(rootDocument, elements, state, appConfig);
      });

      recorder.start(250);
      runtime.recordingTimerId = rootWindow.setInterval(function () {
        if (!state.recordingStartedAt) {
          return;
        }
        state.recordingDurationMs = Math.max(
          0,
          Date.now() - new Date(state.recordingStartedAt).getTime(),
        );
        renderSessionState(rootDocument, elements, state, appConfig);
      }, 100);

      renderSessionState(rootDocument, elements, state, appConfig);
      scheduleAffectRefresh("recording_started", 80);
      return { ...state };
    }

    function stopRecording() {
      if (!runtime.mediaRecorder || runtime.mediaRecorder.state !== "recording") {
        return { ...state };
      }
      try {
        runtime.stopRequested = true;
        runtime.mediaRecorder.stop();
        scheduleAffectRefresh("recording_stopped", 80);
      } catch (error) {
        clearRecordingTimer();
        runtime.mediaRecorder = null;
        state.recordingState = "error";
        state.micPermissionMessage = error instanceof Error ? error.message : String(error);
        renderSessionState(rootDocument, elements, state, appConfig);
      }
      return { ...state };
    }

    function forceRealtimeDropForTest() {
      if (!runtime.socket) {
        return false;
      }
      runtime.manualClose = false;
      runtime.socket.close(4001, "forced_test_drop");
      return true;
    }

    function shutdownForTest() {
      teardownRealtime(true);
      clearAffectRefreshTimer();
      runtime.affectRequestToken += 1;
      teardownCamera(true);
      teardownMicrophone();
      state.connectionStatus = "closed";
      pushConnectionLog(state, "realtime shutdown");
      renderSessionState(rootDocument, elements, state, appConfig);
      return true;
    }

    if (elements.moduleOptionCapture) {
      elements.moduleOptionCapture.addEventListener("click", function () {
        return setActiveModule("capture");
      });
    }
    if (elements.moduleOptionAvatar) {
      elements.moduleOptionAvatar.addEventListener("click", function () {
        return setActiveModule("avatar");
      });
    }
    if (elements.moduleOptionConversation) {
      elements.moduleOptionConversation.addEventListener("click", function () {
        return setActiveModule("conversation");
      });
    }
    if (elements.moduleOptionEmotion) {
      elements.moduleOptionEmotion.addEventListener("click", function () {
        return setActiveModule("emotion");
      });
    }
    if (elements.moduleOptionSession) {
      elements.moduleOptionSession.addEventListener("click", function () {
        return setActiveModule("session");
      });
    }
    elements.startButton.addEventListener("click", function () {
      state.activeModule = "session";
      return startSession();
    });
    if (elements.cameraRequestButton) {
      elements.cameraRequestButton.addEventListener("click", function () {
        return requestCameraAccess();
      });
    }
    if (elements.cameraStartButton) {
      elements.cameraStartButton.addEventListener("click", function () {
        return startCameraPreview();
      });
    }
    if (elements.cameraStopButton) {
      elements.cameraStopButton.addEventListener("click", function () {
        return stopCameraPreview();
      });
    }
    if (elements.avatarOptionCompanion) {
      elements.avatarOptionCompanion.addEventListener("click", function () {
        return selectAvatar("companion_female_01");
      });
    }
    if (elements.avatarOptionCoach) {
      elements.avatarOptionCoach.addEventListener("click", function () {
        return selectAvatar("coach_male_01");
      });
    }
    if (elements.micRequestButton) {
      elements.micRequestButton.addEventListener("click", function () {
        return requestMicrophoneAccess();
      });
    }
    if (elements.micStartButton) {
      elements.micStartButton.addEventListener("click", function () {
        return startRecording();
      });
    }
    if (elements.avatarMicStartButton) {
      elements.avatarMicStartButton.addEventListener("click", function () {
        state.activeModule = "avatar";
        return startRecording();
      });
    }
    if (elements.micStopButton) {
      elements.micStopButton.addEventListener("click", function () {
        return stopRecording();
      });
    }
    if (elements.avatarMicStopButton) {
      elements.avatarMicStopButton.addEventListener("click", function () {
        state.activeModule = "avatar";
        return stopRecording();
      });
    }
    elements.textSubmitButton.addEventListener("click", function () {
      return submitText();
    });
    if (elements.exportButton) {
      elements.exportButton.addEventListener("click", function () {
        return exportSession();
      });
    }
    if (elements.replayButton) {
      elements.replayButton.addEventListener("click", function () {
        return startReplayFromExport();
      });
    }
    if (elements.avatarReplayButton) {
      elements.avatarReplayButton.addEventListener("click", function () {
        return replayAssistantAudio();
      });
    }
    if (elements.avatarAudioPlayer) {
      elements.avatarAudioPlayer.addEventListener("play", function () {
        state.ttsPlaybackState = "playing";
        state.ttsPlaybackMessage = "数字人语音播放中。";
        startAvatarMouthAnimation();
        runtime.lastAvatarCommandKey = `speak:${state.lastReplyMessageId || "pending"}`;
        void logRuntimeEvent(
          "tts.playback.started",
          {
            avatar_id: getEffectiveAvatarId(state),
            voice_id: state.ttsVoiceId,
            duration_ms: state.ttsDurationMs,
            audio_format: state.ttsAudioFormat,
          },
          state.lastReplyMessageId,
        );
        void logRuntimeEvent(
          "avatar.command",
          {
            command: "speak",
            avatar_id: getEffectiveAvatarId(state),
            stage: state.stage,
            risk_level: state.lastReplyRiskLevel,
            expression_preset: resolveAvatarExpressionPreset(state).presetId,
            mouth_state: state.avatarMouthState,
          },
          state.lastReplyMessageId,
        );
        renderSessionState(rootDocument, elements, state, appConfig);
      });
      elements.avatarAudioPlayer.addEventListener("ended", function () {
        state.ttsPlaybackState = "completed";
        state.ttsPlaybackMessage = "本轮语音播放完成。";
        stopAvatarMouthAnimation();
        runtime.lastAvatarCommandKey = `idle:${state.lastReplyMessageId || "pending"}`;
        void logRuntimeEvent(
          "tts.playback.ended",
          {
            avatar_id: getEffectiveAvatarId(state),
            voice_id: state.ttsVoiceId,
            duration_ms: state.ttsDurationMs,
            audio_format: state.ttsAudioFormat,
          },
          state.lastReplyMessageId,
        );
        void logRuntimeEvent(
          "avatar.command",
          {
            command: "idle",
            avatar_id: getEffectiveAvatarId(state),
            stage: state.stage,
            risk_level: state.lastReplyRiskLevel,
            expression_preset: resolveAvatarExpressionPreset(state).presetId,
            mouth_state: state.avatarMouthState,
          },
          state.lastReplyMessageId,
        );
        renderSessionState(rootDocument, elements, state, appConfig);
      });
      elements.avatarAudioPlayer.addEventListener("pause", function () {
        if (state.ttsPlaybackState === "playing") {
          stopAvatarMouthAnimation();
        }
      });
      elements.avatarAudioPlayer.addEventListener("error", function () {
        const activeSource = elements.avatarAudioPlayer.currentSrc || elements.avatarAudioPlayer.src || "";
        if (!state.ttsAudioUrl) {
          return;
        }
        if (state.ttsPlaybackState === "completed" || state.ttsPlaybackState === "idle") {
          return;
        }
        if (activeSource && !sameAudioSource(activeSource, state.ttsAudioUrl)) {
          return;
        }
        state.ttsPlaybackState = "ready";
        state.ttsPlaybackMessage = "语音资源已生成，但浏览器未能加载音频资源，可点击重播语音重试。";
        stopAvatarMouthAnimation();
        renderSessionState(rootDocument, elements, state, appConfig);
      });
    }
    elements.textInputField.addEventListener("input", function (event) {
      state.draftText = event.currentTarget.value;
      if (state.textSubmitState === "error") {
        state.textSubmitState = "idle";
        state.textSubmitMessage = null;
      }
      renderSessionState(rootDocument, elements, state, appConfig);
      if (state.sessionId) {
        scheduleAffectRefresh("draft_changed", 220);
      }
    });

    renderSessionState(rootDocument, elements, state, appConfig);
    restoreSessionFromStorage();
    rootWindow.__virtualHumanConsoleController = {
      getState: function () {
        return { ...state };
      },
      startSession,
      requestCameraAccess,
      startCameraPreview,
      stopCameraPreview,
      requestMicrophoneAccess,
      startRecording,
      stopRecording,
      submitText,
      refreshAffectPanel,
      replayAssistantAudio,
      exportSession,
      startReplayFromExport,
      restoreSessionFromStorage,
      selectAvatar,
      forceRealtimeDropForTest,
      shutdownForTest,
    };

    return rootWindow.__virtualHumanConsoleController;
  }

  function bootstrapBrowserRuntime() {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    window.VirtualHumanConsole = {
      initializeConsole,
      createInitialSessionState,
    };

    if (window.__virtualHumanConsoleController) {
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        if (!window.__virtualHumanConsoleController) {
          initializeConsole(document, window, window.fetch);
        }
      });
      return;
    }

    initializeConsole(document, window, window.fetch);
  }

  bootstrapBrowserRuntime();
})();
