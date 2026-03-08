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
    this.parentNode = null;
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

class FakeBody {
  constructor() {
    this.dataset = {};
  }

  appendChild(element) {
    element.parentNode = this;
    return element;
  }

  removeChild(element) {
    if (element) {
      element.parentNode = null;
    }
    return element;
  }
}

class FakeDocument {
  constructor() {
    this.readyState = "complete";
    this.body = new FakeBody();
    this.listeners = new Map();
    this.panelMap = new Map();
    this.idMap = new Map();

    ["capture", "avatar", "transcript", "emotion", "chat", "control"].forEach((panelId) => {
      this.panelMap.set(panelId, new FakeElement({ panelId }));
    });

    const elements = [
      ["session-start-button", "Start Session", ""],
      ["session-export-button", "Export", ""],
      ["session-export-status", "创建或恢复会话后可导出当前 JSON。", ""],
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

  createElement(tagName) {
    const element = new FakeElement({ id: `${tagName}_${Math.random().toString(16).slice(2, 8)}` });
    element.tagName = tagName.toUpperCase();
    element.click = function () {
      return true;
    };
    return element;
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

function buildStageHistory(session, messages) {
  const history = [
    {
      stage: "engage",
      changed_at: session.started_at,
      message_id: null,
    },
  ];
  let currentStage = "engage";

  messages.forEach((message) => {
    if (message.role !== "assistant") {
      return;
    }
    const metadata = message.metadata || {};
    if (typeof metadata.stage !== "string" || metadata.stage === currentStage) {
      return;
    }
    history.push({
      stage: metadata.stage,
      changed_at: message.submitted_at,
      message_id: message.message_id,
    });
    currentStage = metadata.stage;
  });

  return history;
}

function createMockRuntime() {
  const store = {
    session: null,
    messages: [],
    events: [],
    turnIndex: 0,
    currentSocket: null,
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
      reply: "我们先不急着一下子解决全部问题。你现在可以先试一次慢呼吸：吸气四拍，停两拍，呼气六拍，做两轮看看身体有没有一点放松。",
      emotion: "anxious",
      risk_level: "medium",
      stage: "intervene",
      next_action: "breathing",
      knowledge_refs: ["breathing_426"],
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
        session_id: "sess_mock_export_001",
        trace_id: "trace_mock_export_001",
        status: "created",
        stage: "engage",
        input_modes: ["text", "audio"],
        avatar_id: "companion_female_01",
        started_at: "2026-03-08T11:10:00Z",
        updated_at: "2026-03-08T11:10:00Z",
      };
      store.messages = [];
      store.turnIndex = 0;
      store.events = [
        {
          event_id: "evt_session_created_mock",
          session_id: store.session.session_id,
          trace_id: store.session.trace_id,
          message_id: null,
          event_type: "session.created",
          schema_version: "v1alpha1",
          source_service: "api_gateway",
          payload: {
            status: "created",
            stage: "engage",
            input_modes: store.session.input_modes,
            avatar_id: store.session.avatar_id,
          },
          emitted_at: store.session.started_at,
        },
      ];
      return {
        ok: true,
        status: 201,
        async json() {
          return store.session;
        },
      };
    }

    if (store.session && url.includes(`/api/session/${store.session.session_id}/text`)) {
      const submitted = JSON.parse(options.body || "{}");
      const turn = mockTurns[Math.min(store.turnIndex, mockTurns.length - 1)];
      const userSubmittedAt = new Date(Date.UTC(2026, 2, 8, 11, 10, 2 + store.turnIndex * 8)).toISOString();
      const replySubmittedAt = new Date(Date.UTC(2026, 2, 8, 11, 10, 4 + store.turnIndex * 8)).toISOString();
      const userMessage = {
        message_id: `msg_mock_user_${String(store.turnIndex + 1).padStart(3, "0")}`,
        session_id: store.session.session_id,
        trace_id: store.session.trace_id,
        role: "user",
        status: "accepted",
        source_kind: "text",
        content_text: submitted.content_text,
        submitted_at: userSubmittedAt,
        client_seq: submitted.client_seq,
      };
      const assistantReply = {
        session_id: store.session.session_id,
        trace_id: store.session.trace_id,
        message_id: `msg_mock_assistant_${String(store.turnIndex + 1).padStart(3, "0")}`,
        submitted_at: replySubmittedAt,
        reply: turn.reply,
        emotion: turn.emotion,
        risk_level: turn.risk_level,
        stage: turn.stage,
        next_action: turn.next_action,
        knowledge_refs: turn.knowledge_refs,
        avatar_style: "warm_support",
        safety_flags: [],
      };

      const assistantMessage = {
        message_id: assistantReply.message_id,
        session_id: store.session.session_id,
        trace_id: store.session.trace_id,
        role: "assistant",
        status: "completed",
        source_kind: "text",
        content_text: assistantReply.reply,
        submitted_at: replySubmittedAt,
        metadata: {
          stage: assistantReply.stage,
          emotion: assistantReply.emotion,
          risk_level: assistantReply.risk_level,
          next_action: assistantReply.next_action,
          knowledge_refs: assistantReply.knowledge_refs,
          avatar_style: assistantReply.avatar_style,
          safety_flags: assistantReply.safety_flags,
        },
      };

      store.messages.push({ ...userMessage, metadata: { client_seq: submitted.client_seq } });
      store.messages.push(assistantMessage);
      store.events.push({
        event_id: `evt_message_accepted_${String(store.turnIndex + 1).padStart(3, "0")}`,
        session_id: store.session.session_id,
        trace_id: store.session.trace_id,
        message_id: userMessage.message_id,
        event_type: "message.accepted",
        schema_version: "v1alpha1",
        source_service: "api_gateway",
        payload: { ...userMessage },
        emitted_at: userSubmittedAt,
      });
      store.events.push({
        event_id: `evt_dialogue_reply_${String(store.turnIndex + 1).padStart(3, "0")}`,
        session_id: store.session.session_id,
        trace_id: store.session.trace_id,
        message_id: assistantReply.message_id,
        event_type: "dialogue.reply",
        schema_version: "v1alpha1",
        source_service: "orchestrator",
        payload: { ...assistantReply },
        emitted_at: replySubmittedAt,
      });
      store.session = {
        ...store.session,
        status: "active",
        stage: assistantReply.stage,
        updated_at: replySubmittedAt,
      };
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
              assistantReply,
              assistantReply.message_id,
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

    if (store.session && url.endsWith(`/api/session/${store.session.session_id}/export`)) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            session_id: store.session.session_id,
            trace_id: store.session.trace_id,
            status: store.session.status,
            stage: store.session.stage,
            input_modes: store.session.input_modes,
            avatar_id: store.session.avatar_id,
            started_at: store.session.started_at,
            updated_at: store.session.updated_at,
            exported_at: "2026-03-08T11:10:30Z",
            messages: store.messages,
            stage_history: buildStageHistory(store.session, store.messages),
            events: store.events,
          };
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

  return {
    fetchImpl: mockFetch,
    WebSocketImpl: MockWebSocket,
  };
}

function collectSnapshot(runtime) {
  const { document, window } = runtime;
  const exportPayload = window.__virtualHumanLastExportPayload;
  return {
    sessionId: document.getElementById("session-id-value").textContent,
    status: document.getElementById("session-status-value").textContent,
    stage: document.getElementById("session-stage-value").textContent,
    connectionStatus: document.getElementById("connection-status-value").textContent,
    exportState: document.body.dataset.exportState || null,
    exportStatus: document.getElementById("session-export-status").textContent,
    exportFileName: window.__virtualHumanLastExportFileName || null,
    exportedMessageCount: exportPayload && Array.isArray(exportPayload.messages)
      ? exportPayload.messages.length
      : 0,
    exportedEventCount: exportPayload && Array.isArray(exportPayload.events)
      ? exportPayload.events.length
      : 0,
    exportedStageCount: exportPayload && Array.isArray(exportPayload.stage_history)
      ? exportPayload.stage_history.length
      : 0,
  };
}

function executeApp({ fetchImpl, WebSocketImpl, apiBaseUrl, wsUrl, localStorage }) {
  const document = new FakeDocument();
  const window = {
    document,
    fetch: fetchImpl,
    WebSocket: WebSocketImpl,
    localStorage,
    URL: {
      createObjectURL() {
        return "blob:mock-export";
      },
      revokeObjectURL() {},
    },
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
    Blob,
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
    exportButton: document.getElementById("session-export-button"),
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

async function submitTurn(runtime, text, expectedReplyState = "received") {
  runtime.textInputField.dispatchInput(text);
  await runtime.textSubmitButton.click();
  await waitFor(
    () => runtime.document.body.dataset.dialogueReplyState === expectedReplyState,
    5000,
    "dialogue reply did not reach expected state",
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sharedStorage = new SharedStorage();
  const runtimeConfig = args.mode === "live"
    ? { fetchImpl: fetch, WebSocketImpl: WebSocket }
    : createMockRuntime();

  const runtime = executeApp({
    fetchImpl: runtimeConfig.fetchImpl,
    WebSocketImpl: runtimeConfig.WebSocketImpl,
    apiBaseUrl: args.apiBaseUrl,
    wsUrl: args.wsUrl,
    localStorage: sharedStorage,
  });

  const beforeCreate = collectSnapshot(runtime);
  await runtime.startButton.click();
  await waitFor(
    () => runtime.document.getElementById("connection-status-value").textContent === "connected",
    5000,
    "realtime connection did not become ready before export test",
  );
  const afterConnect = collectSnapshot(runtime);

  await submitTurn(runtime, "我这两天晚上总是睡不稳。", "received");
  await submitTurn(runtime, "我愿意先试试你说的慢呼吸。", "received");

  await runtime.exportButton.click();
  await waitFor(
    () => runtime.document.body.dataset.exportState === "exported",
    5000,
    "export state did not reach exported",
  );
  await waitFor(
    () => Boolean(runtime.window.__virtualHumanLastExportPayload),
    5000,
    "export payload was not cached for inspection",
  );

  const afterExport = collectSnapshot(runtime);
  const exportedPayload = runtime.window.__virtualHumanLastExportPayload;
  runtime.window.__virtualHumanConsoleController.shutdownForTest();

  process.stdout.write(
    `${JSON.stringify({ beforeCreate, afterConnect, afterExport, exportedPayload }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
