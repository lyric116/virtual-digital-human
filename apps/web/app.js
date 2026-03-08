(function () {
  const panelIds = ["capture", "avatar", "transcript", "emotion", "chat", "control"];
  const dialogueStages = new Set(["engage", "assess", "intervene", "reassess", "handoff"]);
  const dialogueRiskLevels = new Set(["low", "medium", "high"]);
  const defaultSessionIdLabel = "未创建";
  const defaultApiBaseUrl = "http://127.0.0.1:8000";
  const defaultWsUrl = "ws://127.0.0.1:8000/ws";

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
      defaultAvatarId: config.defaultAvatarId || "companion_female_01",
      activeSessionStorageKey: config.activeSessionStorageKey || "virtual-human-active-session-id",
      heartbeatIntervalMs: config.heartbeatIntervalMs || 5000,
      reconnectDelayMs: config.reconnectDelayMs || 1000,
    };
  }

  function createInitialSessionState() {
    return {
      sessionId: null,
      traceId: null,
      status: "idle",
      stage: "idle",
      updatedAt: null,
      requestState: "idle",
      error: null,
      connectionStatus: "idle",
      lastHeartbeatAt: null,
      connectionLog: ["realtime idle"],
      draftText: "我这两天总是睡不好，脑子停不下来。",
      timelineEntries: [],
      historyRestoreState: "idle",
      textSubmitState: "idle",
      textSubmitMessage: null,
      pendingMessageId: null,
      lastAcceptedMessageId: null,
      lastAcceptedAt: null,
      lastAcceptedText: "",
      dialogueReplyState: "idle",
      lastReplyMessageId: null,
      lastReplyAt: null,
      lastReplyText: "",
      lastReplyEmotion: "pending",
      lastReplyRiskLevel: "pending",
      lastReplyNextAction: "pending",
      lastStageTransition: "idle → idle",
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
      textInputField: findRequiredElement(rootDocument, "text-input-field"),
      textSubmitButton: findRequiredElement(rootDocument, "text-submit-button"),
      textSubmitStatus: findRequiredElement(rootDocument, "text-submit-status"),
      textLastMessageIdValue: findRequiredElement(rootDocument, "text-last-message-id-value"),
      textLastMessageTimeValue: findRequiredElement(rootDocument, "text-last-message-time-value"),
      transcriptUserFinalText: findRequiredElement(rootDocument, "transcript-user-final-text"),
      transcriptAssistantReplyText: findRequiredElement(rootDocument, "transcript-assistant-reply-text"),
      avatarLatestReplyText: findRequiredElement(rootDocument, "avatar-latest-reply-text"),
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

  function getTextSubmitButtonLabel(state) {
    if (state.textSubmitState === "sending") {
      return "Sending...";
    }
    return "Send Text";
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
    elements.sessionIdValue.textContent = state.sessionId || defaultSessionIdLabel;
    elements.sessionStatusValue.textContent = state.status;
    elements.sessionStageValue.textContent = state.stage;
    elements.sessionTraceValue.textContent = state.traceId || "not assigned";
    elements.sessionUpdatedAtValue.textContent = formatTimestamp(state.updatedAt);
    elements.sessionApiBaseUrlValue.textContent = appConfig.apiBaseUrl;
    elements.sessionWsUrlValue.textContent = appConfig.wsUrl;
    elements.sessionFeedback.textContent = getFeedbackMessage(state);
    elements.startButton.textContent = getStartButtonLabel(state);
    elements.startButton.disabled = state.requestState === "loading" || state.requestState === "restoring";
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
    elements.fusionRiskValue.textContent = state.lastReplyRiskLevel;
    elements.fusionStageValue.textContent = `stage: ${state.stage} / next: ${state.lastReplyNextAction}`;
    elements.timelineUserText.textContent = state.lastAcceptedText || "等待用户消息...";
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

  async function requestSession(fetchImpl, appConfig) {
    const response = await fetchImpl(`${appConfig.apiBaseUrl}/api/session/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input_modes: ["text", "audio"],
        avatar_id: appConfig.defaultAvatarId,
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
    let lastReplyText = "";
    let lastReplyAt = null;
    let lastReplyMessageId = null;
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
      lastReplyText,
      lastReplyAt,
      lastReplyMessageId,
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
    state.traceId = session.trace_id;
    state.status = session.status || "active";
    state.stage = reconstructed.currentStage || session.stage || "engage";
    state.updatedAt = session.updated_at || session.started_at || null;
    state.lastAcceptedText = reconstructed.lastAcceptedText;
    state.lastAcceptedAt = reconstructed.lastAcceptedAt;
    state.lastAcceptedMessageId = reconstructed.lastAcceptedMessageId;
    state.lastReplyText = reconstructed.lastReplyText;
    state.lastReplyAt = reconstructed.lastReplyAt;
    state.lastReplyMessageId = reconstructed.lastReplyMessageId;
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
    const runtime = {
      socket: null,
      heartbeatTimerId: null,
      reconnectTimerId: null,
      reconnectAttempt: 0,
      connectionToken: 0,
      manualClose: false,
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

      if (envelope.event_type === "message.accepted") {
        const payload = envelope.payload || {};
        state.status = "active";
        state.updatedAt = payload.submitted_at || envelope.emitted_at;
        state.lastAcceptedMessageId = payload.message_id || envelope.message_id || null;
        state.lastAcceptedAt = payload.submitted_at || envelope.emitted_at;
        state.lastAcceptedText = payload.content_text || state.lastAcceptedText;
        appendTimelineEntry(state, {
          entryId: `timeline-${state.lastAcceptedMessageId || envelope.event_id}`,
          kind: "user",
          label: "User",
          text: state.lastAcceptedText || "user message",
          timestamp: state.lastAcceptedAt,
        });
        state.textSubmitState = "sent";
        state.textSubmitMessage = `发送成功: ${state.lastAcceptedMessageId || "message.accepted"}`;
        state.pendingMessageId = null;
        state.draftText = "";
        pushConnectionLog(state, `message accepted: ${state.lastAcceptedMessageId || "unknown"}`);
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
      state.lastAcceptedAt = null;
      state.lastAcceptedText = "";
      state.dialogueReplyState = "idle";
      state.lastReplyMessageId = null;
      state.lastReplyAt = null;
      state.lastReplyText = "";
      state.lastReplyEmotion = "pending";
      state.lastReplyRiskLevel = "pending";
      state.lastReplyNextAction = "pending";
      state.lastStageTransition = "idle → idle";
      state.exportState = "idle";
      state.exportMessage = "创建或恢复会话后可导出当前 JSON。";
      state.lastExportedAt = null;
      state.lastExportFileName = null;
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        const payload = await requestSession(resolvedFetch, appConfig);
        state.sessionId = payload.session_id;
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
      state.lastReplyAt = null;
      state.lastReplyText = "";
      state.lastReplyEmotion = "pending";
      state.lastReplyRiskLevel = "pending";
      state.lastReplyNextAction = "pending";
      state.lastStageTransition = `${state.stage} → ${state.stage}`;
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
      state.connectionStatus = "closed";
      pushConnectionLog(state, "realtime shutdown");
      renderSessionState(rootDocument, elements, state, appConfig);
      return true;
    }

    elements.startButton.addEventListener("click", function () {
      return startSession();
    });
    elements.textSubmitButton.addEventListener("click", function () {
      return submitText();
    });
    if (elements.exportButton) {
      elements.exportButton.addEventListener("click", function () {
        return exportSession();
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
      submitText,
      exportSession,
      restoreSessionFromStorage,
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
