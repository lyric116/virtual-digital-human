#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const APP_JS = path.join(ROOT, "apps", "web", "app.js");
const DEFAULT_EXPORT = path.join(ROOT, "data", "demo", "session_replay_export.json");

function parseArgs(argv) {
  const args = {
    exportPath: DEFAULT_EXPORT,
    replayTimeoutMs: 10000,
    playbackStartTimeoutMs: 6000,
    completeTimeoutMs: 12000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--export-path") {
      args.exportPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--replay-timeout-ms") {
      args.replayTimeoutMs = Number(argv[index + 1] || "10000");
      index += 1;
      continue;
    }
    if (current === "--playback-start-timeout-ms") {
      args.playbackStartTimeoutMs = Number(argv[index + 1] || "6000");
      index += 1;
      continue;
    }
    if (current === "--complete-timeout-ms") {
      args.completeTimeoutMs = Number(argv[index + 1] || "12000");
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
  }

  load() {}
  pause() {}
  play() {
    return Promise.resolve();
  }
}

class FakeStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
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
      ["session-export-button", "Export", ""],
      ["session-replay-button", "Replay Export", ""],
      ["text-input-field", "", "我这两天总是睡不好，脑子停不下来。"],
      ["text-submit-button", "Send Text", ""],
      ["text-submit-status", "建立会话并连接实时通道后可发送文本。", ""],
      ["text-last-message-id-value", "not sent", ""],
      ["text-last-message-time-value", "not accepted", ""],
      ["transcript-user-partial-text", "等待 partial transcript...", ""],
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
      ["emotion-panel-status", "等待 affect-service 返回第一版占位结果。", ""],
      ["text-signal-value", "pending", ""],
      ["text-signal-confidence", "confidence: pending", ""],
      ["text-signal-detail", "文本路尚未接入。", ""],
      ["audio-signal-value", "pending", ""],
      ["audio-signal-confidence", "confidence: pending", ""],
      ["audio-signal-detail", "音频路尚未接入。", ""],
      ["video-signal-value", "pending", ""],
      ["video-signal-confidence", "confidence: pending", ""],
      ["video-signal-detail", "视频路尚未接入。", ""],
      ["fusion-emotion-value", "pending", ""],
      ["fusion-risk-value", "pending", ""],
      ["fusion-confidence-value", "confidence: pending", ""],
      ["fusion-conflict-value", "no", ""],
      ["fusion-detail-value", "等待融合结果。", ""],
      ["fusion-stage-value", "stage: idle / next: pending", ""],
      ["emotion-source-origin-value", "live_web_session", ""],
      ["emotion-source-dataset-value", "live_web", ""],
      ["emotion-source-record-value", "session/pending", ""],
      ["emotion-source-note-value", "enterprise sample pending binding", ""],
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
      ["session-export-status", "创建或恢复会话后可导出当前 JSON。", ""],
      ["connection-status-value", "idle", ""],
      ["connection-heartbeat-value", "not started", ""],
      ["connection-log", "realtime idle", ""],
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

function collectSnapshot(document, controller) {
  const state = controller.getState();
  return {
    replayState: state.replayState,
    replayMessage: state.replayMessage,
    replayEventCount: state.replayEventCount,
    connectionStatus: document.getElementById("connection-status-value").textContent,
    sessionId: document.getElementById("session-id-value").textContent,
    stage: document.getElementById("session-stage-value").textContent,
    transcriptFinal: document.getElementById("transcript-user-final-text").textContent,
    assistantReply: document.getElementById("transcript-assistant-reply-text").textContent,
    avatarSpeechState: document.getElementById("avatar-speech-state-value").textContent,
    avatarMouthState: document.getElementById("avatar-mouth-state-value").textContent,
    avatarExpression: document.getElementById("avatar-expression-preset-value").textContent,
    fusionRisk: document.getElementById("fusion-risk-value").textContent,
    emotionStatus: document.getElementById("emotion-panel-status").textContent,
    timelineText: document.getElementById("chat-timeline-list").dataset.timelineText || "",
    exportStatus: document.getElementById("session-export-status").textContent,
  };
}

function executeApp(exportPayload) {
  const document = new FakeDocument();
  const localStorage = new FakeStorage();
  localStorage.setItem(
    "virtual-human-last-export",
    JSON.stringify({ payload: exportPayload, fileName: "session_replay_export.json" }),
  );
  const window = {
    document,
    fetch: async function mockFetch() {
      return {
        ok: false,
        status: 503,
        async json() {
          return { message: "mock fetch disabled in replay harness" };
        },
      };
    },
    __APP_CONFIG__: {
      apiBaseUrl: "http://127.0.0.1:8000",
      wsUrl: "ws://127.0.0.1:8000/ws",
      ttsBaseUrl: "http://127.0.0.1:8040",
      affectBaseUrl: "http://127.0.0.1:8060",
      defaultAvatarId: "companion_female_01",
      autoplayAssistantAudio: false,
      replayDelayScale: 0.05,
      replayDelayMinMs: 20,
      replayDelayMaxMs: 60,
    },
    localStorage,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };

  const context = {
    window,
    document,
    fetch: window.fetch,
    WebSocket: function MockWebSocket() {},
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
    controller: window.__virtualHumanConsoleController,
    replayButton: document.getElementById("session-replay-button"),
  };
}

async function waitFor(condition, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(message);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const exportPayload = JSON.parse(fs.readFileSync(args.exportPath, "utf-8"));
  const runtime = executeApp(exportPayload);

  const beforeReplay = collectSnapshot(runtime.document, runtime.controller);
  await runtime.replayButton.click();

  await waitFor(
    () => runtime.controller.getState().lastAcceptedText.includes("睡不好"),
    args.replayTimeoutMs,
    "final transcript did not appear during replay",
  );
  const afterTranscript = collectSnapshot(runtime.document, runtime.controller);

  await waitFor(
    () => runtime.controller.getState().dialogueReplyState === "received",
    args.replayTimeoutMs,
    "dialogue reply did not appear during replay",
  );
  const afterReply = collectSnapshot(runtime.document, runtime.controller);

  await waitFor(
    () => runtime.controller.getState().ttsPlaybackState === "playing",
    args.playbackStartTimeoutMs,
    "replay did not reach playback state",
  );
  const duringPlayback = collectSnapshot(runtime.document, runtime.controller);

  await waitFor(
    () => runtime.controller.getState().replayState === "completed",
    args.completeTimeoutMs,
    "replay did not complete",
  );
  const afterReplay = collectSnapshot(runtime.document, runtime.controller);

  runtime.controller.shutdownForTest();
  process.stdout.write(`${JSON.stringify({ beforeReplay, afterTranscript, afterReply, duringPlayback, afterReplay }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
