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
    ttsBaseUrl: "http://127.0.0.1:8040",
    avatarId: "companion_female_01",
    dialogueStage: "assess",
    dialogueEmotion: "anxious",
    dialogueRiskLevel: "medium",
    replyText: "谢谢你愿意说出来。我们先慢一点，把今晚最难受的部分说清楚。",
    connectTimeoutMs: 5000,
    replyTimeoutMs: 8000,
    playbackStartTimeoutMs: 8000,
    playbackCompleteTimeoutMs: 8000,
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
    if (current === "--tts-base-url") {
      args.ttsBaseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--avatar-id") {
      args.avatarId = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--dialogue-stage") {
      args.dialogueStage = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--dialogue-emotion") {
      args.dialogueEmotion = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--dialogue-risk-level") {
      args.dialogueRiskLevel = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--reply-text") {
      args.replyText = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--connect-timeout-ms") {
      args.connectTimeoutMs = Number(argv[index + 1] || "5000");
      index += 1;
      continue;
    }
    if (current === "--reply-timeout-ms") {
      args.replyTimeoutMs = Number(argv[index + 1] || "8000");
      index += 1;
      continue;
    }
    if (current === "--playback-start-timeout-ms") {
      args.playbackStartTimeoutMs = Number(argv[index + 1] || "8000");
      index += 1;
      continue;
    }
    if (current === "--playback-complete-timeout-ms") {
      args.playbackCompleteTimeoutMs = Number(argv[index + 1] || "8000");
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
}

class FakeAudioElement extends FakeElement {
  constructor(options = {}) {
    super(options);
    this.src = "";
    this.currentTime = 0;
    this._endedTimer = null;
  }

  load() {}

  pause() {
    if (this._endedTimer) {
      clearTimeout(this._endedTimer);
      this._endedTimer = null;
    }
  }

  play() {
    this.emit("play", { currentTarget: this });
    if (this._endedTimer) {
      clearTimeout(this._endedTimer);
    }
    const playbackDurationMs = Number(this.dataset.mockPlaybackDurationMs || "420");
    this._endedTimer = setTimeout(() => {
      this._endedTimer = null;
      this.emit("ended", { currentTarget: this });
    }, playbackDurationMs);
    return Promise.resolve();
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

    const standardElements = [
      ["session-start-button", "Start Session", ""],
      ["text-input-field", "", "我这两天总是睡不好，脑子停不下来。"],
      ["text-submit-button", "Send Text", ""],
      ["text-submit-status", "建立会话并连接实时通道后可发送文本。", ""],
      ["text-last-message-id-value", "not sent", ""],
      ["text-last-message-time-value", "not accepted", ""],
      ["transcript-user-final-text", "等待用户提交文本...", ""],
      ["transcript-assistant-reply-text", "等待 mock orchestrator reply...", ""],
      ["avatar-latest-reply-text", "等待 mock reply...", ""],
      ["avatar-option-companion", "Companion Avatar A", ""],
      ["avatar-option-coach", "Coach Avatar B", ""],
      ["avatar-baseline-card", "", ""],
      ["avatar-label-value", "Companion Avatar A", ""],
      ["avatar-meta-value", "Warm support / static 2D baseline / low motion", ""],
      ["avatar-character-state-value", "idle", ""],
      ["avatar-character-detail-value", "静态角色等待中。", ""],
      ["avatar-stage-note-value", "温和陪伴型角色，适合建立联系和低刺激安抚。", ""],
      ["avatar-mouth-shape", "", ""],
      ["avatar-mouth-state-value", "closed", ""],
      ["avatar-mouth-detail-value", "嘴部闭合，累计切换 0 次。", ""],
      ["avatar-speech-state-value", "idle", ""],
      ["avatar-speech-detail-value", "等待系统回复并合成语音。", ""],
      ["avatar-voice-value", "zh-CN-XiaoxiaoNeural", ""],
      ["avatar-duration-value", "0.0s / preview", ""],
      ["avatar-expression-preset-value", "ready_idle", ""],
      ["avatar-expression-detail-value", "未进入业务阶段前保持中性等待，不提前表现强情绪。", ""],
      ["avatar-replay-button", "Replay Voice", ""],
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

    standardElements.forEach(([id, textContent, value]) => {
      this.idMap.set(id, new FakeElement({ id, textContent, value }));
    });

    this.idMap.set("avatar-audio-player", new FakeAudioElement({ id: "avatar-audio-player" }));
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

function resolveMockVoice(requestedVoiceId) {
  if (requestedVoiceId === "coach_male_01") {
    return "zh-CN-YunxiNeural";
  }
  return "zh-CN-XiaoxiaoNeural";
}

function createMockRuntime(ttsBaseUrl, replyText, defaultAvatarId, dialogueConfig) {
  let currentSocket = null;
  let sessionPayload = {
    session_id: "sess_mock_tts_001",
    trace_id: "trace_mock_tts_001",
    status: "created",
    stage: "engage",
    input_modes: ["text", "audio"],
    avatar_id: defaultAvatarId,
    started_at: "2026-03-09T10:10:00Z",
    updated_at: "2026-03-09T10:10:00Z",
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
      const requestPayload = JSON.parse(options.body || "{}");
      sessionPayload = {
        ...sessionPayload,
        avatar_id: requestPayload.avatar_id || defaultAvatarId,
      };
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
        submitted_at: "2026-03-09T10:10:02Z",
        client_seq: submitted.client_seq,
      };

      const dialoguePayload = {
        session_id: sessionPayload.session_id,
        trace_id: sessionPayload.trace_id,
        message_id: "msg_assistant_mock_001",
        reply: replyText,
        emotion: dialogueConfig.emotion,
        risk_level: dialogueConfig.riskLevel,
        stage: dialogueConfig.stage,
        next_action: "ask_followup",
        knowledge_refs: ["sleep_hygiene_basic"],
        avatar_style: "warm_support",
        safety_flags: [],
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
          return messagePayload;
        },
      };
    }

    if (url === `${ttsBaseUrl}/internal/tts/synthesize`) {
      const payload = JSON.parse(options.body || "{}");
      const resolvedVoiceId = resolveMockVoice(payload.voice_id);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            tts_id: "tts_mock_001",
            session_id: sessionPayload.session_id,
            trace_id: sessionPayload.trace_id,
            message_id: payload.message_id || "msg_assistant_mock_001",
            voice_id: resolvedVoiceId,
            subtitle: payload.subtitle || payload.text,
            audio_format: "mp3",
            audio_url: `${ttsBaseUrl}/media/tts/tts_mock_001.mp3`,
            duration_ms: Math.max(1600, (payload.text || "").length * 180),
            byte_size: 1024,
            generated_at: "2026-03-09T10:10:03Z",
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

function collectSnapshot(document) {
  return {
    sessionId: document.getElementById("session-id-value").textContent,
    stage: document.getElementById("session-stage-value").textContent,
    dialogueReplyState: document.body.dataset.dialogueReplyState || null,
    ttsPlaybackState: document.body.dataset.ttsPlaybackState || null,
    avatarVisualState: document.body.dataset.avatarVisualState || null,
    activeAvatarId: document.body.dataset.activeAvatarId || null,
    effectiveAvatarId: document.body.dataset.effectiveAvatarId || null,
    effectiveAvatarProfile: document.body.dataset.effectiveAvatarProfile || null,
    avatarExpressionPreset: document.body.dataset.avatarExpressionPreset || null,
    avatarMouthState: document.body.dataset.avatarMouthState || null,
    avatarMouthTransitionCount: Number(document.body.dataset.avatarMouthTransitionCount || "0"),
    assistantReply: document.getElementById("transcript-assistant-reply-text").textContent,
    avatarReply: document.getElementById("avatar-latest-reply-text").textContent,
    avatarLabel: document.getElementById("avatar-label-value").textContent,
    avatarMeta: document.getElementById("avatar-meta-value").textContent,
    avatarCharacterState: document.getElementById("avatar-character-state-value").textContent,
    avatarCharacterDetail: document.getElementById("avatar-character-detail-value").textContent,
    avatarStageNote: document.getElementById("avatar-stage-note-value").textContent,
    avatarExpressionLabel: document.getElementById("avatar-expression-preset-value").textContent,
    avatarExpressionDetail: document.getElementById("avatar-expression-detail-value").textContent,
    avatarMouthLabel: document.getElementById("avatar-mouth-state-value").textContent,
    avatarMouthDetail: document.getElementById("avatar-mouth-detail-value").textContent,
    avatarSpeechState: document.getElementById("avatar-speech-state-value").textContent,
    avatarSpeechDetail: document.getElementById("avatar-speech-detail-value").textContent,
    avatarVoice: document.getElementById("avatar-voice-value").textContent,
    avatarDuration: document.getElementById("avatar-duration-value").textContent,
    audioSrc: document.getElementById("avatar-audio-player").src,
    connectionStatus: document.getElementById("connection-status-value").textContent,
    connectionLog: document.getElementById("connection-log").textContent,
  };
}

function executeApp({ fetchImpl, WebSocketImpl, apiBaseUrl, wsUrl, ttsBaseUrl }) {
  const document = new FakeDocument();
  const window = {
    document,
    fetch: fetchImpl,
    WebSocket: WebSocketImpl,
    __APP_CONFIG__: {
      apiBaseUrl,
      wsUrl,
      ttsBaseUrl,
      defaultAvatarId: "companion_female_01",
      heartbeatIntervalMs: 200,
      reconnectDelayMs: 150,
      autoplayAssistantAudio: true,
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
    avatarOptionCompanion: document.getElementById("avatar-option-companion"),
    avatarOptionCoach: document.getElementById("avatar-option-coach"),
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
    : createMockRuntime(args.ttsBaseUrl, args.replyText, args.avatarId, {
        stage: args.dialogueStage,
        emotion: args.dialogueEmotion,
        riskLevel: args.dialogueRiskLevel,
      });

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
    ttsBaseUrl: args.ttsBaseUrl,
  });

  if (args.avatarId === "coach_male_01" && runtime.avatarOptionCoach) {
    await runtime.avatarOptionCoach.click();
  }

  const beforeCreate = collectSnapshot(runtime.document);
  await runtime.startButton.click();
  await waitFor(
    () => runtime.document.getElementById("connection-status-value").textContent === "connected",
    args.connectTimeoutMs,
    "realtime connection did not reach connected state before text submit",
  );

  const afterConnect = collectSnapshot(runtime.document);
  runtime.textInputField.dispatchInput("最近总觉得脑子停不下来，晚上更明显。想先慢慢说出来。");
  await runtime.textSubmitButton.click();

  await waitFor(
    () => runtime.document.body.dataset.dialogueReplyState === "received",
    args.replyTimeoutMs,
    "dialogue reply did not arrive",
  );

  const afterReply = collectSnapshot(runtime.document);
  await waitFor(
    () => runtime.document.body.dataset.ttsPlaybackState === "playing",
    args.playbackStartTimeoutMs,
    "tts playback did not reach playing state",
  );

  const afterPlaybackStart = collectSnapshot(runtime.document);
  await waitFor(
    () => runtime.document.body.dataset.ttsPlaybackState === "completed",
    args.playbackCompleteTimeoutMs,
    "tts playback did not complete",
  );

  const afterPlaybackEnd = collectSnapshot(runtime.document);
  runtime.window.__virtualHumanConsoleController.shutdownForTest();
  process.stdout.write(
    `${JSON.stringify({ beforeCreate, afterConnect, afterReply, afterPlaybackStart, afterPlaybackEnd }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
