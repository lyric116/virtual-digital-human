(function () {
  const panelIds = ["capture", "avatar", "transcript", "emotion", "chat", "control"];
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
    };
  }

  function findRequiredElement(rootDocument, elementId) {
    const element = rootDocument.getElementById(elementId);
    if (!element) {
      throw new Error(`Missing required element: ${elementId}`);
    }
    return element;
  }

  function getViewElements(rootDocument) {
    return {
      startButton: findRequiredElement(rootDocument, "session-start-button"),
      sessionIdValue: findRequiredElement(rootDocument, "session-id-value"),
      sessionStatusValue: findRequiredElement(rootDocument, "session-status-value"),
      sessionStageValue: findRequiredElement(rootDocument, "session-stage-value"),
      sessionTraceValue: findRequiredElement(rootDocument, "session-trace-value"),
      sessionUpdatedAtValue: findRequiredElement(rootDocument, "session-updated-at-value"),
      sessionApiBaseUrlValue: findRequiredElement(rootDocument, "session-api-base-url-value"),
      sessionWsUrlValue: findRequiredElement(rootDocument, "session-ws-url-value"),
      sessionFeedback: findRequiredElement(rootDocument, "session-feedback"),
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
    if (state.requestState === "loading") {
      return "正在创建会话，请稍候。";
    }
    if (state.requestState === "error") {
      return state.error || "会话创建失败。";
    }
    if (state.sessionId) {
      return "会话已建立，当前页面会保持会话级实时连接并自动处理断线重连。";
    }
    return "点击 Start Session 创建新的会话编号。";
  }

  function pushConnectionLog(state, message) {
    state.connectionLog = [message].concat(state.connectionLog).slice(0, 6);
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
    elements.startButton.disabled = state.requestState === "loading";
    elements.connectionStatusValue.textContent = state.connectionStatus;
    elements.connectionHeartbeatValue.textContent = formatTimestamp(state.lastHeartbeatAt);
    elements.connectionLogValue.textContent = state.connectionLog.join("\n");

    rootDocument.body.dataset.uiReady = "true";
    rootDocument.body.dataset.sessionState = state.requestState;
    rootDocument.body.dataset.connectionState = state.connectionStatus;
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

  function buildRealtimeSocketUrl(appConfig, state) {
    const base = appConfig.wsUrl.replace(/\/+$/, "");
    return `${base}/session/${encodeURIComponent(state.sessionId)}?trace_id=${encodeURIComponent(state.traceId || "")}`;
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

      if (envelope.event_type === "session.error") {
        const errorCode = envelope.payload && envelope.payload.error_code
          ? envelope.payload.error_code
          : "unknown_error";
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

    async function startSession() {
      teardownRealtime(true);
      state.sessionId = null;
      state.traceId = null;
      state.status = "idle";
      state.stage = "idle";
      state.updatedAt = null;
      state.requestState = "loading";
      state.error = null;
      state.connectionStatus = "idle";
      state.lastHeartbeatAt = null;
      state.connectionLog = ["realtime idle"];
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        const payload = await requestSession(resolvedFetch, appConfig);
        state.sessionId = payload.session_id;
        state.traceId = payload.trace_id;
        state.status = payload.status || "created";
        state.stage = payload.stage || "engage";
        state.updatedAt = payload.updated_at || payload.started_at || null;
        state.requestState = "ready";
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

    renderSessionState(rootDocument, elements, state, appConfig);
    rootWindow.__virtualHumanConsoleController = {
      getState: function () {
        return { ...state };
      },
      startSession,
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
