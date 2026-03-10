#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const APP_JS = path.join(ROOT, "apps", "web", "app.js");

function parseArgs(argv) {
  const args = {
    apiBaseUrl: "http://127.0.0.1:8000",
    affectBaseUrl: "http://127.0.0.1:8060",
    mode: "mock-live",
    timeoutMs: 2000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--api-base-url") {
      args.apiBaseUrl = argv[index + 1] || args.apiBaseUrl;
      index += 1;
      continue;
    }
    if (current === "--affect-base-url") {
      args.affectBaseUrl = argv[index + 1] || args.affectBaseUrl;
      index += 1;
      continue;
    }
    if (current === "--mode") {
      args.mode = argv[index + 1] || args.mode;
      index += 1;
      continue;
    }
    if (current === "--timeout-ms") {
      args.timeoutMs = Number(argv[index + 1] || String(args.timeoutMs));
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

class FakeDocument {
  constructor() {
    this.readyState = "complete";
    this.body = { dataset: {}, appendChild() {}, removeChild() {} };
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
      ["avatar-option-companion", "Companion Avatar A", ""],
      ["avatar-option-coach", "Coach Avatar B", ""],
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
      ["fusion-conflict-value", "conflict: pending", ""],
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

function buildAffectPayload(requestPayload, mode) {
  const source = requestPayload.metadata || {};
  const text = requestPayload.text_input || "";
  const isEnterprise = mode === "enterprise-sample";
  const sourceContext = isEnterprise
    ? {
        origin: "enterprise_validation_manifest",
        dataset: "noxi",
        record_id: "noxi/001_2016-03-17_Paris/speaker_a/1",
        note: "enterprise sample bound for offline replay display",
      }
    : {
        origin: source.source || "web-shell",
        dataset: source.dataset || "live_web",
        record_id: source.record_id || `session/${requestPayload.session_id}`,
        note: source.sample_note || "enterprise sample pending binding",
      };
  const anxious = text.includes("睡不好") || text.includes("停不下来");

  return {
    session_id: requestPayload.session_id,
    trace_id: requestPayload.trace_id,
    current_stage: requestPayload.current_stage,
    generated_at: "2026-03-10T09:00:00Z",
    source_context: sourceContext,
    text_result: {
      status: "ready",
      label: anxious ? "anxious" : "neutral",
      confidence: anxious ? 0.78 : 0.58,
      evidence: anxious ? ["keyword:睡不好"] : ["text:general_statement"],
      detail: anxious ? "文本路检测到睡眠和紧张相关线索。" : "文本路暂未命中明显风险词。",
    },
    audio_result: {
      status: "ready",
      label: "speech_observed",
      confidence: 0.55,
      evidence: ["audio_upload_state:idle"],
      detail: "音频路先显示占位结果，后续再接真实特征。",
    },
    video_result: {
      status: "offline",
      label: "camera_offline",
      confidence: 0.18,
      evidence: ["camera_state:idle"],
      detail: "视频路当前离线，先保留挂载位。",
    },
    fusion_result: {
      emotion_state: anxious ? "anxious_monitoring" : "observe_more",
      risk_level: anxious ? "medium" : "low",
      confidence: anxious ? 0.69 : 0.48,
      conflict: false,
      conflict_reason: null,
      detail: anxious ? "文本焦虑线索已出现，其他模态仍为占位。" : "当前三路仍以占位结果为主。",
    },
  };
}

function createMockFetch(mode) {
  const mockFetch = async function mockFetch(url, options = {}) {
    if (url.endsWith("/api/session/create")) {
      return {
        ok: true,
        status: 201,
        async json() {
          return {
            session_id: "sess_emotion_001",
            trace_id: "trace_emotion_001",
            status: "created",
            stage: "engage",
            input_modes: ["text", "audio", "video"],
            avatar_id: "companion_female_01",
            started_at: "2026-03-10T08:59:00Z",
            updated_at: "2026-03-10T08:59:00Z",
          };
        },
      };
    }

    if (url.includes("/internal/affect/analyze")) {
      const requestPayload = JSON.parse(options.body || "{}");
      mockFetch.__affectRequests.push(requestPayload);
      return {
        ok: true,
        status: 200,
        async json() {
          return buildAffectPayload(requestPayload, mode);
        },
      };
    }

    throw new Error(`unexpected fetch url: ${url}`);
  };

  mockFetch.__affectRequests = [];
  return mockFetch;
}

function collectSnapshot(document, fetchImpl) {
  return {
    sessionId: document.getElementById("session-id-value").textContent,
    emotionPanelState: document.body.dataset.affectPanelState || null,
    emotionPanelStatus: document.getElementById("emotion-panel-status").textContent,
    textSignal: document.getElementById("text-signal-value").textContent,
    textConfidence: document.getElementById("text-signal-confidence").textContent,
    textDetail: document.getElementById("text-signal-detail").textContent,
    audioSignal: document.getElementById("audio-signal-value").textContent,
    videoSignal: document.getElementById("video-signal-value").textContent,
    fusionEmotion: document.getElementById("fusion-emotion-value").textContent,
    fusionRisk: document.getElementById("fusion-risk-value").textContent,
    fusionConfidence: document.getElementById("fusion-confidence-value").textContent,
    fusionConflict: document.getElementById("fusion-conflict-value").textContent,
    fusionDetail: document.getElementById("fusion-detail-value").textContent,
    fusionStage: document.getElementById("fusion-stage-value").textContent,
    sourceOrigin: document.getElementById("emotion-source-origin-value").textContent,
    sourceDataset: document.getElementById("emotion-source-dataset-value").textContent,
    sourceRecord: document.getElementById("emotion-source-record-value").textContent,
    sourceNote: document.getElementById("emotion-source-note-value").textContent,
    affectRequestCount: fetchImpl.__affectRequests.length,
    affectRequest: fetchImpl.__affectRequests[0] || null,
  };
}

function waitFor(predicate, timeoutMs, label) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`timed out waiting for ${label}`));
        return;
      }
      setTimeout(check, 20);
    }
    check();
  });
}

function executeApp({ fetchImpl, apiBaseUrl, affectBaseUrl }) {
  const document = new FakeDocument();
  const window = {
    document,
    fetch: fetchImpl,
    WebSocket: undefined,
    __APP_CONFIG__: {
      apiBaseUrl,
      wsUrl: "ws://127.0.0.1:8000/ws",
      ttsBaseUrl: "http://127.0.0.1:8040",
      affectBaseUrl,
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fetchImpl = createMockFetch(args.mode);
  const runtime = executeApp({
    fetchImpl,
    apiBaseUrl: args.apiBaseUrl,
    affectBaseUrl: args.affectBaseUrl,
  });

  const beforeCreate = collectSnapshot(runtime.document, fetchImpl);
  await runtime.startButton.click();
  await waitFor(
    () => runtime.document.body.dataset.affectPanelState === "ready",
    args.timeoutMs,
    "affect panel ready",
  );
  const afterAffect = collectSnapshot(runtime.document, fetchImpl);

  console.log(JSON.stringify({ beforeCreate, afterAffect }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
