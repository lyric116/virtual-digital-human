#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const APP_JS = path.join(ROOT, "apps", "web", "app.js");

function parseArgs(argv) {
  const args = {
    mode: "mock",
    cameraMode: "allow",
    apiBaseUrl: "http://127.0.0.1:8000",
    wsUrl: "ws://127.0.0.1:8000/ws",
    connectTimeoutMs: 8000,
    captureTimeoutMs: 9000,
    settleMs: 400,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--mode") {
      args.mode = argv[index + 1] || args.mode;
      index += 1;
      continue;
    }
    if (current === "--camera-mode") {
      args.cameraMode = argv[index + 1] || args.cameraMode;
      index += 1;
      continue;
    }
    if (current === "--api-base-url") {
      args.apiBaseUrl = argv[index + 1] || args.apiBaseUrl;
      index += 1;
      continue;
    }
    if (current === "--ws-url") {
      args.wsUrl = argv[index + 1] || args.wsUrl;
      index += 1;
      continue;
    }
    if (current === "--connect-timeout-ms") {
      args.connectTimeoutMs = Number(argv[index + 1] || String(args.connectTimeoutMs));
      index += 1;
      continue;
    }
    if (current === "--capture-timeout-ms") {
      args.captureTimeoutMs = Number(argv[index + 1] || String(args.captureTimeoutMs));
      index += 1;
      continue;
    }
    if (current === "--settle-ms") {
      args.settleMs = Number(argv[index + 1] || String(args.settleMs));
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

  emit(eventName, event = {}) {
    const handlers = this.listeners.get(eventName) || [];
    handlers.forEach((handler) => handler(event));
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

  appendChild(child) {
    child.parentNode = this;
  }

  removeChild(child) {
    if (child) {
      child.parentNode = null;
    }
  }
}

class FakeAudioElement extends FakeElement {
  constructor(options = {}) {
    super(options);
    this.src = "";
  }

  load() {}
  pause() {}
  play() {
    return Promise.resolve();
  }
}

class FakeVideoElement extends FakeElement {
  constructor(options = {}) {
    super(options);
    this.srcObject = null;
    this.videoWidth = 640;
    this.videoHeight = 360;
  }

  pause() {}
  play() {
    return Promise.resolve();
  }
}

class FakeCanvasElement extends FakeElement {
  constructor(options = {}) {
    super(options);
    this.width = 0;
    this.height = 0;
  }

  getContext() {
    return {
      drawImage() {},
    };
  }

  toBlob(callback, mimeType) {
    const blob = new Blob([Buffer.from("fake-video-frame")], { type: mimeType || "image/jpeg" });
    callback(blob);
  }
}

class FakeAnchorElement extends FakeElement {
  constructor(options = {}) {
    super(options);
    this.href = "";
    this.download = "";
  }

  click() {}
}

class FakeDocument {
  constructor() {
    this.readyState = "complete";
    this.body = { dataset: {}, appendChild() {}, removeChild() {} };
    this.listeners = new Map();
    this.panelMap = new Map();
    this.idMap = new Map();

    ["capture", "avatar", "emotion", "chat", "control"].forEach((panelId) => {
      this.panelMap.set(panelId, new FakeElement({ panelId }));
    });

    const standardElements = [
      ["session-start-button", "开始会话", ""],
      ["camera-request-button", "授权摄像头", ""],
      ["camera-start-button", "开启画面", ""],
      ["camera-stop-button", "停止画面", ""],
      ["mic-request-button", "授权麦克风", ""],
      ["mic-start-button", "开始录音", ""],
      ["mic-stop-button", "结束录音", ""],
      ["capture-mic-pill", "Mic: idle", ""],
      ["capture-camera-pill", "Camera: idle", ""],
      ["capture-input-pill", "Input: text", ""],
      ["camera-permission-status", "摄像头尚未授权。", ""],
      ["camera-preview-state-value", "idle", ""],
      ["camera-preview-detail-value", "尚未开启摄像头预览。", ""],
      ["video-upload-state-value", "idle", ""],
      ["video-upload-detail-value", "当前没有视频帧上传。", ""],
      ["mic-permission-status", "麦克风尚未授权。", ""],
      ["mic-recording-state-value", "idle", ""],
      ["mic-recording-detail-value", "尚未开始录音。", ""],
      ["audio-upload-state-value", "idle", ""],
      ["audio-upload-detail-value", "当前没有音频分片上传。", ""],
      ["text-input-field", "", "我这两天总是睡不好，脑子停不下来。"],
      ["text-submit-button", "发送文字", ""],
      ["text-submit-status", "开始会话并连接后，就可以发送文字。", ""],
      ["text-last-message-id-value", "not sent", ""],
      ["text-last-message-time-value", "not accepted", ""],
      ["transcript-user-partial-text", "等待你开始说话...", ""],
      ["transcript-user-final-text", "等待你的第一条消息...", ""],
      ["transcript-assistant-reply-text", "等待系统回复...", ""],
      ["avatar-latest-reply-text", "等待系统回复...", ""],
      ["avatar-option-companion", "陪伴角色 A", ""],
      ["avatar-option-coach", "引导角色 B", ""],
      ["avatar-baseline-card", "", ""],
      ["avatar-label-value", "陪伴角色 A", ""],
      ["avatar-meta-value", "温和、稳定、陪你慢慢说", ""],
      ["avatar-character-state-value", "idle", ""],
      ["avatar-character-detail-value", "陪伴角色已准备好开始回应。", ""],
      ["avatar-stage-note-value", "更适合温和接住情绪、慢慢展开对话。", ""],
      ["avatar-expression-preset-value", "ready_idle", ""],
      ["avatar-expression-detail-value", "当前保持平稳自然的待机表情。", ""],
      ["avatar-mouth-shape", "", ""],
      ["avatar-mouth-state-value", "closed", ""],
      ["avatar-mouth-detail-value", "当前嘴型闭合。", ""],
      ["avatar-speech-state-value", "idle", ""],
      ["avatar-speech-detail-value", "等待新的回应并准备语音。", ""],
      ["avatar-voice-value", "zh-CN-XiaoxiaoNeural", ""],
      ["avatar-duration-value", "0.0s / preview", ""],
      ["avatar-replay-button", "重播语音", ""],
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

    standardElements.forEach(([id, textContent, value]) => {
      this.idMap.set(id, new FakeElement({ id, textContent, value }));
    });
    this.idMap.set("avatar-audio-player", new FakeAudioElement({ id: "avatar-audio-player" }));
    this.idMap.set("camera-preview-video", new FakeVideoElement({ id: "camera-preview-video" }));
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
    if (tagName === "canvas") {
      return new FakeCanvasElement();
    }
    if (tagName === "a") {
      return new FakeAnchorElement();
    }
    return new FakeElement();
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

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.listeners = new Map();
    this.sessionId = decodeURIComponent(url.split("/session/")[1].split("?")[0]);
    this.traceId = new URL(url).searchParams.get("trace_id") || "trace_missing";

    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit("open", {});
      this.emit("message", {
        data: JSON.stringify({
          event_id: "evt_ready_001",
          event_type: "session.connection.ready",
          schema_version: "v1alpha1",
          source_service: "api_gateway",
          session_id: this.sessionId,
          trace_id: this.traceId,
          emitted_at: "2026-03-10T10:00:00Z",
          payload: {
            connection_status: "connected",
            heartbeat_interval_ms: 200,
            reconnectable: true,
          },
        }),
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
        data: JSON.stringify({
          event_id: "evt_heartbeat_001",
          event_type: "session.heartbeat",
          schema_version: "v1alpha1",
          source_service: "api_gateway",
          session_id: this.sessionId,
          trace_id: this.traceId,
          emitted_at: "2026-03-10T10:00:01Z",
          payload: {
            connection_status: "alive",
            client_time: payload.sent_at,
            server_time: "2026-03-10T10:00:01Z",
            heartbeat_interval_ms: 200,
          },
        }),
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

function createNavigator(cameraMode) {
  return {
    mediaDevices: {
      async getUserMedia(constraints) {
        if (cameraMode === "deny" && constraints && constraints.video) {
          const error = new Error("camera access denied");
          error.name = "NotAllowedError";
          throw error;
        }
        return new FakeStream();
      },
    },
  };
}

function createMockFetch(uploadCalls) {
  const sessionPayload = {
    session_id: "sess_mock_video_001",
    trace_id: "trace_mock_video_001",
    status: "created",
    stage: "engage",
    input_modes: ["text", "audio"],
    avatar_id: "companion_female_01",
    started_at: "2026-03-10T10:00:00Z",
    updated_at: "2026-03-10T10:00:00Z",
  };

  return async function mockFetch(url, options = {}) {
    if (url.endsWith("/api/session/create")) {
      return {
        ok: true,
        status: 201,
        async json() {
          return sessionPayload;
        },
      };
    }

    if (url.includes(`/api/session/${sessionPayload.session_id}/video/frame`)) {
      const parsed = new URL(url);
      const frameSeq = Number(parsed.searchParams.get("frame_seq") || "0");
      const capturedAtMs = Number(parsed.searchParams.get("captured_at_ms") || "0");
      const width = Number(parsed.searchParams.get("width") || "0");
      const height = Number(parsed.searchParams.get("height") || "0");
      const body = options.body || { size: 0, type: "" };
      uploadCalls.push({
        frameSeq,
        capturedAtMs,
        width,
        height,
        size: typeof body.size === "number" ? body.size : 0,
        mimeType: options.headers && options.headers["Content-Type"],
      });
      return {
        ok: true,
        status: 202,
        async json() {
          return {
            media_id: `media_video_${String(frameSeq).padStart(3, "0")}`,
            session_id: sessionPayload.session_id,
            trace_id: sessionPayload.trace_id,
            media_kind: "video_frame",
            storage_backend: "local",
            storage_path: `data/derived/live_media/video_frames/${sessionPayload.session_id}/${String(frameSeq).padStart(6, "0")}_media_video_${String(frameSeq).padStart(3, "0")}.jpg`,
            mime_type: options.headers && options.headers["Content-Type"] || "image/jpeg",
            byte_size: typeof body.size === "number" ? body.size : 0,
            frame_seq: frameSeq,
            captured_at_ms: capturedAtMs,
            width,
            height,
            created_at: `2026-03-10T10:00:${String(frameSeq).padStart(2, "0")}Z`,
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
  };
}

function wrapLiveFetch(uploadCalls) {
  const realFetch = globalThis.fetch;
  if (typeof realFetch !== "function") {
    throw new Error("global fetch is not available in this Node runtime");
  }

  return async function wrappedFetch(url, options = {}) {
    if (url.includes("/video/frame")) {
      const parsed = new URL(url);
      const body = options.body || { size: 0, type: "" };
      uploadCalls.push({
        frameSeq: Number(parsed.searchParams.get("frame_seq") || "0"),
        capturedAtMs: Number(parsed.searchParams.get("captured_at_ms") || "0"),
        width: Number(parsed.searchParams.get("width") || "0"),
        height: Number(parsed.searchParams.get("height") || "0"),
        size: typeof body.size === "number" ? body.size : 0,
        mimeType: options.headers && options.headers["Content-Type"],
      });
    }
    return realFetch(url, options);
  };
}

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function executeApp(args) {
  const uploadCalls = [];
  const document = new FakeDocument();
  const navigatorImpl = createNavigator(args.cameraMode);
  const window = {
    document,
    fetch: args.mode === "live" ? wrapLiveFetch(uploadCalls) : createMockFetch(uploadCalls),
    WebSocket: MockWebSocket,
    navigator: navigatorImpl,
    localStorage: createStorage(),
    __APP_CONFIG__: {
      apiBaseUrl: args.apiBaseUrl,
      wsUrl: args.wsUrl,
      defaultAvatarId: "companion_female_01",
      heartbeatIntervalMs: 200,
      reconnectDelayMs: 150,
      activeSessionStorageKey: "virtual-human-active-session-id",
      enableAudioFinalize: false,
      enableAudioPreview: false,
      videoFrameUploadIntervalMs: 1200,
      autoplayAssistantAudio: false,
    },
    URL: {
      createObjectURL() {
        return "blob:mock";
      },
      revokeObjectURL() {},
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Blob,
  };

  const context = {
    window,
    document,
    navigator: navigatorImpl,
    fetch: window.fetch,
    WebSocket: MockWebSocket,
    Blob,
    console,
    Date,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Buffer,
  };

  const source = fs.readFileSync(APP_JS, "utf-8");
  vm.runInNewContext(source, context, { filename: APP_JS });

  return {
    document,
    window,
    uploadCalls,
    startSessionButton: document.getElementById("session-start-button"),
    cameraRequestButton: document.getElementById("camera-request-button"),
    cameraStartButton: document.getElementById("camera-start-button"),
    cameraStopButton: document.getElementById("camera-stop-button"),
  };
}

function collectSnapshot(runtime) {
  const controllerState = runtime.window.__virtualHumanConsoleController.getState();
  return {
    sessionId: runtime.document.getElementById("session-id-value").textContent,
    connectionStatus: runtime.document.getElementById("connection-status-value").textContent,
    cameraPermissionState: runtime.document.body.dataset.cameraPermissionState || null,
    cameraState: runtime.document.body.dataset.cameraState || null,
    videoUploadState: runtime.document.body.dataset.videoUploadState || null,
    cameraPill: runtime.document.getElementById("capture-camera-pill").textContent,
    inputPill: runtime.document.getElementById("capture-input-pill").textContent,
    cameraPermissionStatus: runtime.document.getElementById("camera-permission-status").textContent,
    cameraPreviewState: runtime.document.getElementById("camera-preview-state-value").textContent,
    cameraPreviewDetail: runtime.document.getElementById("camera-preview-detail-value").textContent,
    videoUploadDetail: runtime.document.getElementById("video-upload-detail-value").textContent,
    uploadedVideoFrameCount: controllerState.uploadedVideoFrameCount,
    lastUploadedVideoFrameId: controllerState.lastUploadedVideoFrameId,
    lastVideoUploadedAt: controllerState.lastVideoUploadedAt,
  };
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtime = executeApp(args);
  const beforeStart = collectSnapshot(runtime);

  await runtime.startSessionButton.click();
  await waitFor(
    () => runtime.document.body.dataset.connectionState === "connected",
    args.connectTimeoutMs,
    "session realtime connection",
  );
  const afterCreate = collectSnapshot(runtime);

  await runtime.cameraRequestButton.click();
  await waitFor(
    () => {
      const state = runtime.document.body.dataset.cameraPermissionState;
      return state === "granted" || state === "denied" || state === "error" || state === "unsupported";
    },
    args.connectTimeoutMs,
    "camera permission result",
  );
  const afterPermission = collectSnapshot(runtime);

  if (args.cameraMode === "deny") {
    runtime.window.__virtualHumanConsoleController.shutdownForTest();
    console.log(JSON.stringify({ beforeStart, afterCreate, afterPermission, uploadCalls: runtime.uploadCalls }, null, 2));
    return;
  }

  await runtime.cameraStartButton.click();
  await waitFor(
    () => runtime.document.body.dataset.cameraState === "previewing",
    args.captureTimeoutMs,
    "camera preview start",
  );
  await waitFor(
    () => runtime.window.__virtualHumanConsoleController.getState().uploadedVideoFrameCount >= 2,
    args.captureTimeoutMs,
    "at least two uploaded video frames",
  );
  const duringPreview = collectSnapshot(runtime);

  await runtime.cameraStopButton.click();
  await waitFor(
    () => runtime.document.body.dataset.cameraState === "stopped",
    args.captureTimeoutMs,
    "camera preview stop",
  );
  await new Promise((resolve) => setTimeout(resolve, args.settleMs));
  const afterStop = collectSnapshot(runtime);
  runtime.window.__virtualHumanConsoleController.shutdownForTest();

  console.log(
    JSON.stringify(
      {
        beforeStart,
        afterCreate,
        afterPermission,
        duringPreview,
        afterStop,
        uploadCalls: runtime.uploadCalls,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
