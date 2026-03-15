#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const APP_JS = path.join(ROOT, "apps", "web", "app.js");

function parseArgs(argv) {
  const args = { mode: "allow" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--mode") {
      args.mode = argv[index + 1];
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

    ["capture", "avatar", "emotion", "chat", "control"].forEach((panelId) => {
      this.panelMap.set(panelId, new FakeElement({ panelId }));
    });

    const elements = [
      ["session-start-button", "开始会话", ""],
      ["mic-request-button", "授权麦克风", ""],
      ["mic-start-button", "开始录音", ""],
      ["mic-stop-button", "结束录音", ""],
      ["capture-mic-pill", "Mic: idle", ""],
      ["capture-camera-pill", "Camera: blocked", ""],
      ["capture-input-pill", "Input: text", ""],
      ["mic-permission-status", "麦克风尚未授权。", ""],
      ["mic-recording-state-value", "idle", ""],
      ["mic-recording-detail-value", "尚未开始录音。", ""],
      ["text-input-field", "", "我这两天总是睡不好，脑子停不下来。"],
      ["text-submit-button", "发送文字", ""],
      ["text-submit-status", "开始会话并连接后，就可以发送文字。", ""],
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
      ["last-user-trace-value", "暂未记录", ""],
      ["last-reply-trace-value", "暂未记录", ""],
      ["session-updated-at-value", "未开始", ""],
      ["session-api-base-url-value", "http://127.0.0.1:8000", ""],
      ["session-ws-url-value", "ws://127.0.0.1:8000/ws", ""],
      ["session-feedback", "点击 开始会话 开始一次新的对话。", ""],
      ["session-export-button", "Export", ""],
      ["session-export-status", "开始或恢复会话后，就可以导出当前记录。", ""],
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

class FakeTrack {
  stop() {}
}

class FakeStream {
  getTracks() {
    return [new FakeTrack()];
  }
}

function createAllowNavigator() {
  return {
    mediaDevices: {
      async getUserMedia() {
        return new FakeStream();
      },
    },
  };
}

function createDenyNavigator() {
  return {
    mediaDevices: {
      async getUserMedia() {
        const error = new Error("Permission denied");
        error.name = "NotAllowedError";
        throw error;
      },
    },
  };
}

class FakeMediaRecorder {
  constructor(stream) {
    this.stream = stream;
    this.state = "inactive";
    this.mimeType = "audio/webm";
    this.listeners = new Map();
    this.intervalId = null;
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

  start() {
    this.state = "recording";
    this.intervalId = setInterval(() => {
      this.emit("dataavailable", {
        data: {
          size: 1024,
          type: this.mimeType,
        },
      });
    }, 80);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.state === "inactive") {
      return;
    }
    this.state = "inactive";
    this.emit("dataavailable", {
      data: {
        size: 1024,
        type: this.mimeType,
      },
    });
    this.emit("stop", {});
  }
}

function executeApp({ navigatorImpl, MediaRecorderImpl }) {
  const document = new FakeDocument();
  const window = {
    document,
    fetch: async function () {
      return {
        ok: true,
        async json() {
          return {};
        },
      };
    },
    WebSocket: undefined,
    MediaRecorder: MediaRecorderImpl,
    navigator: navigatorImpl,
    __APP_CONFIG__: {
      apiBaseUrl: "http://127.0.0.1:8000",
      wsUrl: "ws://127.0.0.1:8000/ws",
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
    navigator: navigatorImpl,
    MediaRecorder: MediaRecorderImpl,
    fetch: window.fetch,
    WebSocket: undefined,
    console,
    Date,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };

  const source = fs.readFileSync(APP_JS, "utf-8");
  vm.runInNewContext(source, context, { filename: APP_JS });

  return {
    document,
    window,
    requestButton: document.getElementById("mic-request-button"),
    startButton: document.getElementById("mic-start-button"),
    stopButton: document.getElementById("mic-stop-button"),
  };
}

function collectSnapshot(runtime) {
  const { document } = runtime;
  return {
    micPermissionState: document.body.dataset.micPermissionState || null,
    recordingState: document.body.dataset.recordingState || null,
    micPill: document.getElementById("capture-mic-pill").textContent,
    inputPill: document.getElementById("capture-input-pill").textContent,
    permissionStatus: document.getElementById("mic-permission-status").textContent,
    recordingStateText: document.getElementById("mic-recording-state-value").textContent,
    recordingDetail: document.getElementById("mic-recording-detail-value").textContent,
    startDisabled: document.getElementById("mic-start-button").disabled,
    stopDisabled: document.getElementById("mic-stop-button").disabled,
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

async function runAllowFlow() {
  const runtime = executeApp({
    navigatorImpl: createAllowNavigator(),
    MediaRecorderImpl: FakeMediaRecorder,
  });

  const beforeRequest = collectSnapshot(runtime);
  await runtime.requestButton.click();
  await waitFor(
    () => runtime.document.body.dataset.micPermissionState === "granted",
    1000,
    "microphone permission did not reach granted",
  );
  const afterPermission = collectSnapshot(runtime);

  await runtime.startButton.click();
  await waitFor(
    () => runtime.document.body.dataset.recordingState === "recording",
    1000,
    "recording state did not reach recording",
  );
  await new Promise((resolve) => setTimeout(resolve, 260));
  const duringRecording = collectSnapshot(runtime);

  await runtime.stopButton.click();
  await waitFor(
    () => runtime.document.body.dataset.recordingState === "stopped",
    1000,
    "recording state did not reach stopped",
  );
  const afterStop = collectSnapshot(runtime);
  runtime.window.__virtualHumanConsoleController.shutdownForTest();

  return { beforeRequest, afterPermission, duringRecording, afterStop };
}

async function runDenyFlow() {
  const runtime = executeApp({
    navigatorImpl: createDenyNavigator(),
    MediaRecorderImpl: FakeMediaRecorder,
  });

  const beforeRequest = collectSnapshot(runtime);
  await runtime.requestButton.click();
  await waitFor(
    () => runtime.document.body.dataset.micPermissionState === "denied",
    1000,
    "microphone permission did not reach denied",
  );
  const afterDeny = collectSnapshot(runtime);
  runtime.window.__virtualHumanConsoleController.shutdownForTest();

  return { beforeRequest, afterDeny };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = args.mode === "deny"
    ? await runDenyFlow()
    : await runAllowFlow();
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
