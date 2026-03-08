#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const APP_JS = path.join(ROOT, "apps", "web", "app.js");
const DEFAULT_SAMPLE_AUDIO = path.join(
  ROOT,
  "data",
  "derived",
  "audio_16k_mono",
  "NoXI",
  "001_2016-03-17_Paris",
  "Expert_video",
  "3.wav",
);

function parseArgs(argv) {
  const args = {
    mode: "mock",
    apiBaseUrl: "http://127.0.0.1:8000",
    wsUrl: "ws://127.0.0.1:8000/ws",
    sampleAudioPath: DEFAULT_SAMPLE_AUDIO,
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
      continue;
    }
    if (current === "--sample-audio") {
      args.sampleAudioPath = argv[index + 1];
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
      ["mic-request-button", "Enable Mic", ""],
      ["mic-start-button", "Start Recording", ""],
      ["mic-stop-button", "Stop Recording", ""],
      ["capture-mic-pill", "Mic: idle", ""],
      ["capture-camera-pill", "Camera: blocked", ""],
      ["capture-input-pill", "Input: text", ""],
      ["mic-permission-status", "麦克风尚未授权。", ""],
      ["mic-recording-state-value", "idle", ""],
      ["mic-recording-detail-value", "尚未开始录音。", ""],
      ["audio-upload-state-value", "idle", ""],
      ["audio-upload-detail-value", "当前没有音频分片上传。", ""],
      ["text-input-field", "", "我这两天总是睡不好，脑子停不下来。"],
      ["text-submit-button", "Send Text", ""],
      ["text-submit-status", "建立会话并连接实时通道后可发送文本。", ""],
      ["text-last-message-id-value", "not sent", ""],
      ["text-last-message-time-value", "not accepted", ""],
      ["transcript-user-partial-text", "等待 partial transcript...", ""],
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
      ["last-user-trace-value", "not observed", ""],
      ["last-reply-trace-value", "not observed", ""],
      ["session-updated-at-value", "not started", ""],
      ["session-api-base-url-value", "http://127.0.0.1:8000", ""],
      ["session-ws-url-value", "ws://127.0.0.1:8000/ws", ""],
      ["session-feedback", "点击 Start Session 创建新的会话编号。", ""],
      ["session-export-button", "Export", ""],
      ["session-export-status", "创建或恢复会话后可导出当前 JSON。", ""],
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

class FakeTrack {
  stop() {}
}

class FakeStream {
  getTracks() {
    return [new FakeTrack()];
  }
}

function buildSampleChunks(sampleAudioPath, BlobImpl) {
  const content = fs.readFileSync(sampleAudioPath);
  const totalChunks = 4;
  const chunkSize = Math.ceil(content.length / totalChunks);
  const chunks = [];
  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(content.length, start + chunkSize);
    if (start >= end) {
      break;
    }
    chunks.push(new BlobImpl([content.subarray(start, end)], { type: "audio/wav" }));
  }
  return chunks;
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
  let currentSocket = null;
  const uploadCalls = [];
  const previewCalls = [];
  const finalizeCalls = [];
  const sessionPayload = {
    session_id: "sess_mock_audio_001",
    trace_id: "trace_mock_audio_001",
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

    if (url.includes(`/api/session/${sessionPayload.session_id}/audio/chunk`)) {
      const parsed = new URL(url);
      const chunkSeq = Number(parsed.searchParams.get("chunk_seq") || "0");
      const isFinal = parsed.searchParams.get("is_final") === "true";
      uploadCalls.push({
        chunkSeq,
        isFinal,
        bodySize: typeof options.body.size === "number" ? options.body.size : null,
        contentType: options.headers ? options.headers["Content-Type"] : null,
      });
      return {
        ok: true,
        status: 202,
        async json() {
          return {
            media_id: `media_mock_chunk_${String(chunkSeq).padStart(3, "0")}`,
            session_id: sessionPayload.session_id,
            trace_id: sessionPayload.trace_id,
            media_kind: "audio_chunk",
            storage_backend: "local",
            storage_path: `data/derived/live_media/audio_chunks/${sessionPayload.session_id}/${chunkSeq}.wav`,
            mime_type: options.headers ? options.headers["Content-Type"] : "audio/wav",
            duration_ms: 250,
            byte_size: typeof options.body.size === "number" ? options.body.size : 0,
            chunk_seq: chunkSeq,
            chunk_started_at_ms: Number(parsed.searchParams.get("chunk_started_at_ms") || "0"),
            is_final: isFinal,
            created_at: `2026-03-08T16:20:${String(chunkSeq).padStart(2, "0")}Z`,
          };
        },
      };
    }

    if (url.includes(`/api/session/${sessionPayload.session_id}/audio/preview`)) {
      const parsed = new URL(url);
      const previewSeq = Number(parsed.searchParams.get("preview_seq") || "0");
      const recordingId = parsed.searchParams.get("recording_id") || "rec_missing";
      previewCalls.push({
        previewSeq,
        recordingId,
        bodySize: typeof options.body.size === "number" ? options.body.size : null,
        contentType: options.headers ? options.headers["Content-Type"] : null,
      });

      const partialPayload = {
        session_id: sessionPayload.session_id,
        trace_id: sessionPayload.trace_id,
        transcript_kind: "partial",
        preview_seq: previewSeq,
        recording_id: recordingId,
        text: "Bonjour, je me sens ...",
        language: "fr",
        confidence: null,
        confidence_available: false,
        duration_ms: 500,
        asr_engine: "qwen3-asr-flash",
        generated_at: "2026-03-08T16:20:03Z",
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
              "transcript.partial",
              partialPayload,
              null,
              "asr_service",
            ),
          ),
        });
      }, 0);

      return {
        ok: true,
        status: 202,
        async json() {
          return partialPayload;
        },
      };
    }

    if (url.includes(`/api/session/${sessionPayload.session_id}/audio/finalize`)) {
      finalizeCalls.push({
        bodySize: typeof options.body.size === "number" ? options.body.size : null,
        contentType: options.headers ? options.headers["Content-Type"] : null,
      });
      const acceptedPayload = {
        media_id: "media_mock_final_001",
        message_id: "msg_mock_audio_001",
        session_id: sessionPayload.session_id,
        trace_id: sessionPayload.trace_id,
        role: "user",
        status: "accepted",
        source_kind: "audio",
        content_text: "Bonjour, je me sens un peu tendu aujourd'hui.",
        mime_type: options.headers ? options.headers["Content-Type"] : "audio/wav",
        duration_ms: 740,
        submitted_at: "2026-03-08T16:20:04Z",
      };
      const dialoguePayload = {
        session_id: sessionPayload.session_id,
        trace_id: sessionPayload.trace_id,
        message_id: "msg_assistant_audio_001",
        reply: "谢谢你愿意先开口。你现在更像是紧张，还是有点喘不过气来？",
        emotion: "anxious",
        risk_level: "medium",
        stage: "assess",
        next_action: "ask_followup",
        knowledge_refs: ["grounding_basic"],
        avatar_style: "warm_support",
        safety_flags: [],
        submitted_at: "2026-03-08T16:20:05Z",
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
              acceptedPayload,
              acceptedPayload.message_id,
              "api_gateway",
            ),
          ),
        });
        currentSocket.emit("message", {
          data: JSON.stringify(
            buildEnvelope(
              sessionPayload.session_id,
              sessionPayload.trace_id,
              "dialogue.reply",
              dialoguePayload,
              dialoguePayload.message_id,
              "orchestrator",
            ),
          ),
        });
      }, 0);

      return {
        ok: true,
        status: 202,
        async json() {
          return acceptedPayload;
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
    uploadCalls,
    previewCalls,
    finalizeCalls,
  };
}

function createMediaRecorderCtor(sampleAudioPath, BlobImpl) {
  const sampleChunks = buildSampleChunks(sampleAudioPath, BlobImpl);

  return class FakeMediaRecorder {
    constructor(stream) {
      this.stream = stream;
      this.state = "inactive";
      this.mimeType = "audio/wav";
      this.listeners = new Map();
      this.intervalId = null;
      this.chunkIndex = 0;
      this.chunks = sampleChunks.slice();
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
        if (this.chunkIndex >= Math.max(0, this.chunks.length - 1)) {
          return;
        }
        const chunk = this.chunks[this.chunkIndex];
        this.chunkIndex += 1;
        this.emit("dataavailable", { data: chunk });
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
      if (this.chunkIndex < this.chunks.length) {
        const chunk = this.chunks[this.chunkIndex];
        this.chunkIndex += 1;
        this.emit("dataavailable", { data: chunk });
      }
      this.emit("stop", {});
    }
  };
}

function collectSnapshot(document, window) {
  const controllerState = window.__virtualHumanConsoleController.getState();
  return {
    sessionId: document.getElementById("session-id-value").textContent,
    status: document.getElementById("session-status-value").textContent,
    stage: document.getElementById("session-stage-value").textContent,
    traceId: document.getElementById("session-trace-value").textContent,
    connectionStatus: document.getElementById("connection-status-value").textContent,
    connectionLog: document.getElementById("connection-log").textContent,
    micPermissionState: document.body.dataset.micPermissionState || null,
    recordingState: document.body.dataset.recordingState || null,
    audioUploadState: document.body.dataset.audioUploadState || null,
    partialTranscriptState: document.body.dataset.partialTranscriptState || null,
    audioUploadDetail: document.getElementById("audio-upload-detail-value").textContent,
    uploadedChunkCount: controllerState.uploadedChunkCount,
    lastMessageId: document.getElementById("text-last-message-id-value").textContent,
    lastMessageTime: document.getElementById("text-last-message-time-value").textContent,
    partialTranscriptText: document.getElementById("transcript-user-partial-text")?.textContent || "",
    userFinalText: document.getElementById("transcript-user-final-text").textContent,
    assistantReplyText: document.getElementById("transcript-assistant-reply-text").textContent,
    timelineUserText: document.getElementById("timeline-user-text").textContent,
    timelineAssistantText: document.getElementById("timeline-assistant-text").textContent,
    timelineStageText: document.getElementById("timeline-stage-text").textContent,
    dialogueReplyState: document.body.dataset.dialogueReplyState || null,
    textSubmitState: document.body.dataset.textSubmitState || null,
  };
}

function executeApp({ fetchImpl, WebSocketImpl, MediaRecorderImpl, BlobImpl, apiBaseUrl, wsUrl }) {
  const document = new FakeDocument();
  const navigatorImpl = createNavigator();
  const window = {
    document,
    fetch: fetchImpl,
    WebSocket: WebSocketImpl,
    MediaRecorder: MediaRecorderImpl,
    Blob: BlobImpl,
    navigator: navigatorImpl,
    __APP_CONFIG__: {
      apiBaseUrl,
      wsUrl,
      defaultAvatarId: "companion_female_01",
      heartbeatIntervalMs: 200,
      reconnectDelayMs: 150,
      activeSessionStorageKey: "virtual-human-active-session-id",
      enableAudioFinalize: true,
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
    Blob: BlobImpl,
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
  };

  const source = fs.readFileSync(APP_JS, "utf-8");
  vm.runInNewContext(source, context, { filename: APP_JS });

  return {
    document,
    window,
    startButton: document.getElementById("session-start-button"),
    micStartButton: document.getElementById("mic-start-button"),
    micStopButton: document.getElementById("mic-stop-button"),
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
  const BlobImpl = typeof Blob === "function" ? Blob : null;
  if (!BlobImpl) {
    throw new Error("Blob is not available in this runtime");
  }

  const runtimeConfig = args.mode === "live"
    ? { fetchImpl: fetch, WebSocketImpl: WebSocket, uploadCalls: null, finalizeCalls: null }
    : createMockRuntime();

  if (typeof runtimeConfig.fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }
  if (typeof runtimeConfig.WebSocketImpl !== "function") {
    throw new Error("WebSocket is not available in this runtime");
  }
  if (!fs.existsSync(args.sampleAudioPath)) {
    throw new Error(`sample audio not found: ${args.sampleAudioPath}`);
  }

  const MediaRecorderImpl = createMediaRecorderCtor(args.sampleAudioPath, BlobImpl);
  const runtime = executeApp({
    fetchImpl: runtimeConfig.fetchImpl,
    WebSocketImpl: runtimeConfig.WebSocketImpl,
    MediaRecorderImpl,
    BlobImpl,
    apiBaseUrl: args.apiBaseUrl,
    wsUrl: args.wsUrl,
  });

  const beforeCreate = collectSnapshot(runtime.document, runtime.window);
  await runtime.startButton.click();
  await waitFor(
    () => runtime.document.getElementById("connection-status-value").textContent === "connected",
    5000,
    "realtime connection did not reach connected state before recording",
  );

  const afterConnect = collectSnapshot(runtime.document, runtime.window);
  await runtime.micStartButton.click();
  await waitFor(
    () => runtime.document.body.dataset.recordingState === "recording",
    5000,
    "recording did not start",
  );
  await waitFor(
    () => runtime.document.getElementById("audio-upload-state-value").textContent === "uploading",
    5000,
    "audio upload did not start during recording",
  );
  await waitFor(
    () => runtime.window.__virtualHumanConsoleController.getState().recordingChunkCount >= 2,
    5000,
    "recording did not produce multiple audio chunks before stop",
  );
  await waitFor(
    () => {
      const text = runtime.document.getElementById("transcript-user-partial-text");
      return text && text.textContent && !text.textContent.startsWith("等待");
    },
    10000,
    "partial transcript did not appear during recording",
  );

  const duringRecording = collectSnapshot(runtime.document, runtime.window);
  await runtime.micStopButton.click();
  await waitFor(
    () => runtime.document.body.dataset.recordingState === "stopped",
    5000,
    "recording did not stop",
  );

  const afterStop = collectSnapshot(runtime.document, runtime.window);
  await waitFor(
    () => runtime.document.body.dataset.audioUploadState === "completed",
    90000,
    "audio finalize did not reach completed state",
  );
  await waitFor(
    () => runtime.document.body.dataset.dialogueReplyState === "received",
    90000,
    "audio input did not trigger assistant reply",
  );

  const afterReply = collectSnapshot(runtime.document, runtime.window);
  runtime.window.__virtualHumanConsoleController.shutdownForTest();
  process.stdout.write(
    `${JSON.stringify({
      beforeCreate,
      afterConnect,
      duringRecording,
      afterStop,
      afterReply,
      uploadCalls: runtimeConfig.uploadCalls,
      previewCalls: runtimeConfig.previewCalls,
      finalizeCalls: runtimeConfig.finalizeCalls,
    }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
