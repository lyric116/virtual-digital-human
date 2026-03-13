#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const APP_JS = path.join(ROOT, "apps", "web", "app.js");

function parseArgs(argv) {
  const args = {
    mode: "mock",
    apiBaseUrl: "http://127.0.0.1:8000",
    wsUrl: "ws://127.0.0.1:8000/ws",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--mode") {
      args.mode = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--api-base-url") {
      args.apiBaseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--ws-url") {
      args.wsUrl = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

class FakeElement {
  constructor({ id = null, panelId = null, textContent = "", value = "" } = {}) {
    this.id = id;
    this.panelId = panelId;
    this.textContent = textContent;
    this.value = value;
    this.disabled = false;
    this.dataset = {};
    this.listeners = new Map();
    this.innerHTML = "";
  }

  addEventListener(eventName, handler) {
    const current = this.listeners.get(eventName) || [];
    current.push(handler);
    this.listeners.set(eventName, current);
  }

  async click() {
    const handlers = this.listeners.get("click") || [];
    for (const handler of handlers) {
      const value = handler({ currentTarget: this, preventDefault() {} });
      if (value && typeof value.then === "function") {
        await value;
      }
    }
  }

  dispatchInput(nextValue) {
    this.value = nextValue;
    const handlers = this.listeners.get("input") || [];
    handlers.forEach((handler) => handler({ currentTarget: this, preventDefault() {} }));
  }
}

class FakeDocument {
  constructor() {
    this.readyState = "complete";
    this.body = { dataset: {} };
    this.listeners = new Map();
    this.panelMap = new Map();
    this.idMap = new Map();

    ["capture", "avatar", "transcript", "emotion", "chat", "control"].forEach((panelId) => {
      this.panelMap.set(panelId, new FakeElement({ panelId }));
    });

    const elements = [
      ["session-start-button", "Start Session", ""],
      ["text-input-field", "", "我这两天总是睡不好，脑子停不下来。"],
      ["text-submit-button", "Send Text", ""],
      ["text-submit-status", "建立会话并连接实时通道后可发送文本。", ""],
      ["text-last-message-id-value", "not sent", ""],
      ["text-last-message-time-value", "not accepted", ""],
      ["transcript-user-final-text", "等待用户提交文本...", ""],
      ["transcript-assistant-reply-text", "等待 mock orchestrator reply...", ""],
      ["avatar-latest-reply-text", "等待 mock reply...", ""],
      ["fusion-risk-value", "pending", ""],
      ["fusion-stage-value", "stage: idle / next: pending", ""],
      ["timeline-user-text", "等待用户消息...", ""],
      ["timeline-assistant-text", "等待系统回复...", ""],
      ["timeline-stage-text", "idle → idle", ""],
      ["chat-timeline-list", "History | 等待会话历史...", ""],
      ["session-id-value", "未创建", ""],
      ["session-status-value", "idle", ""],
      ["session-stage-value", "idle", ""],
      ["session-trace-value", "not assigned", ""],
      ["session-updated-at-value", "not started", ""],
      ["session-api-base-url-value", "http://127.0.0.1:8000", ""],
      ["session-ws-url-value", "ws://127.0.0.1:8000/ws", ""],
      ["session-feedback", "点击 Start Session 创建新的会话编号。", ""],
      ["connection-status-value", "idle", ""],
      ["connection-heartbeat-value", "not started", ""],
      ["connection-log", "realtime idle", ""],
    ];

    elements.forEach(([id, textContent, value]) => {
      this.idMap.set(id, new FakeElement({ id, textContent, value }));
    });
  }

  getElementById(id) {
    return this.idMap.get(id) || null;
  }

  querySelector(selector) {
    const panelMatch = selector.match(/^\[data-panel="(.+)"\]$/);
    if (panelMatch) {
      return this.panelMap.get(panelMatch[1]) || null;
    }
    return null;
  }

  addEventListener(eventName, handler) {
    const current = this.listeners.get(eventName) || [];
    current.push(handler);
    this.listeners.set(eventName, current);
  }
}

class SharedStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function buildEnvelope(sessionId, traceId, eventType, payload, messageId = null, sourceService = "api_gateway") {
  return {
    event_id: `evt_${Math.random().toString(16).slice(2, 10)}`,
    event_type: eventType,
    schema_version: "v1alpha1",
    source_service: sourceService,
    session_id: sessionId,
    trace_id: traceId,
    message_id: messageId,
    emitted_at: new Date().toISOString(),
    payload,
  };
}

function createMockRuntime() {
  const store = {
    session: null,
    messages: [],
    turnIndex: 0,
    currentSocket: null,
    lastAcceptedPayload: null,
    lastDialoguePayload: null,
  };

  const mockTurns = [
    {
      reply: "谢谢你愿意说出来。最近这种睡不稳和停不下来的感觉，是这几天一直这样，还是晚上更明显？",
      emotion: "anxious",
      risk_level: "medium",
      stage: "assess",
      next_action: "ask_followup",
      knowledge_refs: ["sleep_hygiene_basic"],
    },
    {
      reply: "我们先不急着解决全部问题。你现在先试一次慢呼吸：吸气四拍，停两拍，呼气六拍，做两轮看看身体有没有一点放松。",
      emotion: "anxious",
      risk_level: "medium",
      stage: "intervene",
      next_action: "breathing",
      knowledge_refs: ["breathing_426"],
    },
    {
      reply: "现在回头看刚才这几轮，你觉得身体和脑子有没有比最开始稍微松一点？",
      emotion: "calmer",
      risk_level: "low",
      stage: "reassess",
      next_action: "reassess",
      knowledge_refs: ["reassess_checkin_basic"],
    },
  ];

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.CONNECTING;
      this.listeners = new Map();
      this.sessionId = decodeURIComponent(url.split("/session/")[1].split("?")[0]);
      this.traceId = new URL(url).searchParams.get("trace_id") || "trace_missing";
      store.currentSocket = this;

      setTimeout(() => {
        this.readyState = MockWebSocket.OPEN;
        this.emit("open", {});
        this.emit("message", {
          data: JSON.stringify(
            buildEnvelope(this.sessionId, this.traceId, "session.connection.ready", {
              connection_status: "connected",
              heartbeat_interval_ms: 200,
              reconnectable: true,
            }),
          ),
        });
      }, 0);
    }

    addEventListener(eventName, handler) {
      const current = this.listeners.get(eventName) || [];
      current.push(handler);
      this.listeners.set(eventName, current);
    }

    emit(eventName, event) {
      const handlers = this.listeners.get(eventName) || [];
      handlers.forEach((handler) => handler(event));
    }

    send(raw) {
      const payload = JSON.parse(raw);
      if (payload.type !== "ping") {
        return;
      }
      setTimeout(() => {
        this.emit("message", {
          data: JSON.stringify(
            buildEnvelope(this.sessionId, this.traceId, "session.heartbeat", {
              connection_status: "alive",
              client_time: payload.sent_at,
              server_time: new Date().toISOString(),
              heartbeat_interval_ms: 200,
            }),
          ),
        });
      }, 0);
    }

    close(code = 1000, reason = "mock_close") {
      this.readyState = MockWebSocket.CLOSED;
      setTimeout(() => {
        this.emit("close", { code, reason });
      }, 0);
    }
  }

  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = 3;

  async function mockFetch(url, options = {}) {
    if (url.endsWith("/api/session/create")) {
      store.session = {
        session_id: "sess_mock_timeline_001",
        trace_id: "trace_mock_timeline_001",
        status: "created",
        stage: "engage",
        input_modes: ["text", "audio"],
        avatar_id: "companion_female_01",
        started_at: "2026-03-08T11:00:00Z",
        updated_at: "2026-03-08T11:00:00Z",
      };
      store.messages = [];
      store.turnIndex = 0;
      return {
        ok: true,
        status: 201,
        async json() {
          return store.session;
        },
      };
    }

    if (store.session && url.endsWith(`/api/session/${store.session.session_id}/state`)) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            session: store.session,
            messages: store.messages,
          };
        },
      };
    }

    if (store.session && url.includes(`/api/session/${store.session.session_id}/text`)) {
      const submitted = JSON.parse(options.body || "{}");
      const turn = mockTurns[Math.min(store.turnIndex, mockTurns.length - 1)];
      const submittedAt = new Date(Date.UTC(2026, 2, 8, 11, 0, 2 + store.turnIndex * 8)).toISOString();
      const replyAt = new Date(Date.UTC(2026, 2, 8, 11, 0, 4 + store.turnIndex * 8)).toISOString();
      const userMessage = {
        message_id: `msg_mock_user_${String(store.turnIndex + 1).padStart(3, "0")}`,
        session_id: store.session.session_id,
        trace_id: store.session.trace_id,
        role: "user",
        status: "accepted",
        source_kind: "text",
        content_text: submitted.content_text,
        submitted_at: submittedAt,
        client_seq: submitted.client_seq,
      };
      const assistantMessage = {
        session_id: store.session.session_id,
        trace_id: store.session.trace_id,
        message_id: `msg_mock_assistant_${String(store.turnIndex + 1).padStart(3, "0")}`,
        reply: turn.reply,
        submitted_at: replyAt,
        emotion: turn.emotion,
        risk_level: turn.risk_level,
        stage: turn.stage,
        next_action: turn.next_action,
        knowledge_refs: turn.knowledge_refs,
        avatar_style: "warm_support",
        safety_flags: [],
      };

      store.messages.push({ ...userMessage, metadata: { client_seq: submitted.client_seq } });
      store.messages.push({
        message_id: assistantMessage.message_id,
        session_id: assistantMessage.session_id,
        trace_id: assistantMessage.trace_id,
        role: "assistant",
        status: "completed",
        source_kind: "text",
        content_text: assistantMessage.reply,
        submitted_at: replyAt,
        metadata: {
          stage: assistantMessage.stage,
          emotion: assistantMessage.emotion,
          risk_level: assistantMessage.risk_level,
          next_action: assistantMessage.next_action,
          knowledge_refs: assistantMessage.knowledge_refs,
          avatar_style: assistantMessage.avatar_style,
          safety_flags: assistantMessage.safety_flags,
        },
      });
      store.session = {
        ...store.session,
        status: "active",
        stage: assistantMessage.stage,
        updated_at: replyAt,
      };
      store.lastAcceptedPayload = userMessage;
      store.lastDialoguePayload = assistantMessage;
      store.turnIndex += 1;

      setTimeout(() => {
        if (!store.currentSocket || store.currentSocket.readyState !== MockWebSocket.OPEN) {
          return;
        }
        store.currentSocket.emit("message", {
          data: JSON.stringify(
            buildEnvelope(
              store.session.session_id,
              store.session.trace_id,
              "message.accepted",
              userMessage,
              userMessage.message_id,
            ),
          ),
        });
        store.currentSocket.emit("message", {
          data: JSON.stringify(
            buildEnvelope(
              store.session.session_id,
              store.session.trace_id,
              "dialogue.reply",
              assistantMessage,
              assistantMessage.message_id,
              "orchestrator",
            ),
          ),
        });
      }, 0);

      return {
        ok: true,
        status: 202,
        async json() {
          return userMessage;
        },
      };
    }

    return {
      ok: false,
      status: 404,
      async json() {
        return { message: `Unhandled mock fetch URL: ${url}` };
      },
    };
  }

  function replayLastTurn() {
    if (!store.currentSocket || store.currentSocket.readyState !== MockWebSocket.OPEN) {
      throw new Error("cannot replay events without an open websocket");
    }
    if (!store.lastAcceptedPayload || !store.lastDialoguePayload || !store.session) {
      throw new Error("cannot replay events before a turn has completed");
    }
    store.currentSocket.emit("message", {
      data: JSON.stringify(
        buildEnvelope(
          store.session.session_id,
          store.session.trace_id,
          "message.accepted",
          store.lastAcceptedPayload,
          store.lastAcceptedPayload.message_id,
        ),
      ),
    });
    store.currentSocket.emit("message", {
      data: JSON.stringify(
        buildEnvelope(
          store.session.session_id,
          store.session.trace_id,
          "dialogue.reply",
          store.lastDialoguePayload,
          store.lastDialoguePayload.message_id,
          "orchestrator",
        ),
      ),
    });
  }

  return {
    fetchImpl: mockFetch,
    WebSocketImpl: MockWebSocket,
    replayLastTurn,
  };
}

function collectSnapshot(document, storage) {
  const timelineText = document.getElementById("chat-timeline-list").textContent;
  const timelineEntries = timelineText.split("\n").map((item) => item.trim()).filter(Boolean);
  return {
    sessionId: document.getElementById("session-id-value").textContent,
    status: document.getElementById("session-status-value").textContent,
    stage: document.getElementById("session-stage-value").textContent,
    traceId: document.getElementById("session-trace-value").textContent,
    historyRestoreState: document.body.dataset.historyRestoreState || null,
    textSubmitState: document.body.dataset.textSubmitState || null,
    dialogueReplyState: document.body.dataset.dialogueReplyState || null,
    connectionStatus: document.getElementById("connection-status-value").textContent,
    timelineEntryCount: timelineEntries.length,
    timelineText,
    storedSessionId: storage.getItem("virtual-human-active-session-id"),
    latestStage: document.getElementById("timeline-stage-text").textContent,
  };
}

function executeApp({ fetchImpl, WebSocketImpl, apiBaseUrl, wsUrl, localStorage }) {
  const document = new FakeDocument();
  const window = {
    document,
    fetch: fetchImpl,
    WebSocket: WebSocketImpl,
    localStorage,
    __APP_CONFIG__: {
      apiBaseUrl,
      wsUrl,
      defaultAvatarId: "companion_female_01",
      heartbeatIntervalMs: 200,
      reconnectDelayMs: 150,
      activeSessionStorageKey: "virtual-human-active-session-id",
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };

  const context = {
    window,
    document,
    fetch: fetchImpl,
    WebSocket: WebSocketImpl,
    localStorage,
    console,
    Date,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    navigator: {},
  };

  const source = fs.readFileSync(APP_JS, "utf-8");
  vm.runInNewContext(source, context, { filename: APP_JS });

  return {
    document,
    window,
    startButton: document.getElementById("session-start-button"),
    textInputField: document.getElementById("text-input-field"),
    textSubmitButton: document.getElementById("text-submit-button"),
  };
}

async function waitFor(condition, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

async function submitTurn(runtime, text, expectedEntryCount) {
  runtime.textInputField.dispatchInput(text);
  await runtime.textSubmitButton.click();
  await waitFor(
    () => runtime.document.body.dataset.dialogueReplyState === "received",
    5000,
    "dialogue reply did not reach received state",
  );
  await waitFor(
    () => {
      const items = runtime.document.getElementById("chat-timeline-list").textContent
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      return items.length >= expectedEntryCount;
    },
    5000,
    "timeline did not reach expected entry count",
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sharedStorage = new SharedStorage();
  const runtimeConfig = args.mode === "live"
    ? { fetchImpl: fetch, WebSocketImpl: WebSocket }
    : createMockRuntime();

  const firstPage = executeApp({
    fetchImpl: runtimeConfig.fetchImpl,
    WebSocketImpl: runtimeConfig.WebSocketImpl,
    apiBaseUrl: args.apiBaseUrl,
    wsUrl: args.wsUrl,
    localStorage: sharedStorage,
  });

  const beforeCreate = collectSnapshot(firstPage.document, sharedStorage);
  await firstPage.startButton.click();
  await waitFor(
    () => firstPage.document.getElementById("connection-status-value").textContent === "connected",
    5000,
    "realtime connection did not reach connected state before timeline test",
  );

  await submitTurn(firstPage, "我这两天晚上总是睡不稳。", 2);
  await submitTurn(firstPage, "我愿意先试试你说的慢呼吸。", 4);
  await submitTurn(firstPage, "现在比刚才稍微松一点了。", 6);
  const afterThreeTurns = collectSnapshot(firstPage.document, sharedStorage);

  const secondPage = executeApp({
    fetchImpl: runtimeConfig.fetchImpl,
    WebSocketImpl: runtimeConfig.WebSocketImpl,
    apiBaseUrl: args.apiBaseUrl,
    wsUrl: args.wsUrl,
    localStorage: sharedStorage,
  });

  await waitFor(
    () => secondPage.document.body.dataset.historyRestoreState === "restored",
    5000,
    "restored page did not finish history recovery",
  );
  await waitFor(
    () => secondPage.document.getElementById("connection-status-value").textContent === "connected",
    5000,
    "restored page did not reconnect realtime channel",
  );

  const afterRefresh = collectSnapshot(secondPage.document, sharedStorage);

  runtimeConfig.replayLastTurn();
  await waitFor(
    () => {
      const snapshot = collectSnapshot(secondPage.document, sharedStorage);
      return snapshot.timelineEntryCount === afterRefresh.timelineEntryCount;
    },
    5000,
    "replayed realtime events changed chat timeline count",
  );
  const afterReplayDuplicate = collectSnapshot(secondPage.document, sharedStorage);

  secondPage.window.__virtualHumanConsoleController.shutdownForTest();
  firstPage.window.__virtualHumanConsoleController.shutdownForTest();

  process.stdout.write(
    `${JSON.stringify({ beforeCreate, afterThreeTurns, afterRefresh, afterReplayDuplicate }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
