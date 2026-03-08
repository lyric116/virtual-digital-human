#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const APP_JS = path.join(ROOT, "apps", "web", "app.js");

function parseArgs(argv) {
  const args = {
    mode: "mock-success",
    apiBaseUrl: "http://127.0.0.1:8000",
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
    let lastResult;
    for (const handler of handlers) {
      lastResult = handler({ currentTarget: this, preventDefault() {} });
      if (lastResult && typeof lastResult.then === "function") {
        await lastResult;
      }
    }
    return lastResult;
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

function createMockFetch(mode) {
  if (mode === "mock-error") {
    return async function mockErrorFetch() {
      return {
        ok: false,
        status: 502,
        async json() {
          return { message: "Gateway unavailable" };
        },
      };
    };
  }

  const responses = [
    {
      session_id: "sess_mock_001",
      trace_id: "trace_mock_001",
      status: "created",
      stage: "engage",
      input_modes: ["text", "audio"],
      avatar_id: "companion_female_01",
      started_at: "2026-03-07T10:00:00Z",
      updated_at: "2026-03-07T10:00:00Z",
    },
    {
      session_id: "sess_mock_002",
      trace_id: "trace_mock_002",
      status: "created",
      stage: "engage",
      input_modes: ["text", "audio"],
      avatar_id: "companion_female_01",
      started_at: "2026-03-07T10:05:00Z",
      updated_at: "2026-03-07T10:05:00Z",
    },
  ];

  let index = 0;
  return async function mockSuccessFetch() {
    const payload = responses[index] || responses[responses.length - 1];
    index += 1;
    return {
      ok: true,
      status: 201,
      async json() {
        return payload;
      },
    };
  };
}

function collectSnapshot(document) {
  return {
    sessionId: document.getElementById("session-id-value").textContent,
    status: document.getElementById("session-status-value").textContent,
    stage: document.getElementById("session-stage-value").textContent,
    traceId: document.getElementById("session-trace-value").textContent,
    feedback: document.getElementById("session-feedback").textContent,
    updatedAt: document.getElementById("session-updated-at-value").textContent,
    apiBaseUrl: document.getElementById("session-api-base-url-value").textContent,
    startButtonLabel: document.getElementById("session-start-button").textContent,
    startButtonDisabled: document.getElementById("session-start-button").disabled,
    connectionStatus: document.getElementById("connection-status-value").textContent,
    connectionLog: document.getElementById("connection-log").textContent,
    textSubmitStatus: document.getElementById("text-submit-status").textContent,
    uiReady: document.body.dataset.uiReady || null,
    requestState: document.body.dataset.sessionState || null,
  };
}

function executeApp({ fetchImpl, apiBaseUrl }) {
  const document = new FakeDocument();
  const window = {
    document,
    fetch: fetchImpl,
    WebSocket: undefined,
    __APP_CONFIG__: {
      apiBaseUrl,
      wsUrl: "ws://127.0.0.1:8000/ws",
      defaultAvatarId: "companion_female_01",
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
    WebSocket: undefined,
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
    startButton: document.getElementById("session-start-button"),
  };
}

async function runPage({ fetchImpl, apiBaseUrl }) {
  const runtime = executeApp({ fetchImpl, apiBaseUrl });
  const beforeCreate = collectSnapshot(runtime.document);
  await runtime.startButton.click();
  const afterCreate = collectSnapshot(runtime.document);
  return { beforeCreate, afterCreate };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fetchImpl = args.mode === "live" ? fetch : createMockFetch(args.mode);

  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this Node runtime");
  }

  if (args.mode === "mock-error") {
    const errorPage = await runPage({ fetchImpl, apiBaseUrl: args.apiBaseUrl });
    process.stdout.write(`${JSON.stringify({ errorPage }, null, 2)}\n`);
    return;
  }

  const firstPage = await runPage({ fetchImpl, apiBaseUrl: args.apiBaseUrl });
  const secondPage = await runPage({ fetchImpl, apiBaseUrl: args.apiBaseUrl });
  process.stdout.write(`${JSON.stringify({ firstPage, secondPage }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
