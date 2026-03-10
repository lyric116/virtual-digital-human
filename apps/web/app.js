(function () {
  const panelIds = ["capture", "avatar", "transcript", "emotion", "chat", "control"];
  const dialogueStages = new Set(["engage", "assess", "intervene", "reassess", "handoff"]);
  const dialogueRiskLevels = new Set(["low", "medium", "high"]);
  const defaultSessionIdLabel = "未创建";
  const defaultApiBaseUrl = "http://127.0.0.1:8000";
  const defaultWsUrl = "ws://127.0.0.1:8000/ws";
  const defaultTtsBaseUrl = "http://127.0.0.1:8040";
  const defaultAvatarId = "companion_female_01";
  const avatarProfiles = {
    companion_female_01: {
      avatarId: "companion_female_01",
      profileId: "companion",
      label: "Companion Avatar A",
      meta: "Warm support / static 2D baseline / low motion",
      stageNote: "温和陪伴型角色，适合建立联系和低刺激安抚。",
      idleDetail: "陪伴型角色等待中，语气柔和，准备接住当前情绪。",
      speakingDetail: "陪伴型角色说话中，声线更柔和，节奏更慢。",
      voicePreview: "zh-CN-XiaoxiaoNeural",
    },
    coach_male_01: {
      avatarId: "coach_male_01",
      profileId: "coach",
      label: "Coach Avatar B",
      meta: "Structured guidance / static 2D baseline / firmer pacing",
      stageNote: "理性引导型角色，适合澄清问题和推进下一步行动。",
      idleDetail: "引导型角色等待中，表达更克制，准备做结构化追问。",
      speakingDetail: "引导型角色说话中，声线更沉稳，节奏更明确。",
      voicePreview: "zh-CN-YunxiNeural",
    },
  };
  const avatarExpressionPresets = {
    ready_idle: {
      presetId: "ready_idle",
      label: "ready_idle",
      detail: "未进入业务阶段前保持中性等待，不提前表现强情绪。",
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

  function getAppConfig(rootWindow) {
    const config = rootWindow.__APP_CONFIG__ || {};
    return {
      apiBaseUrl: config.apiBaseUrl || config.gatewayBaseUrl || defaultApiBaseUrl,
      wsUrl: config.wsUrl || defaultWsUrl,
      ttsBaseUrl: config.ttsBaseUrl || defaultTtsBaseUrl,
      defaultAvatarId: resolveAvatarId(config.defaultAvatarId || defaultAvatarId),
      activeSessionStorageKey: config.activeSessionStorageKey || "virtual-human-active-session-id",
      heartbeatIntervalMs: config.heartbeatIntervalMs || 5000,
      reconnectDelayMs: config.reconnectDelayMs || 1000,
      enableAudioFinalize: config.enableAudioFinalize !== false,
      enableAudioPreview: config.enableAudioPreview !== false,
      audioPreviewChunkThreshold: config.audioPreviewChunkThreshold || 2,
      videoFrameUploadIntervalMs: config.videoFrameUploadIntervalMs || 1800,
      autoplayAssistantAudio: config.autoplayAssistantAudio !== false,
    };
  }

  function createInitialSessionState() {
    return {
      sessionId: null,
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
      ttsPlaybackState: "idle",
      ttsPlaybackMessage: "等待系统回复并合成语音。",
      ttsAudioUrl: null,
      ttsAudioFormat: "pending",
      ttsVoiceId: "pending",
      ttsDurationMs: 0,
      ttsGeneratedAt: null,
      avatarMouthState: "closed",
      avatarMouthTransitionCount: 0,
      exportState: "idle",
      exportMessage: "创建或恢复会话后可导出当前 JSON。",
      lastExportedAt: null,
      lastExportFileName: null,
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
      startButton: findRequiredElement(rootDocument, "session-start-button"),
      cameraRequestButton: findOptionalElement(rootDocument, "camera-request-button"),
      cameraStartButton: findOptionalElement(rootDocument, "camera-start-button"),
      cameraStopButton: findOptionalElement(rootDocument, "camera-stop-button"),
      micRequestButton: findOptionalElement(rootDocument, "mic-request-button"),
      micStartButton: findOptionalElement(rootDocument, "mic-start-button"),
      micStopButton: findOptionalElement(rootDocument, "mic-stop-button"),
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
      fusionRiskValue: findRequiredElement(rootDocument, "fusion-risk-value"),
      fusionStageValue: findRequiredElement(rootDocument, "fusion-stage-value"),
      timelineUserText: findRequiredElement(rootDocument, "timeline-user-text"),
      timelineAssistantText: findRequiredElement(rootDocument, "timeline-assistant-text"),
      timelineStageText: findRequiredElement(rootDocument, "timeline-stage-text"),
      chatTimelineList: findRequiredElement(rootDocument, "chat-timeline-list"),
      sessionIdValue: findRequiredElement(rootDocument, "session-id-value"),
      sessionStatusValue: findRequiredElement(rootDocument, "session-status-value"),
      sessionStageValue: findRequiredElement(rootDocument, "session-stage-value"),
      sessionTraceValue: findRequiredElement(rootDocument, "session-trace-value"),
      lastUserTraceValue: findOptionalElement(rootDocument, "last-user-trace-value"),
      lastReplyTraceValue: findOptionalElement(rootDocument, "last-reply-trace-value"),
      sessionUpdatedAtValue: findRequiredElement(rootDocument, "session-updated-at-value"),
      sessionApiBaseUrlValue: findRequiredElement(rootDocument, "session-api-base-url-value"),
      sessionWsUrlValue: findRequiredElement(rootDocument, "session-ws-url-value"),
      sessionFeedback: findRequiredElement(rootDocument, "session-feedback"),
      exportButton: findOptionalElement(rootDocument, "session-export-button"),
      exportStatus: findOptionalElement(rootDocument, "session-export-status"),
      connectionStatusValue: findRequiredElement(rootDocument, "connection-status-value"),
      connectionHeartbeatValue: findRequiredElement(rootDocument, "connection-heartbeat-value"),
      connectionLogValue: findRequiredElement(rootDocument, "connection-log"),
    };
  }

  function formatTimestamp(value) {
    if (!value) {
      return "not started";
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
      return "Restoring Session...";
    }
    if (state.requestState === "loading") {
      return "Creating Session...";
    }
    if (state.requestState === "error") {
      return "Retry Session Start";
    }
    if (state.sessionId) {
      return "Create New Session";
    }
    return "Start Session";
  }

  function getFeedbackMessage(state) {
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
        return "最近一次会话已恢复，页面会继续保持会话级实时连接。";
      }
      return "会话已建立，当前页面会保持会话级实时连接并自动处理断线重连。";
    }
    return "点击 Start Session 创建新的会话编号。";
  }

  function getTextSubmitStatusMessage(state) {
    if (!state.sessionId) {
      return "建立会话并连接实时通道后可发送文本。";
    }
    if (state.connectionStatus === "unsupported") {
      return "当前环境不支持 WebSocket，无法等待确认事件。";
    }
    if (state.connectionStatus !== "connected") {
      if (state.connectionStatus === "reconnecting") {
        return "实时连接重连中，暂时不能发送文本。";
      }
      return "等待实时连接完成后再发送文本。";
    }
    if (state.textSubmitState === "sending") {
      return "正在提交文本，请稍候。";
    }
    if (state.textSubmitState === "awaiting_ack") {
      return "消息已写入网关，等待确认事件。";
    }
    if (state.textSubmitState === "sent") {
      return state.textSubmitMessage || "发送成功。";
    }
    if (state.textSubmitState === "error") {
      return state.textSubmitMessage || "文本发送失败。";
    }
    return "输入文本并点击 Send Text。";
  }

  function getCameraPermissionStatusMessage(state) {
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
      return state.partialTranscriptText || "partial transcript 获取失败。";
    }
    if (state.recordingState === "recording" || state.audioUploadState === "processing_final") {
      return "等待语音局部转写...";
    }
    return "等待 partial transcript...";
  }

  function getTextSubmitButtonLabel(state) {
    if (state.textSubmitState === "sending") {
      return "Sending...";
    }
    return "Send Text";
  }

  function getAvatarSpeechStatusMessage(state) {
    if (state.ttsPlaybackState === "synthesizing") {
      return state.ttsPlaybackMessage || "正在合成语音。";
    }
    if (state.ttsPlaybackState === "ready") {
      return state.ttsPlaybackMessage || "语音已生成，可播放。";
    }
    if (state.ttsPlaybackState === "playing") {
      return state.ttsPlaybackMessage || "数字人语音播放中。";
    }
    if (state.ttsPlaybackState === "completed") {
      return state.ttsPlaybackMessage || "本轮语音播放完成。";
    }
    if (state.ttsPlaybackState === "error") {
      return state.ttsPlaybackMessage || "语音播放失败。";
    }
    return state.ttsPlaybackMessage || "等待系统回复并合成语音。";
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
      return `已选 ${selectedAvatar.label}，点击 Create New Session 后切换当前会话角色。`;
    }
    return effectiveAvatar.stageNote;
  }

  function getAvatarVoicePreview(state) {
    return getEffectiveAvatarProfile(state).voicePreview;
  }

  function getAvatarMouthDetail(state) {
    if (state.avatarMouthState === "closed") {
      return `嘴部闭合，累计切换 ${state.avatarMouthTransitionCount} 次。`;
    }
    return `嘴型 ${state.avatarMouthState}，累计切换 ${state.avatarMouthTransitionCount} 次。`;
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
    if (!state.sessionId) {
      return "创建或恢复会话后可导出当前 JSON。";
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
    return state.exportMessage || "点击 Export 下载当前会话 JSON。";
  }

  function getExportButtonLabel(state) {
    if (state.exportState === "loading") {
      return "Exporting...";
    }
    return "Export";
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

  function renderTimeline(elements, state) {
    if (!state.timelineEntries.length) {
      const emptyMarkup = [
        '<article class="timeline-item system timeline-empty">',
        '<span class="timeline-role">History</span>',
        "<p>等待会话历史...</p>",
        "</article>",
      ].join("");
      elements.chatTimelineList.innerHTML = emptyMarkup;
      if (typeof elements.chatTimelineList.querySelector !== "function") {
        elements.chatTimelineList.textContent = "History | 等待会话历史...";
      }
      if (typeof elements.chatTimelineList.dataset === "object" && elements.chatTimelineList.dataset) {
        elements.chatTimelineList.dataset.timelineText = "History | 等待会话历史...";
      }
      return;
    }

    const markup = state.timelineEntries.map(function (entry) {
      const timestampLabel = entry.timestamp ? formatTimestamp(entry.timestamp) : "not started";
      return [
        `<article class="timeline-item ${escapeHtml(entry.kind)}">`,
        `<span class="timeline-role">${escapeHtml(entry.label)}</span>`,
        `<p>${escapeHtml(entry.text)}</p>`,
        `<small class="timeline-meta">${escapeHtml(timestampLabel)}</small>`,
        "</article>",
      ].join("");
    }).join("");

    const plainText = state.timelineEntries.map(function (entry) {
      const timestampLabel = entry.timestamp ? formatTimestamp(entry.timestamp) : "not started";
      return `${entry.label} | ${timestampLabel} | ${entry.text}`;
    }).join("\n");

    elements.chatTimelineList.innerHTML = markup;
    if (typeof elements.chatTimelineList.querySelector !== "function") {
      elements.chatTimelineList.textContent = plainText;
    }
    if (typeof elements.chatTimelineList.dataset === "object" && elements.chatTimelineList.dataset) {
      elements.chatTimelineList.dataset.timelineText = plainText;
    }
  }

  function renderSessionState(rootDocument, elements, state, appConfig) {
    const selectedAvatar = getAvatarProfile(state.activeAvatarId);
    const effectiveAvatar = getEffectiveAvatarProfile(state);
    const avatarExpressionPreset = resolveAvatarExpressionPreset(state);
    elements.sessionIdValue.textContent = state.sessionId || defaultSessionIdLabel;
    elements.sessionStatusValue.textContent = state.status;
    elements.sessionStageValue.textContent = state.stage;
    elements.sessionTraceValue.textContent = state.traceId || "not assigned";
    if (elements.lastUserTraceValue) {
      elements.lastUserTraceValue.textContent = state.lastAcceptedTraceId || "not observed";
    }
    if (elements.lastReplyTraceValue) {
      elements.lastReplyTraceValue.textContent = state.lastReplyTraceId || "not observed";
    }
    elements.sessionUpdatedAtValue.textContent = formatTimestamp(state.updatedAt);
    elements.sessionApiBaseUrlValue.textContent = appConfig.apiBaseUrl;
    elements.sessionWsUrlValue.textContent = appConfig.wsUrl;
    elements.sessionFeedback.textContent = getFeedbackMessage(state);
    elements.startButton.textContent = getStartButtonLabel(state);
    elements.startButton.disabled = state.requestState === "loading" || state.requestState === "restoring";
    if (elements.captureMicPill) {
      elements.captureMicPill.textContent = `Mic: ${state.micPermissionState}`;
    }
    if (elements.captureCameraPill) {
      elements.captureCameraPill.textContent = state.cameraState === "previewing"
        ? "Camera: live"
        : `Camera: ${state.cameraPermissionState}`;
    }
    if (elements.captureInputPill) {
      const activeInputs = ["text"];
      if (state.recordingState === "recording") {
        activeInputs.push("audio");
      }
      if (state.cameraState === "previewing") {
        activeInputs.push("video");
      }
      elements.captureInputPill.textContent = `Input: ${activeInputs.join(" + ")}`;
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
      );
    }
    if (elements.cameraRequestButton) {
      elements.cameraRequestButton.disabled = (
        state.cameraPermissionState === "requesting"
        || state.cameraState === "previewing"
      );
    }
    if (elements.cameraStartButton) {
      elements.cameraStartButton.disabled = (
        state.cameraPermissionState !== "granted"
        || state.cameraState === "previewing"
      );
    }
    if (elements.cameraStopButton) {
      elements.cameraStopButton.disabled = state.cameraState !== "previewing";
    }
    if (elements.micStartButton) {
      elements.micStartButton.disabled = (
        state.micPermissionState !== "granted"
        || state.recordingState === "recording"
      );
    }
    if (elements.micStopButton) {
      elements.micStopButton.disabled = state.recordingState !== "recording";
    }
    if (elements.exportButton) {
      elements.exportButton.textContent = getExportButtonLabel(state);
      elements.exportButton.disabled = (
        !state.sessionId
        || state.requestState === "loading"
        || state.requestState === "restoring"
        || state.exportState === "loading"
      );
    }
    if (elements.exportStatus) {
      elements.exportStatus.textContent = getExportStatusMessage(state);
    }
    elements.connectionStatusValue.textContent = state.connectionStatus;
    elements.connectionHeartbeatValue.textContent = formatTimestamp(state.lastHeartbeatAt);
    elements.connectionLogValue.textContent = state.connectionLog.join("\n");
    elements.textInputField.value = state.draftText;
    elements.textInputField.disabled = (
      state.requestState === "loading" || state.requestState === "restoring"
    );
    elements.textSubmitButton.textContent = getTextSubmitButtonLabel(state);
    elements.textSubmitButton.disabled = (
      !state.sessionId
      || state.requestState === "loading"
      || state.requestState === "restoring"
      || state.connectionStatus !== "connected"
      || state.textSubmitState === "sending"
    );
    elements.textSubmitStatus.textContent = getTextSubmitStatusMessage(state);
    elements.textLastMessageIdValue.textContent = state.lastAcceptedMessageId || "not sent";
    elements.textLastMessageTimeValue.textContent = formatTimestamp(state.lastAcceptedAt);
    elements.transcriptUserFinalText.textContent = state.lastAcceptedText || "等待用户提交文本...";
    elements.transcriptAssistantReplyText.textContent = state.lastReplyText || "等待 mock orchestrator reply...";
    elements.avatarLatestReplyText.textContent = state.lastReplyText || "等待 mock reply...";
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
      elements.avatarOptionCompanion.disabled = state.requestState === "loading" || state.requestState === "restoring";
    }
    if (elements.avatarOptionCoach) {
      elements.avatarOptionCoach.disabled = state.requestState === "loading" || state.requestState === "restoring";
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
    if (elements.avatarMouthShape && typeof elements.avatarMouthShape.dataset === "object") {
      elements.avatarMouthShape.dataset.mouthState = state.avatarMouthState;
    }
    if (elements.avatarMouthStateValue) {
      elements.avatarMouthStateValue.textContent = state.avatarMouthState;
    }
    if (elements.avatarMouthDetailValue) {
      elements.avatarMouthDetailValue.textContent = getAvatarMouthDetail(state);
    }
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
    elements.fusionRiskValue.textContent = state.lastReplyRiskLevel;
    elements.fusionStageValue.textContent = `stage: ${state.stage} / next: ${state.lastReplyNextAction}`;
    elements.timelineUserText.textContent = (
      state.lastAcceptedText
        || state.partialTranscriptText
        || "等待用户消息..."
    );
    elements.timelineAssistantText.textContent = state.lastReplyText || "等待系统回复...";
    elements.timelineStageText.textContent = state.lastStageTransition;
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
    rootDocument.body.dataset.avatarMouthState = state.avatarMouthState;
    rootDocument.body.dataset.avatarMouthTransitionCount = String(state.avatarMouthTransitionCount);
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

  function appendTimelineEntry(state, entry) {
    state.timelineEntries = state.timelineEntries.concat([entry]);
  }

  function clearExportCache(rootWindow) {
    if (!rootWindow || typeof rootWindow !== "object") {
      return;
    }
    rootWindow.__virtualHumanLastExportPayload = null;
    rootWindow.__virtualHumanLastExportFileName = null;
  }

  function storeExportCache(rootWindow, payload, fileName) {
    if (!rootWindow || typeof rootWindow !== "object") {
      return;
    }
    rootWindow.__virtualHumanLastExportPayload = payload;
    rootWindow.__virtualHumanLastExportFileName = fileName;
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
          label: "User",
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
          label: "Assistant",
          text: message.content_text,
          timestamp: message.submitted_at,
        });
        timelineEntries.push({
          entryId: `timeline-stage-${message.message_id}`,
          kind: "system",
          label: "Stage",
          text: `${currentStage} → ${nextStage}`,
          timestamp: message.submitted_at,
        });
        currentStage = nextStage;
        return;
      }

      timelineEntries.push({
        entryId: `timeline-${message.message_id || Math.random().toString(16).slice(2, 8)}`,
        kind: "system",
        label: "System",
        text: message.content_text || "system event",
        timestamp: message.submitted_at || null,
      });
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
    };

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

    function setAvatarMouthState(nextState) {
      if (state.avatarMouthState === nextState) {
        return;
      }
      state.avatarMouthState = nextState;
      state.avatarMouthTransitionCount += 1;
      renderSessionState(rootDocument, elements, state, appConfig);
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
        state.ttsPlaybackState = "error";
        state.ttsPlaybackMessage = error instanceof Error ? error.message : String(error);
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

        state.ttsAudioUrl = payload.audio_url;
        state.ttsAudioFormat = payload.audio_format || "pending";
        state.ttsVoiceId = payload.voice_id || "pending";
        state.ttsDurationMs = typeof payload.duration_ms === "number" ? payload.duration_ms : 0;
        state.ttsGeneratedAt = payload.generated_at || new Date().toISOString();
        runtime.avatarMouthCueSequence = buildMouthCueSequence(payload.subtitle || replyPayload.reply, state.ttsDurationMs);
        state.ttsPlaybackState = "ready";
        state.ttsPlaybackMessage = "语音已生成，准备播放。";
        pushConnectionLog(state, `tts asset ready: ${payload.tts_id || "unknown"}`);
        renderSessionState(rootDocument, elements, state, appConfig);

        if (elements.avatarAudioPlayer && appConfig.autoplayAssistantAudio) {
          if (typeof elements.avatarAudioPlayer.dataset === "object") {
            elements.avatarAudioPlayer.dataset.mockPlaybackDurationMs = String(
              Math.min(Math.max(state.ttsDurationMs, 700), 1800),
            );
          }
          elements.avatarAudioPlayer.src = payload.audio_url;
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

    function handleRealtimeEnvelope(envelope) {
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
          label: "User",
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
        state.lastStageTransition = `${state.stage} → ${payload.stage}`;
        appendTimelineEntry(state, {
          entryId: `timeline-${payload.message_id}`,
          kind: "assistant",
          label: "Assistant",
          text: payload.reply,
          timestamp: replyTimestamp,
        });
        appendTimelineEntry(state, {
          entryId: `timeline-stage-${payload.message_id}`,
          kind: "system",
          label: "Stage",
          text: state.lastStageTransition,
          timestamp: replyTimestamp,
        });
        state.stage = payload.stage;
        state.dialogueReplyState = "received";
        pushConnectionLog(state, `dialogue reply received: ${payload.message_id}`);
        renderSessionState(rootDocument, elements, state, appConfig);
        void synthesizeAssistantAudio(payload);
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
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        const payload = await requestSessionState(resolvedFetch, appConfig, storedSessionId);
        hydrateStateFromSessionState(state, payload);
        state.requestState = "ready";
        state.historyRestoreState = "restored";
        pushConnectionLog(state, `session restored: ${storedSessionId}`);
        renderSessionState(rootDocument, elements, state, appConfig);
        connectRealtime();
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

    async function startSession() {
      teardownRealtime(true);
      clearExportCache(rootWindow);
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
      state.ttsPlaybackState = "idle";
      state.ttsPlaybackMessage = "等待系统回复并合成语音。";
      state.ttsAudioUrl = null;
      state.ttsAudioFormat = "pending";
      state.ttsVoiceId = "pending";
      state.ttsDurationMs = 0;
      state.ttsGeneratedAt = null;
      state.avatarMouthState = "closed";
      state.avatarMouthTransitionCount = 0;
      state.exportState = "idle";
      state.exportMessage = "创建或恢复会话后可导出当前 JSON。";
      state.lastExportedAt = null;
      state.lastExportFileName = null;
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
      } catch (error) {
        state.requestState = "error";
        state.error = error instanceof Error ? error.message : String(error);
        renderSessionState(rootDocument, elements, state, appConfig);
      }

      return { ...state };
    }

    function selectAvatar(nextAvatarId) {
      const resolvedAvatarId = resolveAvatarId(nextAvatarId);
      if (resolvedAvatarId === state.activeAvatarId) {
        return { ...state };
      }
      state.activeAvatarId = resolvedAvatarId;
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
        storeExportCache(rootWindow, payload, fileName);
        triggerExportDownload(rootDocument, rootWindow, payload, fileName);
        state.exportState = "exported";
        state.lastExportedAt = payload.exported_at || new Date().toISOString();
        state.lastExportFileName = fileName;
        state.exportMessage = `导出成功: ${fileName}`;
        pushConnectionLog(state, `session exported: ${state.sessionId}`);
      } catch (error) {
        state.exportState = "error";
        state.exportMessage = error instanceof Error ? error.message : String(error);
      }

      renderSessionState(rootDocument, elements, state, appConfig);
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
      state.ttsPlaybackMessage = "等待系统回复并合成语音。";
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
      state.ttsPlaybackMessage = "等待系统回复并合成语音。";
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
      return { ...state };
    }

    function stopRecording() {
      if (!runtime.mediaRecorder || runtime.mediaRecorder.state !== "recording") {
        return { ...state };
      }
      try {
        runtime.stopRequested = true;
        runtime.mediaRecorder.stop();
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
      teardownCamera(true);
      teardownMicrophone();
      state.connectionStatus = "closed";
      pushConnectionLog(state, "realtime shutdown");
      renderSessionState(rootDocument, elements, state, appConfig);
      return true;
    }

    elements.startButton.addEventListener("click", function () {
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
    if (elements.micStopButton) {
      elements.micStopButton.addEventListener("click", function () {
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
        renderSessionState(rootDocument, elements, state, appConfig);
      });
      elements.avatarAudioPlayer.addEventListener("ended", function () {
        state.ttsPlaybackState = "completed";
        state.ttsPlaybackMessage = "本轮语音播放完成。";
        stopAvatarMouthAnimation();
        renderSessionState(rootDocument, elements, state, appConfig);
      });
      elements.avatarAudioPlayer.addEventListener("pause", function () {
        if (state.ttsPlaybackState === "playing") {
          stopAvatarMouthAnimation();
        }
      });
      elements.avatarAudioPlayer.addEventListener("error", function () {
        state.ttsPlaybackState = "error";
        state.ttsPlaybackMessage = "语音播放失败。";
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
      replayAssistantAudio,
      exportSession,
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
