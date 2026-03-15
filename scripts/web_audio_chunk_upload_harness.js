#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const APP_JS = path.join(ROOT, "apps", "web", "app.js");

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
      ["audio-upload-state-value", "idle", ""],
      ["audio-upload-detail-value", "当前没有音频分片上传。", ""],
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
          emitted_at: "2026-03-08T16:10:00Z",
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
          emitted_at: "2026-03-08T16:10:01Z",
          payload: {
            connection_status: "alive",
            client_time: payload.sent_at,
            server_time: "2026-03-08T16:10:01Z",
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

function createNavigator() {
  return {
    mediaDevices: {
      async getUserMedia() {
        return new FakeStream();
      },
    },
  };
}

function createMockFetch(uploadCalls) {
  const sessionPayload = {
    session_id: "sess_mock_audio_001",
    trace_id: "trace_mock_audio_001",
    status: "created",
    stage: "engage",
    input_modes: ["text", "audio"],
    avatar_id: "companion_female_01",
    started_at: "2026-03-08T16:10:00Z",
    updated_at: "2026-03-08T16:10:00Z",
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

    if (url.includes(`/api/session/${sessionPayload.session_id}/audio/chunk`)) {
      const parsed = new URL(url);
      const chunkSeq = Number(parsed.searchParams.get("chunk_seq") || "0");
      const durationMs = Number(parsed.searchParams.get("duration_ms") || "0");
      const chunkStartedAtMs = Number(parsed.searchParams.get("chunk_started_at_ms") || "0");
      const isFinal = parsed.searchParams.get("is_final") === "true";
      const body = options.body || { size: 0, type: "" };
      uploadCalls.push({
        chunkSeq,
        durationMs,
        chunkStartedAtMs,
        isFinal,
        size: typeof body.size === "number" ? body.size : 0,
        mimeType: options.headers && options.headers["Content-Type"],
      });

      return {
        ok: true,
        status: 202,
        async json() {
          return {
            media_id: `media_mock_${String(chunkSeq).padStart(3, "0")}`,
            session_id: sessionPayload.session_id,
            trace_id: sessionPayload.trace_id,
            media_kind: "audio_chunk",
            storage_backend: "local",
            storage_path: `data/derived/live_media/audio_chunks/${sessionPayload.session_id}/${String(chunkSeq).padStart(6, "0")}_media_mock_${String(chunkSeq).padStart(3, "0")}.webm`,
            mime_type: options.headers && options.headers["Content-Type"] || "audio/webm",
            duration_ms: durationMs,
            byte_size: typeof body.size === "number" ? body.size : 0,
            chunk_seq: chunkSeq,
            chunk_started_at_ms: chunkStartedAtMs,
            is_final: isFinal,
            created_at: `2026-03-08T16:10:${String(chunkSeq).padStart(2, "0")}Z`,
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

function executeApp() {
  const uploadCalls = [];
  const document = new FakeDocument();
  const navigatorImpl = createNavigator();
  const window = {
    document,
    fetch: createMockFetch(uploadCalls),
    WebSocket: MockWebSocket,
    MediaRecorder: FakeMediaRecorder,
    navigator: navigatorImpl,
    __APP_CONFIG__: {
      apiBaseUrl: "http://127.0.0.1:8000",
      wsUrl: "ws://127.0.0.1:8000/ws",
      defaultAvatarId: "companion_female_01",
      heartbeatIntervalMs: 200,
      reconnectDelayMs: 150,
      activeSessionStorageKey: "virtual-human-active-session-id",
      enableAudioFinalize: false,
      enableAudioPreview: false,
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
    MediaRecorder: FakeMediaRecorder,
    fetch: window.fetch,
    WebSocket: MockWebSocket,
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
    uploadCalls,
    startSessionButton: document.getElementById("session-start-button"),
    startRecordingButton: document.getElementById("mic-start-button"),
    stopRecordingButton: document.getElementById("mic-stop-button"),
  };
}

function collectSnapshot(runtime) {
  const { document } = runtime;
  return {
    sessionId: document.getElementById("session-id-value").textContent,
    connectionStatus: document.getElementById("connection-status-value").textContent,
    micPermissionState: document.body.dataset.micPermissionState || null,
    recordingState: document.body.dataset.recordingState || null,
    audioUploadState: document.body.dataset.audioUploadState || null,
    inputPill: document.getElementById("capture-input-pill").textContent,
    permissionStatus: document.getElementById("mic-permission-status").textContent,
    recordingDetail: document.getElementById("mic-recording-detail-value").textContent,
    uploadStateText: document.getElementById("audio-upload-state-value").textContent,
    uploadDetail: document.getElementById("audio-upload-detail-value").textContent,
    uploadedChunkCount: runtime.window.__virtualHumanConsoleController.getState().uploadedChunkCount,
    lastUploadedChunkId: runtime.window.__virtualHumanConsoleController.getState().lastUploadedChunkId,
    uploadCalls: runtime.uploadCalls.length,
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
  const runtime = executeApp();

  const beforeStart = collectSnapshot(runtime);
  await runtime.startSessionButton.click();
  await waitFor(
    () => runtime.document.body.dataset.connectionState === "connected",
    1000,
    "session connection did not reach connected",
  );
  const afterConnect = collectSnapshot(runtime);

  await runtime.startRecordingButton.click();
  await waitFor(
    () => runtime.document.body.dataset.recordingState === "recording",
    1000,
    "recording state did not reach recording",
  );
  await waitFor(
    () => runtime.uploadCalls.length >= 2,
    1000,
    "audio chunk uploads did not start",
  );
  const duringRecording = collectSnapshot(runtime);

  await runtime.stopRecordingButton.click();
  await waitFor(
    () => runtime.document.body.dataset.recordingState === "stopped",
    1000,
    "recording state did not reach stopped",
  );
  await waitFor(
    () => runtime.document.body.dataset.audioUploadState === "completed",
    1000,
    "audio upload state did not reach completed",
  );
  const afterStop = collectSnapshot(runtime);
  const uploadCallsAtStop = runtime.uploadCalls.length;
  await new Promise((resolve) => setTimeout(resolve, 180));
  const afterSettled = collectSnapshot(runtime);

  runtime.window.__virtualHumanConsoleController.shutdownForTest();

  process.stdout.write(`${JSON.stringify({
    beforeStart,
    afterConnect,
    duringRecording,
    afterStop,
    afterSettled,
    uploadCallsAtStop,
    uploadCalls: runtime.uploadCalls,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
