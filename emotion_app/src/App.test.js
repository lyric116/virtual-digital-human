import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

const originalMediaDevices = navigator.mediaDevices;
const originalMediaPlay = window.HTMLMediaElement.prototype.play;
const originalMediaPause = window.HTMLMediaElement.prototype.pause;
const originalMediaLoad = window.HTMLMediaElement.prototype.load;
const originalAudioContext = window.AudioContext;
const originalWebkitAudioContext = window.webkitAudioContext;

const appConfig = {
  apiBaseUrl: 'http://127.0.0.1:8000',
  wsUrl: 'ws://127.0.0.1:8000/ws',
  asrBaseUrl: 'http://127.0.0.1:8020',
  ttsBaseUrl: 'http://127.0.0.1:8040',
  affectBaseUrl: 'http://127.0.0.1:8060',
  defaultAvatarId: 'companion_female_01',
  activeSessionStorageKey: 'virtual-human-active-session-id',
  exportCacheStorageKey: 'virtual-human-last-export',
  heartbeatIntervalMs: 200,
  reconnectDelayMs: 150,
  videoFrameUploadIntervalMs: 50,
  sourceLabel: 'test',
};

const sessionPayload = {
  session_id: 'sess_test_001',
  trace_id: 'trace_test_001',
  status: 'created',
  stage: 'engage',
  input_modes: ['text', 'audio', 'video'],
  avatar_id: 'companion_female_01',
  metadata: { source: 'emotion_app' },
  started_at: '2026-03-16T08:00:00Z',
  updated_at: '2026-03-16T08:00:00Z',
};

function buildMessage(overrides = {}) {
  return {
    message_id: 'msg_default',
    session_id: sessionPayload.session_id,
    trace_id: sessionPayload.trace_id,
    role: 'user',
    status: 'accepted',
    source_kind: 'text',
    content_text: 'default message',
    submitted_at: '2026-03-16T08:00:01Z',
    metadata: {},
    ...overrides,
  };
}

function buildEnvelope(eventType, payload = {}, overrides = {}) {
  return {
    event_id: overrides.event_id || `evt_${eventType.replace(/[^a-z]/gi, '_')}`,
    event_type: eventType,
    schema_version: 'v1alpha1',
    source_service: overrides.source_service || 'api_gateway',
    session_id: overrides.session_id || sessionPayload.session_id,
    trace_id: overrides.trace_id || sessionPayload.trace_id,
    message_id: overrides.message_id || payload.message_id || null,
    emitted_at: overrides.emitted_at || '2026-03-16T08:00:02Z',
    payload,
  };
}

function buildSessionState({ session = sessionPayload, messages = [] } = {}) {
  return {
    session,
    messages,
  };
}

function buildAffectPayload(overrides = {}) {
  const payload = {
    current_stage: 'assess',
    generated_at: '2026-03-16T08:00:06Z',
    source_context: {
      origin: 'realtime',
      dataset: 'emotion_app_live',
      record_id: 'record_123',
      note: 'fresh affect sample',
    },
    text_result: {
      status: 'ready',
      label: 'calm',
      confidence: 0.74,
      detail: 'text calm',
    },
    audio_result: {
      status: 'ready',
      label: 'steady',
      confidence: 0.68,
      detail: 'audio steady',
    },
    video_result: {
      status: 'ready',
      label: 'relaxed',
      confidence: 0.7,
      detail: 'video relaxed',
    },
    fusion_result: {
      emotion_state: 'grounded',
      risk_level: 'medium',
      confidence: 0.82,
      conflict: false,
      conflict_reason: '',
      detail: 'fusion grounded detail',
    },
  };

  return {
    ...payload,
    ...overrides,
    source_context: {
      ...payload.source_context,
      ...(overrides.source_context || {}),
    },
    text_result: {
      ...payload.text_result,
      ...(overrides.text_result || {}),
    },
    audio_result: {
      ...payload.audio_result,
      ...(overrides.audio_result || {}),
    },
    video_result: {
      ...payload.video_result,
      ...(overrides.video_result || {}),
    },
    fusion_result: {
      ...payload.fusion_result,
      ...(overrides.fusion_result || {}),
    },
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function streamResponse(lines, status = 200) {
  let readIndex = 0;
  const encodedLines = lines.map((line) => new Uint8Array(Array.from(line).map((character) => character.charCodeAt(0))));
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader() {
        return {
          async read() {
            if (readIndex >= encodedLines.length) {
              return { done: true, value: undefined };
            }
            const value = encodedLines[readIndex];
            readIndex += 1;
            return { done: false, value };
          },
          releaseLock() {},
        };
      },
    },
    json: async () => null,
  };
}

function installMockStreamingAudioContext() {
  class MockAudioBuffer {
    constructor(length) {
      this.duration = length / 24000;
      this.channelData = new Float32Array(length);
    }

    copyToChannel(data) {
      this.channelData.set(data);
    }

    getChannelData() {
      return this.channelData;
    }
  }

  class MockAudioBufferSourceNode {
    constructor() {
      this.onended = null;
    }

    connect() {}

    disconnect() {}

    start() {
      setTimeout(() => {
        if (typeof this.onended === 'function') {
          this.onended();
        }
      }, 0);
    }

    stop() {}
  }

  class MockAudioContext {
    constructor() {
      this.currentTime = 0;
      this.destination = {};
      this.state = 'running';
    }

    createBuffer(channelCount, length) {
      return new MockAudioBuffer(length);
    }

    createBufferSource() {
      return new MockAudioBufferSourceNode();
    }

    resume() {
      this.state = 'running';
      return Promise.resolve();
    }

    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
  }

  window.AudioContext = MockAudioContext;
  window.webkitAudioContext = MockAudioContext;
}

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    this.listeners = new Map();
    MockWebSocket.instances.push(this);
  }

  static reset() {
    MockWebSocket.instances = [];
  }

  addEventListener(type, listener) {
    const current = this.listeners.get(type) || [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  removeEventListener(type, listener) {
    const current = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      current.filter((item) => item !== listener),
    );
  }

  emit(type, event = {}) {
    const current = this.listeners.get(type) || [];
    current.forEach((listener) => listener(event));
  }

  send(data) {
    this.sent.push(data);
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close', { code, reason });
    }, 0);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit('open', {});
  }

  receive(envelope) {
    this.emit('message', { data: JSON.stringify(envelope) });
  }
}

function latestSocket() {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

async function openSocket(socket) {
  act(() => {
    socket.open();
  });
  await waitFor(() => expect(socket.sent.length).toBeGreaterThan(0));
}

async function clickCreateSession() {
  fireEvent.click(screen.getByRole('button', { name: /创建会话|create session/i }));
  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
  return latestSocket();
}

async function createConnectedSession() {
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));
  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);
  return socket;
}

function setMediaDevices(value) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value,
  });
}

function installMockCameraEnvironment(options = {}) {
  const track = { stop: jest.fn() };
  const stream = {
    getTracks: () => [track],
  };
  const getUserMedia = options.getUserMedia || jest.fn().mockResolvedValue(stream);
  const createElement = document.createElement.bind(document);
  const toBlob = options.toBlob || ((callback, type) => callback(new Blob(['frame'], { type: type || 'image/jpeg' })));

  setMediaDevices({ getUserMedia });
  jest.spyOn(document, 'createElement').mockImplementation((tagName, ...rest) => {
    const element = createElement(tagName, ...rest);
    if (String(tagName).toLowerCase() === 'canvas') {
      element.getContext = jest.fn().mockReturnValue({ drawImage: jest.fn() });
      element.toBlob = jest.fn(toBlob);
    }
    return element;
  });
  window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = jest.fn();
  window.HTMLMediaElement.prototype.load = jest.fn();

  return { getUserMedia, track };
}

function getConversationMessageTexts() {
  const heading = screen.getByText(/^对话记录$|^Conversation$/i);
  const panel = heading.closest('div')?.parentElement;
  expect(panel).not.toBeNull();
  return Array.from(panel.querySelectorAll('p'))
    .map((node) => node.textContent?.trim())
    .filter(Boolean);
}

async function openCameraModal() {
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: /摄像头预览|camera preview/i })[0]);
  });
}

async function openMicTestModal() {
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: /麦克风调试|mic debug|mikrofontest|test micro/i })[0]);
  });
}

async function closeCameraModal() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /完成|done/i }));
  });
}

async function openTimelineView() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /时光记录|time log/i }));
  });
}

async function loginUser() {
  fireEvent.click(screen.getByRole('button', { name: /欢迎入住|check in/i }));
  await waitFor(() => expect(screen.getByText(/欢迎回来|welcome back/i)).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText(/用户名|username/i), { target: { value: 'tester' } });
  fireEvent.change(screen.getByPlaceholderText(/密码|password/i), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: /温柔登录|gentle login/i }));
  await waitFor(() => expect(screen.queryByText(/欢迎回来|welcome back/i)).not.toBeInTheDocument());
}

beforeEach(() => {
  window.localStorage.clear();
  MockWebSocket.reset();
  global.fetch = jest.fn((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/internal/affect/analyze')) {
      return Promise.resolve(jsonResponse(buildAffectPayload()));
    }
    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  });
  window.WebSocket = MockWebSocket;
  global.WebSocket = MockWebSocket;
  setMediaDevices(originalMediaDevices);
  window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = jest.fn();
  window.HTMLMediaElement.prototype.load = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  setMediaDevices(originalMediaDevices);
  window.MediaRecorder = undefined;
  window.HTMLMediaElement.prototype.play = originalMediaPlay;
  window.HTMLMediaElement.prototype.pause = originalMediaPause;
  window.HTMLMediaElement.prototype.load = originalMediaLoad;
  window.AudioContext = originalAudioContext;
  window.webkitAudioContext = originalWebkitAudioContext;
});

test('renders the base experience with timeline hidden by default', () => {
  render(<App appConfig={appConfig} />);

  expect(screen.getByText('和光心苑')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /创建会话|create session/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /时光记录|time log/i })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /摄像头预览|camera preview/i }).length).toBeGreaterThan(0);
  expect(screen.queryByText(/^对话记录$|^Conversation$/i)).not.toBeInTheDocument();

});

test('session runtime panel camera and mic controls open the same debug modals', async () => {
  installMockCameraEnvironment();

  render(<App appConfig={appConfig} />);

  const runtimeSection = screen
    .getByText(/开始一段陪伴式对话|start a gentle conversation/i)
    .closest('section');
  expect(runtimeSection).not.toBeNull();

  await act(async () => {
    fireEvent.click(within(runtimeSection).getByRole('button', { name: /摄像头预览|camera preview/i }));
  });
  expect(screen.getByRole('heading', { name: /摄像头预览|camera check/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /完成|done/i }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: /摄像头预览|camera check/i })).not.toBeInTheDocument());

  await act(async () => {
    fireEvent.click(within(runtimeSection).getByRole('button', { name: /麦克风调试|mic debug|mikrofontest|test micro/i }));
  });
  expect(screen.getByRole('heading', { name: /麦克风调试|mic debug|mikrofontest|test micro/i })).toBeInTheDocument();
  expect(screen.getByText(/这里只用于调试麦克风，不会发送成一轮对话|microphone debugging only/i)).toBeInTheDocument();
});

test('create session connects websocket with the expected url', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();

  expect(socket.url).toBe(
    'ws://127.0.0.1:8000/ws/session/sess_test_001?trace_id=trace_test_001',
  );

  await openSocket(socket);
  expect(JSON.parse(socket.sent[0])).toMatchObject({
    type: 'ping',
    session_id: sessionPayload.session_id,
    trace_id: sessionPayload.trace_id,
  });
});

test('create session sends the selected Xiaozhi avatar id', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({
    ...sessionPayload,
    avatar_id: 'coach_male_01',
  }, 201));

  render(<App appConfig={appConfig} />);

  fireEvent.click(screen.getByRole('button', { name: '小智' }));
  fireEvent.click(screen.getByRole('button', { name: /创建会话|create session/i }));

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/session/create'),
    expect.any(Object),
  ));

  const [, requestOptions] = fetch.mock.calls.find(([url]) => String(url).includes('/api/session/create'));
  expect(JSON.parse(requestOptions.body)).toMatchObject({
    avatar_id: 'coach_male_01',
  });
  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
});

test('avatar buttons switch the assistant preview between Lily and Xiaozhi', () => {
  render(<App appConfig={appConfig} />);

  const assistantSurface = screen.getByTestId('assistant-avatar-surface');
  expect(within(assistantSurface).getAllByText('莉莉').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: '小智' }));
  expect(within(assistantSurface).getAllByText('小智').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: '莉莉' }));
  expect(within(assistantSurface).getAllByText('莉莉').length).toBeGreaterThan(0);
});

test('avatar buttons switch the assistant preview even when a Lily session is restored', async () => {
  window.localStorage.setItem(appConfig.activeSessionStorageKey, sessionPayload.session_id);
  fetch.mockResolvedValueOnce(jsonResponse(buildSessionState({
    session: {
      ...sessionPayload,
      avatar_id: 'companion_female_01',
    },
    messages: [],
  })));

  render(<App appConfig={appConfig} />);

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/session/sess_test_001/state'),
    expect.any(Object),
  ));

  const assistantSurface = screen.getByTestId('assistant-avatar-surface');
  expect(within(assistantSurface).getAllByText('莉莉').length).toBeGreaterThan(0);

  const coachButton = screen.getByRole('button', { name: '小智' });
  await waitFor(() => expect(coachButton).toBeEnabled());
  fireEvent.click(coachButton);

  await waitFor(() => expect(within(assistantSurface).getAllByText('小智').length).toBeGreaterThan(0));
  expect(screen.getByText('当前对话角色：莉莉')).toBeInTheDocument();
  expect(screen.getByText('下次创建会话时将使用：小智')).toBeInTheDocument();
});

test('restore session keeps the session panel hidden until timeline is opened', async () => {
  window.localStorage.setItem(appConfig.activeSessionStorageKey, sessionPayload.session_id);
  fetch.mockResolvedValueOnce(jsonResponse(buildSessionState({
    messages: [
      buildMessage({
        message_id: 'msg_restore_user',
        content_text: 'restored user',
      }),
      buildMessage({
        message_id: 'msg_restore_assistant',
        role: 'assistant',
        status: 'completed',
        content_text: 'restored assistant',
        submitted_at: '2026-03-16T08:00:03Z',
        metadata: { stage: 'engage' },
      }),
    ],
  })));

  render(<App appConfig={appConfig} />);

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/session/sess_test_001/state'),
    expect.any(Object),
  ));
  await waitFor(() => expect(screen.getAllByText('restored assistant').length).toBeGreaterThan(0));
  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

  expect(screen.getByText(/开始一段陪伴式对话|start a gentle conversation/i)).toBeInTheDocument();
  expect(screen.queryByText(/^对话记录$|^Conversation$/i)).not.toBeInTheDocument();

  await openTimelineView();
  expect(screen.queryByText(/开始一段陪伴式对话|start a gentle conversation/i)).not.toBeInTheDocument();
  expect(getConversationMessageTexts()).toEqual([
    'restored user',
    'restored assistant',
  ]);

  await openTimelineView();
  expect(screen.getByText(/开始一段陪伴式对话|start a gentle conversation/i)).toBeInTheDocument();
  expect(screen.queryByText(/^对话记录$|^Conversation$/i)).not.toBeInTheDocument();
});

test('timeline opens from the header and logged-in home closes it again', async () => {
  const socket = await createConnectedSession();
  await loginUser();

  act(() => {
    socket.receive(buildEnvelope('message.accepted', {
      ...buildMessage({
        message_id: 'msg_trace_user_001',
        content_text: 'trace user message',
        submitted_at: '2026-03-16T08:00:04Z',
      }),
    }));
    socket.receive(buildEnvelope('dialogue.reply', {
      session_id: sessionPayload.session_id,
      trace_id: sessionPayload.trace_id,
      message_id: 'msg_trace_assistant_001',
      reply: 'trace assistant reply',
      emotion: 'calm',
      risk_level: 'low',
      stage: 'assess',
      next_action: 'ask_followup',
      submitted_at: '2026-03-16T08:00:05Z',
    }, { source_service: 'orchestrator' }));
  });

  await waitFor(() => expect(screen.getAllByText('trace assistant reply').length).toBeGreaterThan(0));
  expect(screen.queryByText(/^对话记录$|^Conversation$/i)).not.toBeInTheDocument();

  await openTimelineView();
  expect(getConversationMessageTexts()).toEqual([
    'trace user message',
    'trace assistant reply',
  ]);

  fireEvent.click(screen.getByRole('button', { name: /欢迎回家|welcome home/i }));
  expect(screen.queryByText(/^对话记录$|^Conversation$/i)).not.toBeInTheDocument();

  await openTimelineView();
  expect(getConversationMessageTexts()).toEqual([
    'trace user message',
    'trace assistant reply',
  ]);
});

test('timeline preserves turn ordering and dedupes replayed message envelopes', async () => {
  window.localStorage.setItem(appConfig.activeSessionStorageKey, sessionPayload.session_id);
  fetch.mockResolvedValueOnce(jsonResponse(buildSessionState({
    session: {
      ...sessionPayload,
      status: 'active',
      stage: 'reassess',
      updated_at: '2026-03-16T08:00:08Z',
    },
    messages: [
      buildMessage({
        message_id: 'msg_user_turn_1',
        content_text: 'first user turn',
        submitted_at: '2026-03-16T08:00:01Z',
      }),
      buildMessage({
        message_id: 'msg_assistant_turn_1',
        role: 'assistant',
        status: 'completed',
        content_text: 'first assistant turn',
        submitted_at: '2026-03-16T08:00:02Z',
        metadata: { stage: 'engage' },
      }),
      buildMessage({
        message_id: 'msg_user_turn_2',
        content_text: 'second user turn',
        submitted_at: '2026-03-16T08:00:03Z',
      }),
      buildMessage({
        message_id: 'msg_assistant_turn_2',
        role: 'assistant',
        status: 'completed',
        content_text: 'second assistant turn',
        submitted_at: '2026-03-16T08:00:04Z',
        metadata: { stage: 'assess' },
      }),
      buildMessage({
        message_id: 'msg_user_turn_3',
        content_text: 'third user turn',
        submitted_at: '2026-03-16T08:00:05Z',
      }),
      buildMessage({
        message_id: 'msg_assistant_turn_3',
        role: 'assistant',
        status: 'completed',
        content_text: 'third assistant turn',
        submitted_at: '2026-03-16T08:00:06Z',
        metadata: { stage: 'reassess' },
      }),
    ],
  })));

  render(<App appConfig={appConfig} />);

  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
  await waitFor(() => expect(screen.getAllByText('third assistant turn').length).toBeGreaterThan(0));

  await openTimelineView();
  expect(getConversationMessageTexts()).toEqual([
    'first user turn',
    'first assistant turn',
    'second user turn',
    'second assistant turn',
    'third user turn',
    'third assistant turn',
  ]);

  const socket = latestSocket();
  await openSocket(socket);
  act(() => {
    socket.receive(buildEnvelope('message.accepted', {
      ...buildMessage({
        message_id: 'msg_user_turn_3',
        content_text: 'third user turn',
        submitted_at: '2026-03-16T08:00:05Z',
      }),
    }));
    socket.receive(buildEnvelope('dialogue.reply', {
      session_id: sessionPayload.session_id,
      trace_id: sessionPayload.trace_id,
      message_id: 'msg_assistant_turn_3',
      reply: 'third assistant turn',
      emotion: 'calm',
      risk_level: 'low',
      stage: 'reassess',
      next_action: 'ask_followup',
      submitted_at: '2026-03-16T08:00:06Z',
    }, { source_service: 'orchestrator' }));
  });

  await waitFor(() => expect(screen.getAllByText('third assistant turn').length).toBeGreaterThan(0));
  expect(getConversationMessageTexts()).toEqual([
    'first user turn',
    'first assistant turn',
    'second user turn',
    'second assistant turn',
    'third user turn',
    'third assistant turn',
  ]);
});

test('dialogue reply prefers streaming tts when the stream endpoint is available', async () => {
  installMockStreamingAudioContext();
  fetch.mockImplementation((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/api/session/create')) {
      return Promise.resolve(jsonResponse(sessionPayload, 201));
    }
    if (requestUrl.includes('/internal/tts/synthesize-stream')) {
      return Promise.resolve(jsonResponse({
        tts_id: 'tts_stream_001',
        session_id: sessionPayload.session_id,
        trace_id: sessionPayload.trace_id,
        message_id: 'msg_stream_reply_001',
        voice_id: 'Cherry',
        subtitle: 'streaming assistant reply',
        audio_format: 'wav',
        audio_url: 'http://127.0.0.1:8040/media/tts/tts_stream_001.wav',
        duration_ms: 1800,
        byte_size: 0,
        provider_used: 'qwen_tts_stream',
        fallback_used: false,
        fallback_reason: null,
        generated_at: '2026-04-04T08:00:05Z',
        streaming: true,
        stream_url: 'http://127.0.0.1:8040/internal/tts/stream/tts_stream_001',
        stream_audio_format: 'pcm_s16le',
        stream_sample_rate_hz: 24000,
      }));
    }
    if (requestUrl.includes('/internal/tts/stream/tts_stream_001')) {
      return Promise.resolve(streamResponse([
        `${JSON.stringify({ type: 'started', tts_id: 'tts_stream_001', generated_at: '2026-04-04T08:00:05Z', audio_url: 'http://127.0.0.1:8040/media/tts/tts_stream_001.wav' })}\n`,
        `${JSON.stringify({ type: 'audio_chunk', data: 'AAAAAA==', sample_rate_hz: 24000 })}\n`,
        `${JSON.stringify({ type: 'completed', tts_id: 'tts_stream_001', audio_url: 'http://127.0.0.1:8040/media/tts/tts_stream_001.wav', audio_format: 'wav', duration_ms: 1800, byte_size: 128, generated_at: '2026-04-04T08:00:06Z' })}\n`,
      ]));
    }
    if (requestUrl.includes('/api/session/sess_test_001/runtime-event')) {
      return Promise.resolve(jsonResponse({ accepted: true }, 202));
    }
    if (requestUrl.includes('/internal/affect/analyze')) {
      return Promise.resolve(jsonResponse(buildAffectPayload()));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  act(() => {
    socket.receive(buildEnvelope('dialogue.reply', {
      session_id: sessionPayload.session_id,
      trace_id: sessionPayload.trace_id,
      message_id: 'msg_stream_reply_001',
      reply: 'streaming assistant reply',
      emotion: 'calm',
      risk_level: 'low',
      stage: 'engage',
      next_action: 'ask_followup',
      submitted_at: '2026-04-04T08:00:04Z',
    }, { source_service: 'orchestrator' }));
  });

  await waitFor(() => expect(fetch.mock.calls.some(
    ([url]) => String(url).includes('/internal/tts/synthesize-stream'),
  )).toBe(true));
  await waitFor(() => expect(fetch.mock.calls.some(
    ([url]) => String(url).includes('/internal/tts/stream/tts_stream_001'),
  )).toBe(true));
  expect(fetch.mock.calls.some(
    ([url]) => String(url).includes('/internal/tts/synthesize')
      && !String(url).includes('/internal/tts/synthesize-stream'),
  )).toBe(false);
});

test('dialogue reply falls back to legacy tts when streaming prepare is unavailable', async () => {
  installMockStreamingAudioContext();
  fetch.mockImplementation((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/api/session/create')) {
      return Promise.resolve(jsonResponse(sessionPayload, 201));
    }
    if (requestUrl.includes('/internal/tts/synthesize-stream')) {
      return Promise.resolve(jsonResponse({
        detail: 'streaming tts model is not configured',
      }, 409));
    }
    if (
      requestUrl.includes('/internal/tts/synthesize')
      && !requestUrl.includes('/internal/tts/synthesize-stream')
    ) {
      return Promise.resolve(jsonResponse({
        tts_id: 'tts_legacy_001',
        session_id: sessionPayload.session_id,
        trace_id: sessionPayload.trace_id,
        message_id: 'msg_legacy_reply_001',
        voice_id: 'zh-CN-XiaoxiaoNeural',
        subtitle: 'legacy assistant reply',
        audio_format: 'mp3',
        audio_url: 'http://127.0.0.1:8040/media/tts/tts_legacy_001.mp3',
        duration_ms: 1600,
        byte_size: 256,
        provider_used: 'edge_tts',
        fallback_used: false,
        fallback_reason: null,
        generated_at: '2026-04-04T08:05:05Z',
      }));
    }
    if (requestUrl.includes('/api/session/sess_test_001/runtime-event')) {
      return Promise.resolve(jsonResponse({ accepted: true }, 202));
    }
    if (requestUrl.includes('/internal/affect/analyze')) {
      return Promise.resolve(jsonResponse(buildAffectPayload()));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  act(() => {
    socket.receive(buildEnvelope('dialogue.reply', {
      session_id: sessionPayload.session_id,
      trace_id: sessionPayload.trace_id,
      message_id: 'msg_legacy_reply_001',
      reply: 'legacy assistant reply',
      emotion: 'calm',
      risk_level: 'low',
      stage: 'engage',
      next_action: 'ask_followup',
      submitted_at: '2026-04-04T08:05:04Z',
    }, { source_service: 'orchestrator' }));
  });

  await waitFor(() => expect(fetch.mock.calls.some(
    ([url]) => String(url).includes('/internal/tts/synthesize-stream'),
  )).toBe(true));
  await waitFor(() => expect(fetch.mock.calls.some(
    ([url]) => String(url).includes('/internal/tts/synthesize')
      && !String(url).includes('/internal/tts/synthesize-stream'),
  )).toBe(true));
});

test('camera close hides the preview card, supports adjust reopen, and restores the default entry', async () => {
  jest.useFakeTimers();
  const { track } = installMockCameraEnvironment();
  fetch.mockImplementation((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/api/session/create')) {
      return Promise.resolve(jsonResponse(sessionPayload, 201));
    }
    if (requestUrl.includes('/video/frame')) {
      const count = fetch.mock.calls.filter(([nextUrl]) => String(nextUrl).includes('/video/frame')).length;
      return Promise.resolve(jsonResponse({
        media_id: `video_media_${count}`,
        created_at: `2026-03-16T08:00:0${count}Z`,
      }));
    }
    if (requestUrl.includes('/internal/affect/analyze')) {
      return Promise.resolve(jsonResponse(buildAffectPayload()));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  await openCameraModal();
  await waitFor(() => expect(screen.getByRole('button', { name: /关闭预览|turn off preview/i })).toBeInTheDocument());
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('/video/frame'))).toBe(true));
  await closeCameraModal();

  await waitFor(() => expect(screen.getAllByRole('button', { name: /调整设置|adjust settings/i })).toHaveLength(1));

  fireEvent.click(screen.getAllByRole('button', { name: /调整设置|adjust settings/i })[0]);
  await waitFor(() => expect(screen.getByRole('button', { name: /关闭预览|turn off preview/i })).toBeInTheDocument());
  await closeCameraModal();

  await act(async () => {
    jest.advanceTimersByTime(appConfig.videoFrameUploadIntervalMs + 5);
  });

  await act(async () => {
    fireEvent.click(screen.getAllByTitle(/取消|cancel/i)[0]);
  });

  await waitFor(() => expect(track.stop).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryAllByRole('button', { name: /调整设置|adjust settings/i })).toHaveLength(0));
  expect(screen.getAllByRole('button', { name: /摄像头预览|camera preview/i }).length).toBeGreaterThan(0);
});

test('camera preview keeps sending real frame blobs after switching to timeline view', async () => {
  jest.useFakeTimers();
  installMockCameraEnvironment();
  const videoFrameBodies = [];
  fetch.mockImplementation(async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/api/session/create')) {
      return jsonResponse(sessionPayload, 201);
    }
    if (requestUrl.includes('/video/frame')) {
      const count = fetch.mock.calls.filter(([nextUrl]) => String(nextUrl).includes('/video/frame')).length;
      const bodyText = options.body
        ? await new Response(options.body).text()
        : null;
      videoFrameBodies.push(bodyText);
      return jsonResponse({
        media_id: `video_media_${count}`,
        created_at: `2026-03-16T08:00:0${count}Z`,
      });
    }
    if (requestUrl.includes('/internal/affect/analyze')) {
      return jsonResponse(buildAffectPayload());
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  await openCameraModal();
  await waitFor(() => expect(screen.getByRole('button', { name: /关闭预览|turn off preview/i })).toBeInTheDocument());
  await waitFor(() => expect(videoFrameBodies.length).toBeGreaterThan(0));
  expect(videoFrameBodies[videoFrameBodies.length - 1]).toBe('frame');
  await closeCameraModal();

  const uploadsBeforeTimeline = videoFrameBodies.length;

  await openTimelineView();
  expect(screen.queryByText(/开始一段陪伴式对话|start a gentle conversation/i)).not.toBeInTheDocument();

  await act(async () => {
    jest.advanceTimersByTime(appConfig.videoFrameUploadIntervalMs + 5);
  });

  await waitFor(() => expect(videoFrameBodies.length).toBeGreaterThan(uploadsBeforeTimeline));
  expect(videoFrameBodies[videoFrameBodies.length - 1]).toBe('frame');
});

test('camera denial keeps the default entry and does not upload frames', async () => {
  installMockCameraEnvironment({
    getUserMedia: jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
  });

  render(<App appConfig={appConfig} />);
  await openCameraModal();

  await waitFor(() => expect(screen.getAllByText(/无法访问摄像头|cannot access camera/i).length).toBeGreaterThan(0));
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/video/frame'))).toBe(false);
  expect(screen.queryAllByRole('button', { name: /调整设置|adjust settings/i })).toHaveLength(0);
});

test('camera preview stays local-only without a session and can reopen after close', async () => {
  const { getUserMedia, track } = installMockCameraEnvironment();

  render(<App appConfig={appConfig} />);
  await openCameraModal();

  await waitFor(() => expect(screen.getByRole('button', { name: /关闭预览|turn off preview/i })).toBeInTheDocument());
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/video/frame'))).toBe(false);
  await closeCameraModal();

  await waitFor(() => expect(screen.getAllByRole('button', { name: /调整设置|adjust settings/i })).toHaveLength(1));

  await act(async () => {
    fireEvent.click(screen.getAllByTitle(/取消|cancel/i)[0]);
  });

  await waitFor(() => expect(track.stop).toHaveBeenCalled());
  await waitFor(() => expect(screen.getAllByRole('button', { name: /摄像头预览|camera preview/i }).length).toBeGreaterThan(0));

  await openCameraModal();
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole('button', { name: /关闭预览|turn off preview/i })).toBeInTheDocument());
});

test('upper mic button streams local mic debug transcript without submitting a conversation turn', async () => {
  const getUserMedia = jest.fn().mockResolvedValue({
    getTracks: () => [{ stop: jest.fn() }],
  });
  const mediaRecorderListeners = new Map();
  const mediaRecorderStop = jest.fn(() => {
    mediaRecorder.state = 'inactive';
    mediaRecorderListeners.get('dataavailable')?.({ data: new Blob(['audio-final'], { type: 'audio/webm' }) });
    mediaRecorderListeners.get('stop')?.();
  });
  const mediaRecorder = {
    state: 'inactive',
    start: jest.fn(() => {
      mediaRecorder.state = 'recording';
    }),
    stop: mediaRecorderStop,
    addEventListener: jest.fn((type, listener) => {
      mediaRecorderListeners.set(type, listener);
    }),
  };

  setMediaDevices({ getUserMedia });
  window.MediaRecorder = jest.fn(() => mediaRecorder);
  let latestDebugRecordingId = null;
  fetch.mockImplementation((url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/internal/affect/analyze')) {
      return Promise.resolve(jsonResponse(buildAffectPayload()));
    }
    if (requestUrl.includes('/api/asr/stream/preview')) {
      const requestObject = new URL(requestUrl);
      const previewSeq = requestObject.searchParams.get('preview_seq');
      latestDebugRecordingId = requestObject.searchParams.get('recording_id');
      return Promise.resolve(jsonResponse({
        request_id: `asr_preview_${previewSeq}`,
        session_id: 'mic_debug',
        recording_id: latestDebugRecordingId,
        preview_seq: Number(previewSeq),
        provider: 'dashscope',
        model: 'qwen3-asr-flash',
        transcript_text: previewSeq === '1' ? '测试中' : '测试麦克风转写成功',
        transcript_language: 'zh',
        duration_ms: 500,
        confidence_mean: previewSeq === '1' ? 0.71 : 0.93,
        confidence_available: true,
        audio: {
          filename: 'mic-debug.webm',
          content_type: 'audio/webm',
          byte_size: 128,
        },
        generated_at: `2026-03-19T09:00:0${previewSeq}Z`,
        stream_created: previewSeq === '1',
        stream_updated_at: `2026-03-19T09:00:0${previewSeq}Z`,
      }));
    }
    if (requestUrl.includes('/api/asr/stream/release')) {
      const requestObject = new URL(requestUrl);
      return Promise.resolve(jsonResponse({
        request_id: 'asr_stream_release_001',
        session_id: 'mic_debug',
        recording_id: requestObject.searchParams.get('recording_id'),
        released: true,
        reason: 'released',
        released_at: '2026-03-19T09:00:03Z',
      }));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  await openMicTestModal();

  expect(screen.getByText(/这里只用于调试麦克风，不会发送成一轮对话|microphone debugging only/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /开始测试|start test/i }));

  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole('button', { name: /结束测试|stop test/i })).toBeInTheDocument());
  act(() => {
    mediaRecorderListeners.get('dataavailable')?.({ data: new Blob(['audio-preview-1'], { type: 'audio/webm' }) });
    mediaRecorderListeners.get('dataavailable')?.({ data: new Blob(['audio-preview-2'], { type: 'audio/webm' }) });
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/asr/stream/preview'),
    expect.objectContaining({ method: 'POST' }),
  ));
  await waitFor(() => expect(screen.getByText('测试中')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /结束测试|stop test/i }));

  await waitFor(() => expect(mediaRecorderStop).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByText('测试麦克风转写成功')).toBeInTheDocument());
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/asr/stream/release'),
    expect.objectContaining({ method: 'POST' }),
  ));
  expect(screen.queryByText('...')).not.toBeInTheDocument();
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/asr/transcribe'))).toBe(false);
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/session/') && String(url).includes('/audio/'))).toBe(false);
  expect(screen.getByText(/这里只用于调试麦克风，不会发送成一轮对话|microphone debugging only/i)).toBeInTheDocument();
  expect(screen.queryByText(/^对话记录$|^Conversation$/i)).not.toBeInTheDocument();
  expect(screen.queryAllByText('测试麦克风转写成功')).toHaveLength(1);
  expect(fetch.mock.calls.filter(([url]) => String(url).includes('/api/asr/stream/preview')).length).toBeGreaterThanOrEqual(2);
  expect(fetch.mock.calls.some(([url, options]) => String(url).includes('/api/asr/stream/release') && options?.method === 'POST')).toBe(true);
  expect(latestDebugRecordingId).toBeTruthy();
});

test('upper mic button keeps the last meaningful transcript when the final preview only returns punctuation', async () => {
  const getUserMedia = jest.fn().mockResolvedValue({
    getTracks: () => [{ stop: jest.fn() }],
  });
  const mediaRecorderListeners = new Map();
  const mediaRecorderStop = jest.fn(() => {
    mediaRecorder.state = 'inactive';
    mediaRecorderListeners.get('dataavailable')?.({ data: new Blob(['audio-final'], { type: 'audio/webm' }) });
    mediaRecorderListeners.get('stop')?.();
  });
  const mediaRecorder = {
    state: 'inactive',
    start: jest.fn(() => {
      mediaRecorder.state = 'recording';
    }),
    stop: mediaRecorderStop,
    addEventListener: jest.fn((type, listener) => {
      mediaRecorderListeners.set(type, listener);
    }),
  };

  setMediaDevices({ getUserMedia });
  window.MediaRecorder = jest.fn(() => mediaRecorder);
  fetch.mockImplementation((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/internal/affect/analyze')) {
      return Promise.resolve(jsonResponse(buildAffectPayload()));
    }
    if (requestUrl.includes('/api/asr/stream/preview')) {
      const requestObject = new URL(requestUrl);
      const previewSeq = requestObject.searchParams.get('preview_seq');
      return Promise.resolve(jsonResponse({
        request_id: `asr_preview_keep_text_${previewSeq}`,
        session_id: 'mic_debug',
        recording_id: requestObject.searchParams.get('recording_id'),
        preview_seq: Number(previewSeq),
        provider: 'dashscope',
        model: 'qwen3-asr-flash',
        transcript_text: previewSeq === '1' ? '测试麦克风转写成功' : '。',
        transcript_language: 'zh',
        duration_ms: 500,
        confidence_mean: previewSeq === '1' ? 0.93 : 0.12,
        confidence_available: true,
        audio: {
          filename: 'mic-debug.webm',
          content_type: 'audio/webm',
          byte_size: 128,
        },
        generated_at: `2026-03-19T09:10:0${previewSeq}Z`,
        stream_created: previewSeq === '1',
        stream_updated_at: `2026-03-19T09:10:0${previewSeq}Z`,
      }));
    }
    if (requestUrl.includes('/api/asr/stream/release')) {
      return Promise.resolve(jsonResponse({
        request_id: 'asr_stream_release_002',
        session_id: 'mic_debug',
        recording_id: new URL(requestUrl).searchParams.get('recording_id'),
        released: true,
        reason: 'released',
        released_at: '2026-03-19T09:10:03Z',
      }));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  await openMicTestModal();

  fireEvent.click(screen.getByRole('button', { name: /开始测试|start test/i }));

  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole('button', { name: /结束测试|stop test/i })).toBeInTheDocument());
  act(() => {
    mediaRecorderListeners.get('dataavailable')?.({ data: new Blob(['audio-preview-1'], { type: 'audio/webm' }) });
    mediaRecorderListeners.get('dataavailable')?.({ data: new Blob(['audio-preview-2'], { type: 'audio/webm' }) });
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/asr/stream/preview'),
    expect.objectContaining({ method: 'POST' }),
  ));

  fireEvent.click(screen.getByRole('button', { name: /结束测试|stop test/i }));

  await waitFor(() => expect(mediaRecorderStop).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByText('测试麦克风转写成功')).toBeInTheDocument());
  expect(screen.queryByText(/^。$|^\.$/)).not.toBeInTheDocument();
});

test('affect panel shows calm default copy before any affect input arrives', () => {
  render(<App appConfig={appConfig} />);

  expect(screen.getByText(/当前情绪感知|current emotion/i)).toBeInTheDocument();
  expect(screen.getByText(/放松|relaxed/i)).toBeInTheDocument();
  expect(screen.getByText(/呼吸平稳，状态舒适|steady breathing, comfortable/i)).toBeInTheDocument();
  expect(screen.getByText(/感觉到您现在的状态很不错|I feel that you are in a good state/i)).toBeInTheDocument();
  expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/waiting/i)).not.toBeInTheDocument();
});

test('affect panel hides placeholder affect-service labels and sample-note debug text', async () => {
  const socket = await createConnectedSession();

  act(() => {
    socket.receive(buildEnvelope('affect.snapshot', buildAffectPayload({
      source_context: {
        note: 'Waiting for session sample information.',
      },
      fusion_result: {
        emotion_state: 'pending_multimodal',
        detail: '三路结果仍以占位为主，等待后续步骤接入真实分析。',
      },
    }), { source_service: 'affect_service' }));
  });

  await waitFor(() => expect(screen.getByText(/当前情绪感知|current emotion/i)).toBeInTheDocument());
  expect(screen.getByText(/放松|relaxed/i)).toBeInTheDocument();
  expect(screen.getByText(/呼吸平稳，状态舒适|steady breathing, comfortable/i)).toBeInTheDocument();
  expect(screen.getByText(/感觉到您现在的状态很不错|I feel that you are in a good state/i)).toBeInTheDocument();
  expect(screen.queryByText(/pending_multimodal/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/waiting for session sample information/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/三路结果仍以占位为主，等待后续步骤接入真实分析/)).not.toBeInTheDocument();
});
