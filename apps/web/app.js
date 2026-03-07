(function () {
  const panelIds = ["capture", "avatar", "transcript", "emotion", "chat", "control"];
  const defaultSessionIdLabel = "未创建";
  const defaultApiBaseUrl = "http://127.0.0.1:8000";

  function findMissingPanels(rootDocument) {
    return panelIds.filter(
      (panelId) => !rootDocument.querySelector(`[data-panel="${panelId}"]`),
    );
  }

  function getAppConfig(rootWindow) {
    const config = rootWindow.__APP_CONFIG__ || {};
    return {
      apiBaseUrl: config.apiBaseUrl || config.gatewayBaseUrl || defaultApiBaseUrl,
      defaultAvatarId: config.defaultAvatarId || "companion_female_01",
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
      sessionFeedback: findRequiredElement(rootDocument, "session-feedback"),
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
      return "新会话已建立，后续文本和语音链路都将绑定到这个会话编号。";
    }
    return "点击 Start Session 创建新的会话编号。";
  }

  function renderSessionState(rootDocument, elements, state, appConfig) {
    elements.sessionIdValue.textContent = state.sessionId || defaultSessionIdLabel;
    elements.sessionStatusValue.textContent = state.status;
    elements.sessionStageValue.textContent = state.stage;
    elements.sessionTraceValue.textContent = state.traceId || "not assigned";
    elements.sessionUpdatedAtValue.textContent = formatTimestamp(state.updatedAt);
    elements.sessionApiBaseUrlValue.textContent = appConfig.apiBaseUrl;
    elements.sessionFeedback.textContent = getFeedbackMessage(state);
    elements.startButton.textContent = getStartButtonLabel(state);
    elements.startButton.disabled = state.requestState === "loading";

    rootDocument.body.dataset.uiReady = "true";
    rootDocument.body.dataset.sessionState = state.requestState;
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

    async function startSession() {
      state.sessionId = null;
      state.traceId = null;
      state.status = "idle";
      state.stage = "idle";
      state.updatedAt = null;
      state.requestState = "loading";
      state.error = null;
      renderSessionState(rootDocument, elements, state, appConfig);

      try {
        const payload = await requestSession(resolvedFetch, appConfig);
        state.sessionId = payload.session_id;
        state.traceId = payload.trace_id;
        state.status = payload.status || "created";
        state.stage = payload.stage || "engage";
        state.updatedAt = payload.updated_at || payload.started_at || null;
        state.requestState = "ready";
      } catch (error) {
        state.requestState = "error";
        state.error = error instanceof Error ? error.message : String(error);
      }

      renderSessionState(rootDocument, elements, state, appConfig);
      return { ...state };
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
