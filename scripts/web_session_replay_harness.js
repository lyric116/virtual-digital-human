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

    ["capture", "avatar", "emotion", "chat", "control"].forEach((panelId) => {
      this.panelMap.set(panelId, new FakeElement({ panelId }));
    });

    const standardElements = [
      ["session-start-button", "开始会话", ""],
      ["session-export-button", "Export", ""],
      ["session-replay-button", "回放记录", ""],
      ["text-input-field", "", "我这两天总是睡不好，脑子停不下来。"],
      ["text-submit-button", "发送文字", ""],
      ["text-submit-status", "开始会话并连接后，就可以发送文字。", ""],
      ["text-last-message-id-value", "not sent", ""],
      ["text-last-message-time-value", "not accepted", ""],
      ["transcript-user-partial-text", "等待你开始说话...", ""],
      ["transcript-user-final-text", "等待你的第一条消息...", ""],
      ["transcript-assistant-reply-text", "等待新的回应...", ""],
      ["avatar-latest-reply-text", "等待新的回应...", ""],
      ["avatar-option-companion", "陪伴角色 A", ""],
      ["avatar-option-coach", "引导角色 B", ""],
      ["avatar-baseline-card", "", ""],
      ["avatar-label-value", "陪伴角色 A", ""],
      ["avatar-meta-value", "温和、稳定、陪你慢慢说", ""],
      ["avatar-character-state-value", "idle", ""],
      ["avatar-character-detail-value", "陪伴角色已准备好开始回应。", ""],
      ["avatar-stage-note-value", "更适合温和接住情绪、慢慢展开对话。", ""],
      ["avatar-mouth-shape", "", ""],
      ["avatar-mouth-state-value", "closed", ""],
      ["avatar-mouth-detail-value", "当前嘴型闭合。", ""],
      ["avatar-speech-state-value", "idle", ""],
      ["avatar-speech-detail-value", "等待新的回应并准备语音。", ""],
      ["avatar-voice-value", "zh-CN-XiaoxiaoNeural", ""],
      ["avatar-duration-value", "0.0s / preview", ""],
      ["avatar-expression-preset-value", "ready_idle", ""],
      ["avatar-expression-detail-value", "当前保持平稳自然的待机表情。", ""],
      ["avatar-replay-button", "重播语音", ""],
      ["emotion-panel-status", "等待本轮对话的情绪摘要。", ""],
      ["text-signal-value", "pending", ""],
      ["text-signal-confidence", "置信度：待更新", ""],
      ["text-signal-detail", "文字线索尚未更新。", ""],
      ["audio-signal-value", "pending", ""],
      ["audio-signal-confidence", "置信度：待更新", ""],
      ["audio-signal-detail", "语音线索尚未更新。", ""],
      ["video-signal-value", "pending", ""],
      ["video-signal-confidence", "置信度：待更新", ""],
      ["video-signal-detail", "画面线索尚未更新。", ""],
      ["fusion-emotion-value", "pending", ""],
      ["fusion-risk-value", "pending", ""],
      ["fusion-confidence-value", "置信度：待更新", ""],
      ["fusion-conflict-value", "no", ""],
      ["fusion-detail-value", "等待更完整的情绪线索。", ""],
      ["fusion-stage-value", "当前仍在了解你的状态", ""],
      ["emotion-source-origin-value", "live_web_session", ""],
      ["emotion-source-dataset-value", "live_web", ""],
      ["emotion-source-record-value", "session/pending", ""],
      ["emotion-source-note-value", "等待会话样本信息", ""],
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
      ["session-export-status", "开始或恢复会话后，就可以导出当前记录。", ""],
      ["connection-status-value", "idle", ""],
      ["connection-heartbeat-value", "未开始", ""],
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
