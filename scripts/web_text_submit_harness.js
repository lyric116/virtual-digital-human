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

    ["capture", "avatar", "emotion", "chat", "control"].forEach((panelId) => {
      this.panelMap.set(panelId, new FakeElement({ panelId }));
    });

    const elements = [
      ["session-start-button", "开始会话", ""],
      ["text-input-field", "", "我这两天总是睡不好，脑子停不下来。"],
      ["text-submit-button", "发送文字", ""],
      ["text-submit-status", "开始会话并连接后，就可以发送文字。", ""],
      ["text-last-message-label-value", "还没有发送新的文字。", ""],
      ["text-last-message-time-label-value", "发送后会在这里显示接收时间。", ""],
      ["text-last-message-id-value", "not sent", ""],
      ["text-last-message-time-value", "not accepted", ""],
      ["transcript-user-final-text", "等待你的第一条消息...", ""],
      ["transcript-assistant-reply-text", "等待新的回应...", ""],
      ["avatar-latest-reply-text", "等待新的回应...", ""],
      ["fusion-risk-value", "pending", ""],
      ["fusion-stage-value", "当前仍在了解你的状态", ""],
      ["timeline-user-text", "等待用户消息...", ""],
      ["timeline-assistant-text", "等待系统回复...", ""],
      ["timeline-stage-text", "idle → idle", ""],
      ["chat-timeline-list", "对话记录 | 开始会话后，对话记录会显示在这里。", ""],
      ["session-id-value", "未创建", ""],
      ["session-status-value", "idle", ""],
      ["session-stage-value", "idle", ""],
      ["session-trace-value", "未分配", ""],
      ["session-updated-at-value", "未开始", ""],
      ["session-api-base-url-value", "http://127.0.0.1:8000", ""],
      ["session-ws-url-value", "ws://127.0.0.1:8000/ws", ""],
      ["session-feedback", "点击 开始会话 开始一次新的对话。", ""],
      ["connection-status-value", "idle", ""],
      ["connection-heartbeat-value", "未开始", ""],
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

function buildEnvelope(sessionId, traceId, eventType, payload, messageId = null) {
  return {
    event_id: `evt_${Math.random().toString(16).slice(2, 10)}`,
    event_type: eventType,
    schema_version: "v1alpha1",
    source_service: "api_gateway",
    session_id: sessionId,
    trace_id: traceId,
    message_id: messageId,
    emitted_at: new Date().toISOString(),
    payload,
  };
}

function createMockRuntime() {
  let currentSocket = null;
  const sessionPayload = {
    session_id: "sess_mock_text_001",
    trace_id: "trace_mock_text_001",
    status: "created",
    stage: "engage",
    input_modes: ["text", "audio"],
    avatar_id: "companion_female_01",
    started_at: "2026-03-08T10:10:00Z",
    updated_at: "2026-03-08T10:10:00Z",
  };

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.CONNECTING;
      this.listeners = new Map();
      this.sessionId = decodeURIComponent(url.split("/session/")[1].split("?")[0]);
      this.traceId = new URL(url).searchParams.get("trace_id") || "trace_missing";
      currentSocket = this;

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
      return {
        ok: true,
        status: 201,
        async json() {
          return sessionPayload;
        },
      };
    }

    if (url.includes(`/api/session/${sessionPayload.session_id}/text`)) {
      const submitted = JSON.parse(options.body || "{}");
      const messagePayload = {
        message_id: "msg_mock_text_001",
        session_id: sessionPayload.session_id,
        trace_id: sessionPayload.trace_id,
        role: "user",
        status: "accepted",
        source_kind: "text",
        content_text: submitted.content_text,
        submitted_at: "2026-03-08T10:10:02Z",
        client_seq: submitted.client_seq,
      };

      setTimeout(() => {
        if (!currentSocket || currentSocket.readyState !== MockWebSocket.OPEN) {
          return;
        }
        currentSocket.emit("message", {
          data: JSON.stringify(
            buildEnvelope(
              sessionPayload.session_id,
              sessionPayload.trace_id,
              "message.accepted",
              messagePayload,
              messagePayload.message_id,
            ),
          ),
        });
      }, 0);

      return {
        ok: true,
        status: 202,
        async json() {
          return messagePayload;
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

function collectSnapshot(document) {
  return {
    sessionId: document.getElementById("session-id-value").textContent,
    status: document.getElementById("session-status-value").textContent,
    traceId: document.getElementById("session-trace-value").textContent,
    textSubmitState: document.body.dataset.textSubmitState || null,
    textSubmitStatus: document.getElementById("text-submit-status").textContent,
    lastMessageId: document.getElementById("text-last-message-id-value").textContent,
    lastMessageLabel: document.getElementById("text-last-message-label-value")?.textContent || "",
    lastMessageTime: document.getElementById("text-last-message-time-value").textContent,
    lastMessageTimeLabel: document.getElementById("text-last-message-time-label-value")?.textContent || "",
    connectionStatus: document.getElementById("connection-status-value").textContent,
    connectionLog: document.getElementById("connection-log").textContent,
    draftText: document.getElementById("text-input-field").value,
  };
}

function executeApp({ fetchImpl, WebSocketImpl, apiBaseUrl, wsUrl }) {
  const document = new FakeDocument();
  const window = {
    document,
    fetch: fetchImpl,
    WebSocket: WebSocketImpl,
    __APP_CONFIG__: {
      apiBaseUrl,
      wsUrl,
      defaultAvatarId: "companion_female_01",
      heartbeatIntervalMs: 200,
      reconnectDelayMs: 150,
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtimeConfig = args.mode === "live"
    ? { fetchImpl: fetch, WebSocketImpl: WebSocket }
    : createMockRuntime();

  if (typeof runtimeConfig.fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }
  if (typeof runtimeConfig.WebSocketImpl !== "function") {
    throw new Error("WebSocket is not available in this runtime");
  }

  const runtime = executeApp({
    fetchImpl: runtimeConfig.fetchImpl,
    WebSocketImpl: runtimeConfig.WebSocketImpl,
    apiBaseUrl: args.apiBaseUrl,
    wsUrl: args.wsUrl,
  });

  const beforeCreate = collectSnapshot(runtime.document);
  await runtime.startButton.click();
  await waitFor(
    () => runtime.document.getElementById("connection-status-value").textContent === "connected",
    5000,
    "realtime connection did not reach connected state before text submit",
  );

  const afterConnect = collectSnapshot(runtime.document);
  const input = runtime.textInputField;
  input.dispatchInput("最近总觉得脑子停不下来，晚上更明显。\n想先试着说出来。\n");
  await runtime.textSubmitButton.click();

  await waitFor(
    () => runtime.document.body.dataset.textSubmitState === "sent",
    5000,
    "text submit did not reach sent state",
  );

  const afterSubmit = collectSnapshot(runtime.document);
  runtime.window.__virtualHumanConsoleController.shutdownForTest();
  process.stdout.write(`${JSON.stringify({ beforeCreate, afterConnect, afterSubmit }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
