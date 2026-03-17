import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

const originalMediaDevices = navigator.mediaDevices;
const originalMediaRecorder = window.MediaRecorder;
const originalMediaPlay = window.HTMLMediaElement.prototype.play;
const originalMediaPause = window.HTMLMediaElement.prototype.pause;
const originalMediaLoad = window.HTMLMediaElement.prototype.load;

const appConfig = {
  apiBaseUrl: 'http://127.0.0.1:8000',
  wsUrl: 'ws://127.0.0.1:8000/ws',
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

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
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

  serverClose(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', { code, reason });
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

async function flushAsyncUpdates() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

class MockMediaRecorder {
  static instances = [];

  constructor(stream) {
    this.stream = stream;
    this.state = 'inactive';
    this.timeslice = null;
    this.listeners = new Map();
    MockMediaRecorder.instances.push(this);
  }

  static reset() {
    MockMediaRecorder.instances = [];
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

  start(timeslice) {
    this.state = 'recording';
    this.timeslice = timeslice;
  }

  stop() {
    if (this.state !== 'recording') {
      return;
    }
    this.state = 'inactive';
    this.emit('dataavailable', {
      data: new Blob(['final-audio'], { type: 'audio/webm' }),
    });
    this.emit('stop', {});
  }

  emitChunk(label = 'audio-chunk', type = 'audio/webm') {
    this.emit('dataavailable', {
      data: new Blob([label], { type }),
    });
  }

  emitError(message = 'Recording failed.') {
    this.state = 'inactive';
    this.emit('error', { error: new Error(message) });
  }
}

function getStateCalls() {
  return global.fetch.mock.calls.filter(([url]) => String(url).includes('/state'));
}

function getTextSubmitButton() {
  return screen.getByTitle(/发送文本|send text/i);
}

function getMicButton() {
  return screen.getByTitle(/start recording|stop recording/i);
}

function setMediaDevices(value) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value,
  });
}

function setMediaRecorder(value) {
  Object.defineProperty(window, 'MediaRecorder', {
    configurable: true,
    writable: true,
    value,
  });
  global.MediaRecorder = value;
}

function installMockAudioEnvironment(options = {}) {
  const track = { stop: jest.fn() };
  const stream = {
    getTracks: () => [track],
  };
  const getUserMedia = options.getUserMedia || jest.fn().mockResolvedValue(stream);
  const MediaRecorderImpl = Object.prototype.hasOwnProperty.call(options, 'MediaRecorder')
    ? options.MediaRecorder
    : MockMediaRecorder;
  setMediaDevices({ getUserMedia });
  setMediaRecorder(MediaRecorderImpl);
  MockMediaRecorder.reset();
  return { getUserMedia, stream, track };
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
  return { getUserMedia, stream, track };
}

function installAudioFetchMock(options = {}) {
  let chunkCount = 0;
  let previewCount = 0;
  let finalizeCount = 0;

  fetch.mockImplementation((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/audio/chunk')) {
      chunkCount += 1;
      if (typeof options.onChunk === 'function') {
        return Promise.resolve(options.onChunk(requestUrl, chunkCount));
      }
      return Promise.resolve(jsonResponse({
        media_id: `media_${chunkCount}`,
        created_at: `2026-03-16T08:00:0${chunkCount}Z`,
      }, 200));
    }
    if (requestUrl.includes('/audio/preview')) {
      previewCount += 1;
      if (typeof options.onPreview === 'function') {
        return Promise.resolve(options.onPreview(requestUrl, previewCount));
      }
      return Promise.resolve(jsonResponse({ preview_id: `preview_${previewCount}` }, 202));
    }
    if (requestUrl.includes('/audio/finalize')) {
      finalizeCount += 1;
      if (typeof options.onFinalize === 'function') {
        return Promise.resolve(options.onFinalize(requestUrl, finalizeCount));
      }
      return Promise.resolve(jsonResponse({ message_id: `msg_audio_${finalizeCount}` }, 202));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });
}

function findFetchUrl(fragment) {
  const match = fetch.mock.calls.find(([url]) => String(url).includes(fragment));
  return match ? String(match[0]) : null;
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function installMockAssistantAudio(options = {}) {
  const play = options.playImplementation || jest.fn().mockResolvedValue(undefined);
  const pause = options.pauseImplementation || jest.fn();
  const load = options.loadImplementation || jest.fn();

  window.HTMLMediaElement.prototype.play = play;
  window.HTMLMediaElement.prototype.pause = pause;
  window.HTMLMediaElement.prototype.load = load;

  return { play, pause, load };
}

function getAssistantAudioElement() {
  const element = document.querySelector('audio');
  expect(element).not.toBeNull();
  return element;
}

function getCardValue(label) {
  const labelElement = screen.getByText(label);
  const valueElement = labelElement.nextElementSibling;
  expect(valueElement).not.toBeNull();
  return valueElement.textContent;
}

function installPhaseFFetchMock(options = {}) {
  const runtimeEvents = [];
  const createBodies = [];
  const ttsBodies = [];

  fetch.mockImplementation((url, requestOptions = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/api/session/create')) {
      const parsedBody = requestOptions.body ? JSON.parse(requestOptions.body) : {};
      createBodies.push(parsedBody);
      return Promise.resolve(jsonResponse({
        ...sessionPayload,
        avatar_id: parsedBody.avatar_id || options.sessionAvatarId || sessionPayload.avatar_id,
      }, 201));
    }
    if (requestUrl.includes('/internal/affect/analyze')) {
      return Promise.resolve(jsonResponse(buildAffectPayload(options.affectPayload || {})));
    }
    if (requestUrl.includes('/internal/tts/synthesize')) {
      const parsedBody = requestOptions.body ? JSON.parse(requestOptions.body) : {};
      ttsBodies.push(parsedBody);
      return Promise.resolve(jsonResponse({
        tts_id: options.ttsId || 'tts_mock_001',
        session_id: parsedBody.session_id || sessionPayload.session_id,
        trace_id: parsedBody.trace_id || sessionPayload.trace_id,
        message_id: parsedBody.message_id || 'msg_assistant_phase_f',
        voice_id: options.ttsVoiceId || (parsedBody.voice_id === 'coach_male_01' ? 'zh-CN-YunxiNeural' : 'zh-CN-XiaoxiaoNeural'),
        subtitle: parsedBody.subtitle || parsedBody.text || '',
        audio_format: options.audioFormat || 'audio/mpeg',
        audio_url: options.audioUrl || 'http://127.0.0.1:8040/media/tts/tts_mock_001.mp3',
        duration_ms: options.durationMs || 1600,
        byte_size: 2048,
        provider_used: 'mock_provider',
        fallback_used: false,
        fallback_reason: null,
        generated_at: '2026-03-16T08:00:06Z',
      }, 200));
    }
    if (requestUrl.includes('/runtime-event')) {
      const parsedBody = requestOptions.body ? JSON.parse(requestOptions.body) : {};
      runtimeEvents.push(parsedBody);
      return Promise.resolve(jsonResponse({ accepted: true }, 202));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  return { runtimeEvents, createBodies, ttsBodies };
}

async function createPhaseFSession(config = appConfig) {
  render(<App appConfig={config} />);
  const socket = await clickCreateSession();
  await openSocket(socket);
  return socket;
}

function emitDialogueReply(socket, overrides = {}) {
  const payload = {
    session_id: sessionPayload.session_id,
    trace_id: sessionPayload.trace_id,
    message_id: 'msg_assistant_phase_f',
    reply: '慢一点说，我们先把现在最难受的部分说出来。',
    emotion: 'anxious',
    risk_level: 'medium',
    stage: 'assess',
    next_action: 'ask_followup',
    submitted_at: '2026-03-16T08:00:05Z',
    ...overrides,
  };

  act(() => {
    socket.receive(buildEnvelope('dialogue.reply', payload, { source_service: 'orchestrator' }));
  });

  return payload;
}

function emitAffectSnapshot(socket, overrides = {}) {
  act(() => {
    socket.receive(buildEnvelope('affect.snapshot', buildAffectPayload(overrides)));
  });
}

function buildRuntimeEventTypeList(runtimeEvents) {
  return runtimeEvents.map((event) => event.event_type);
}

function buildRuntimeEventsByType(runtimeEvents, eventType) {
  return runtimeEvents.filter((event) => event.event_type === eventType);
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

async function openCameraModal() {
  const trigger = screen.getByText('摄像头调试').closest('button');
  expect(trigger).not.toBeNull();
  await act(async () => {
    fireEvent.click(trigger);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  MockWebSocket.reset();
  MockMediaRecorder.reset();
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
  setMediaRecorder(originalMediaRecorder);
  window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = jest.fn();
  window.HTMLMediaElement.prototype.load = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  setMediaDevices(originalMediaDevices);
  setMediaRecorder(originalMediaRecorder);
  window.HTMLMediaElement.prototype.play = originalMediaPlay;
  window.HTMLMediaElement.prototype.pause = originalMediaPause;
  window.HTMLMediaElement.prototype.load = originalMediaLoad;
});

test('renders runtime config compatibility baseline', () => {
  render(<App appConfig={appConfig} />);
  expect(screen.getByText(/runtime config compatibility baseline/i)).toBeInTheDocument();
  expect(screen.getByText('http://127.0.0.1:8000')).toBeInTheDocument();
  expect(screen.getByText('ws://127.0.0.1:8000/ws')).toBeInTheDocument();
});

test('renders phase c ws-first copy', () => {
  render(<App appConfig={appConfig} />);
  expect(screen.getByText('Phase C 实时会话基线')).toBeInTheDocument();
  expect(screen.getByText(/WS-first session create \/ restore \/ text submit/i)).toBeInTheDocument();
  expect(screen.getByText(/WS-first 文本流程/)).toBeInTheDocument();
  expect(screen.queryByText(/Phase B/i)).not.toBeInTheDocument();
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

test('restore session hydrates history and connects websocket', async () => {
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

  expect(latestSocket().url).toBe(
    'ws://127.0.0.1:8000/ws/session/sess_test_001?trace_id=trace_test_001',
  );
});

test('submit text keeps the happy path ws-first and does not call /state after POST /text', async () => {
  fetch.mockImplementation((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/api/session/create')) {
      return Promise.resolve(jsonResponse(sessionPayload, 201));
    }
    if (requestUrl.includes('/api/session/sess_test_001/text')) {
      return Promise.resolve(jsonResponse({
        message_id: 'msg_user_001',
        session_id: sessionPayload.session_id,
        trace_id: sessionPayload.trace_id,
        role: 'user',
        status: 'accepted',
        source_kind: 'text',
        content_text: 'hello realtime',
        submitted_at: '2026-03-16T08:00:04Z',
        client_seq: 1,
      }, 202));
    }
    if (requestUrl.includes('/internal/affect/analyze')) {
      return Promise.resolve(jsonResponse(buildAffectPayload()));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  fireEvent.change(
    screen.getByPlaceholderText(/轻轻敲下您的心声|type your thoughts here/i),
    { target: { value: 'hello realtime' } },
  );
  await act(async () => {
    fireEvent.click(getTextSubmitButton());
  });

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:8000/api/session/sess_test_001/text',
    expect.any(Object),
  ));
  expect(getStateCalls()).toHaveLength(0);

  const acceptedEnvelope = buildEnvelope('message.accepted', {
    ...buildMessage({
      message_id: 'msg_user_001',
      content_text: 'hello realtime',
      submitted_at: '2026-03-16T08:00:04Z',
      metadata: { client_seq: 1 },
    }),
  });
  const replyEnvelope = buildEnvelope('dialogue.reply', {
    session_id: sessionPayload.session_id,
    trace_id: sessionPayload.trace_id,
    message_id: 'msg_assistant_001',
    reply: 'assistant via realtime',
    emotion: 'calm',
    risk_level: 'low',
    stage: 'assess',
    next_action: 'ask_followup',
    submitted_at: '2026-03-16T08:00:05Z',
  }, { source_service: 'orchestrator' });

  act(() => {
    socket.receive(acceptedEnvelope);
    socket.receive(replyEnvelope);
  });

  await waitFor(() => expect(screen.getAllByText('assistant via realtime').length).toBeGreaterThan(0));
  expect(screen.getByText('received')).toBeInTheDocument();
  expect(getStateCalls()).toHaveLength(0);
});

test('restore failure clears localStorage and visible session identity', async () => {
  window.localStorage.setItem(appConfig.activeSessionStorageKey, sessionPayload.session_id);
  fetch.mockRejectedValueOnce(new Error('restore failed'));

  render(<App appConfig={appConfig} />);

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/session/sess_test_001/state'),
    expect.any(Object),
  ));
  await waitFor(() => expect(window.localStorage.getItem(appConfig.activeSessionStorageKey)).toBeNull());

  expect(MockWebSocket.instances).toHaveLength(0);
  expect(screen.getByText('restore failed')).toBeInTheDocument();
  expect(screen.getByText('未创建')).toBeInTheDocument();
  expect(screen.queryByText(sessionPayload.trace_id)).not.toBeInTheDocument();
  expect(screen.getByText(/当前没有本地缓存的会话/)).toBeInTheDocument();
});

test('terminal websocket close clears local session identity immediately and does not reconnect', async () => {
  jest.useFakeTimers();
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  expect(window.localStorage.getItem(appConfig.activeSessionStorageKey)).toBe(sessionPayload.session_id);

  act(() => {
    socket.serverClose(4404, 'session_not_found');
  });

  await waitFor(() => expect(window.localStorage.getItem(appConfig.activeSessionStorageKey)).toBeNull());
  await waitFor(() => expect(screen.getByText('realtime: closed')).toBeInTheDocument());

  expect(screen.getByText('未创建')).toBeInTheDocument();
  expect(screen.queryByText(sessionPayload.trace_id)).not.toBeInTheDocument();
  expect(screen.getAllByText('session_not_found').length).toBeGreaterThan(0);

  act(() => {
    jest.advanceTimersByTime(appConfig.reconnectDelayMs);
  });

  expect(MockWebSocket.instances).toHaveLength(1);
  expect(screen.queryByText('realtime: reconnecting')).not.toBeInTheDocument();
});

test('reconnect during awaiting_ack performs one-shot /state recovery only', async () => {
  jest.useFakeTimers();
  fetch.mockImplementation((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/api/session/create')) {
      return Promise.resolve(jsonResponse(sessionPayload, 201));
    }
    if (requestUrl.includes('/api/session/sess_test_001/text')) {
      return Promise.resolve(jsonResponse({
        message_id: 'msg_user_001',
        session_id: sessionPayload.session_id,
        trace_id: sessionPayload.trace_id,
        role: 'user',
        status: 'accepted',
        source_kind: 'text',
        content_text: 'ack recovery',
        submitted_at: '2026-03-16T08:00:04Z',
        client_seq: 1,
      }, 202));
    }
    if (requestUrl.includes('/api/session/sess_test_001/state')) {
      return Promise.resolve(jsonResponse(buildSessionState({
        session: { ...sessionPayload, status: 'active' },
        messages: [],
      })));
    }
    if (requestUrl.includes('/internal/affect/analyze')) {
      return Promise.resolve(jsonResponse(buildAffectPayload()));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  fireEvent.change(
    screen.getByPlaceholderText(/轻轻敲下您的心声|type your thoughts here/i),
    { target: { value: 'ack recovery' } },
  );
  await act(async () => {
    fireEvent.click(getTextSubmitButton());
  });

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:8000/api/session/sess_test_001/text',
    expect.any(Object),
  ));
  await waitFor(() => expect(screen.getByText('awaiting_ack')).toBeInTheDocument());

  act(() => {
    socket.serverClose(1011, 'server_restart');
  });
  await waitFor(() => expect(screen.getByText('realtime: reconnecting')).toBeInTheDocument());

  act(() => {
    jest.advanceTimersByTime(appConfig.reconnectDelayMs);
  });

  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2));
  const reconnectSocket = latestSocket();
  await openSocket(reconnectSocket);

  act(() => {
    reconnectSocket.receive(buildEnvelope('session.connection.ready', {
      connection_status: 'connected',
      heartbeat_interval_ms: 200,
      reconnectable: true,
    }));
  });

  await flushAsyncUpdates();
  await waitFor(() => expect(getStateCalls()).toHaveLength(1));
  expect(screen.getByText('ready')).toBeInTheDocument();

  act(() => {
    reconnectSocket.receive(buildEnvelope('session.connection.ready', {
      connection_status: 'connected',
      heartbeat_interval_ms: 200,
      reconnectable: true,
    }));
  });

  await flushAsyncUpdates();
  await waitFor(() => expect(getStateCalls()).toHaveLength(1));
});

test('reconnect during awaiting_reply performs one-shot /state recovery only', async () => {
  jest.useFakeTimers();
  fetch.mockImplementation((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/api/session/create')) {
      return Promise.resolve(jsonResponse(sessionPayload, 201));
    }
    if (requestUrl.includes('/api/session/sess_test_001/text')) {
      return Promise.resolve(jsonResponse({
        message_id: 'msg_user_002',
        session_id: sessionPayload.session_id,
        trace_id: sessionPayload.trace_id,
        role: 'user',
        status: 'accepted',
        source_kind: 'text',
        content_text: 'reply recovery',
        submitted_at: '2026-03-16T08:00:04Z',
        client_seq: 1,
      }, 202));
    }
    if (requestUrl.includes('/api/session/sess_test_001/state')) {
      return Promise.resolve(jsonResponse(buildSessionState({
        session: {
          ...sessionPayload,
          status: 'active',
          stage: 'assess',
          updated_at: '2026-03-16T08:00:05Z',
        },
        messages: [
          buildMessage({
            message_id: 'msg_user_002',
            content_text: 'reply recovery',
            submitted_at: '2026-03-16T08:00:04Z',
          }),
          buildMessage({
            message_id: 'msg_assistant_002',
            role: 'assistant',
            status: 'completed',
            content_text: 'assistant from state recovery',
            submitted_at: '2026-03-16T08:00:05Z',
            metadata: {
              stage: 'assess',
              emotion: 'calm',
              risk_level: 'low',
              next_action: 'ask_followup',
            },
          }),
        ],
      })));
    }
    if (requestUrl.includes('/internal/affect/analyze')) {
      return Promise.resolve(jsonResponse(buildAffectPayload()));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  fireEvent.change(
    screen.getByPlaceholderText(/轻轻敲下您的心声|type your thoughts here/i),
    { target: { value: 'reply recovery' } },
  );
  await act(async () => {
    fireEvent.click(getTextSubmitButton());
  });

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:8000/api/session/sess_test_001/text',
    expect.any(Object),
  ));

  act(() => {
    socket.receive(buildEnvelope('message.accepted', {
      ...buildMessage({
        message_id: 'msg_user_002',
        content_text: 'reply recovery',
        submitted_at: '2026-03-16T08:00:04Z',
      }),
    }));
  });

  await waitFor(() => expect(screen.getByText('awaiting_reply')).toBeInTheDocument());

  act(() => {
    socket.serverClose(1011, 'server_restart');
  });
  await waitFor(() => expect(screen.getByText('realtime: reconnecting')).toBeInTheDocument());

  act(() => {
    jest.advanceTimersByTime(appConfig.reconnectDelayMs);
  });

  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2));
  const reconnectSocket = latestSocket();
  await openSocket(reconnectSocket);

  act(() => {
    reconnectSocket.receive(buildEnvelope('session.connection.ready', {
      connection_status: 'connected',
      heartbeat_interval_ms: 200,
      reconnectable: true,
    }));
  });

  await flushAsyncUpdates();
  await waitFor(() => expect(getStateCalls()).toHaveLength(1));
  await waitFor(() => expect(screen.getAllByText('assistant from state recovery').length).toBeGreaterThan(0));
  expect(screen.getByText('received')).toBeInTheDocument();

  act(() => {
    reconnectSocket.receive(buildEnvelope('session.connection.ready', {
      connection_status: 'connected',
      heartbeat_interval_ms: 200,
      reconnectable: true,
    }));
  });

  await flushAsyncUpdates();
  await waitFor(() => expect(getStateCalls()).toHaveLength(1));
});

test('transcript realtime events update the transcript panel', async () => {
  const socket = await createConnectedSession();

  act(() => {
    socket.receive(buildEnvelope('transcript.partial', {
      transcript_kind: 'partial',
      text: 'partial realtime text',
      preview_seq: 2,
      recording_id: 'rec_001',
      generated_at: '2026-03-16T08:00:03Z',
      language: 'zh-CN',
      confidence: 0.62,
    }));
  });

  await waitFor(() => expect(screen.getByText('streaming')).toBeInTheDocument());
  expect(screen.getAllByText('partial realtime text').length).toBeGreaterThan(0);
  expect(screen.getByText('partial transcript 2')).toBeInTheDocument();

  act(() => {
    socket.receive(buildEnvelope('transcript.final', {
      transcript_kind: 'final',
      text: 'final realtime text',
      message_id: 'msg_audio_001',
      source_kind: 'audio',
      recording_id: 'rec_001',
      generated_at: '2026-03-16T08:00:04Z',
      language: 'zh-CN',
      confidence: 0.91,
    }));
  });

  await waitFor(() => expect(screen.getAllByText('final realtime text').length).toBeGreaterThan(0));
  expect(screen.queryByText('partial realtime text')).not.toBeInTheDocument();
  expect(screen.getByText('final transcript received')).toBeInTheDocument();
  expect(screen.getByText('final confidence: 91%')).toBeInTheDocument();
});

test('affect snapshot updates the emotion card and live timeline', async () => {
  const socket = await createConnectedSession();

  act(() => {
    socket.receive(buildEnvelope('affect.snapshot', buildAffectPayload()));
  });

  await waitFor(() => expect(screen.getAllByText('grounded').length).toBeGreaterThan(0));
  expect(screen.getAllByText('fusion grounded detail').length).toBeGreaterThan(0);
  expect(screen.getByText('medium / 82%')).toBeInTheDocument();
  expect(screen.getByText('realtime / emotion_app_live / record_123')).toBeInTheDocument();
  expect(screen.getByText('2026-03-16T08:00:06Z')).toBeInTheDocument();
  expect(screen.getByText('affect snapshot received')).toBeInTheDocument();
});

test('camera preview uploads frames and finalizes completed state', async () => {
  jest.useFakeTimers();
  const { track } = installMockCameraEnvironment();
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));
  fetch.mockImplementation((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/video/frame')) {
      const count = fetch.mock.calls.filter(([nextUrl]) => String(nextUrl).includes('/video/frame')).length;
      return Promise.resolve(jsonResponse({
        media_id: `video_media_${count}`,
        created_at: `2026-03-16T08:00:0${count}Z`,
      }));
    }
    if (requestUrl.includes('/internal/affect/analyze')) {
      return Promise.resolve(jsonResponse(buildAffectPayload({
        source_context: { origin: 'direct', dataset: 'affect_refresh', record_id: 'affect_001', note: 'refresh after camera' },
        video_result: { label: 'present', detail: 'video lane from refresh' },
      })));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  await openCameraModal();
  await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'user' }, audio: false }));
  await waitFor(() => expect(screen.getByText(/preview:\s*previewing/i)).toBeInTheDocument());
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('/video/frame'))).toBe(true));

  const frameUrls = fetch.mock.calls.filter(([url]) => String(url).includes('/video/frame')).map(([url]) => String(url));
  expect(frameUrls[0]).toContain('frame_seq=1');

  await act(async () => {
    jest.advanceTimersByTime(appConfig.videoFrameUploadIntervalMs + 5);
  });
  await flushAsyncUpdates();

  const updatedFrameUrls = fetch.mock.calls.filter(([url]) => String(url).includes('/video/frame')).map(([url]) => String(url));
  expect(updatedFrameUrls.length).toBeGreaterThan(1);
  expect(updatedFrameUrls[1]).toContain('frame_seq=2');

  await waitFor(() => expect(screen.getByText(/frames: 2 \/ last media: video_media_2/i)).toBeInTheDocument());

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /stop preview/i }));
  });

  await waitFor(() => expect(track.stop).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByRole('button', { name: /stop preview/i })).not.toBeInTheDocument());
  expect(screen.getByText(/Video frame upload complete\. Uploaded 2 frames\./i)).toBeInTheDocument();
});

test('camera denial keeps upload idle and shows denied state', async () => {
  installMockCameraEnvironment({
    getUserMedia: jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
  });

  render(<App appConfig={appConfig} />);
  await openCameraModal();

  await waitFor(() => expect(screen.getByText(/permission:\s*denied/i)).toBeInTheDocument());
  expect(screen.getAllByText('Camera permission was denied.').length).toBeGreaterThan(0);
  expect(screen.getByText(/preview:\s*error/i)).toBeInTheDocument();
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/video/frame'))).toBe(false);
});

test('camera preview stays local-only without a session', async () => {
  jest.useFakeTimers();
  installMockCameraEnvironment();

  render(<App appConfig={appConfig} />);
  await openCameraModal();

  await waitFor(() => expect(screen.getByText(/preview:\s*previewing/i)).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText(/upload:\s*local_only/i)).toBeInTheDocument());
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/video/frame'))).toBe(false);
  expect(screen.getByText(/Camera preview is active locally without a session\./i)).toBeInTheDocument();
});

test('direct affect refresh moves panel from loading to ready and renders real lanes', async () => {
  jest.useFakeTimers();
  installMockCameraEnvironment();
  const affectDeferred = createDeferred();
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));
  fetch.mockImplementation((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/internal/affect/analyze')) {
      return affectDeferred.promise;
    }
    if (requestUrl.includes('/video/frame')) {
      return Promise.resolve(jsonResponse({ media_id: 'video_media_1', created_at: '2026-03-16T08:00:03Z' }));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('/internal/affect/analyze'))).toBe(true));
  expect(screen.getByText('loading')).toBeInTheDocument();
  expect(screen.getByText('Refreshing affect panel.')).toBeInTheDocument();

  await act(async () => {
    affectDeferred.resolve(jsonResponse(buildAffectPayload({
      source_context: {
        origin: 'direct_refresh',
        dataset: 'dataset_live',
        record_id: 'record_direct_001',
        note: 'source note from direct affect refresh',
      },
      text_result: { label: 'text lane label', detail: 'text lane detail' },
      audio_result: { label: 'audio lane label', detail: 'audio lane detail' },
      video_result: { label: 'video lane label', detail: 'video lane detail' },
      fusion_result: {
        emotion_state: 'supported',
        detail: 'fusion direct detail',
        conflict: true,
        conflict_reason: 'audio/video mismatch',
      },
    })));
  });

  await waitFor(() => expect(screen.getAllByText('supported').length).toBeGreaterThan(0));
  expect(screen.getByText(/panel\s*/i)).toBeInTheDocument();
  expect(screen.getByText('ready')).toBeInTheDocument();
  expect(screen.getAllByText('fusion direct detail').length).toBeGreaterThan(0);
  expect(screen.getByText('direct_refresh / dataset_live / record_direct_001')).toBeInTheDocument();
  expect(screen.getAllByText('source note from direct affect refresh').length).toBeGreaterThan(0);
  expect(screen.getByText('audio/video mismatch')).toBeInTheDocument();
  expect(screen.getByText('text lane label')).toBeInTheDocument();
  expect(screen.getByText('audio lane label')).toBeInTheDocument();
  expect(screen.getByText('video lane label')).toBeInTheDocument();
});

test('direct affect refresh surfaces error without dropping the previous snapshot', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));
  fetch.mockImplementation((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/internal/affect/analyze')) {
      return Promise.resolve(jsonResponse({ message: 'affect unavailable' }, 503));
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  await waitFor(() => expect(screen.getByText('error')).toBeInTheDocument());
  expect(screen.getAllByText('affect unavailable').length).toBeGreaterThan(0);
});

test('websocket affect snapshot stays newer than stale direct refresh errors', async () => {
  const affectDeferred = createDeferred();
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));
  fetch.mockImplementation((url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/internal/affect/analyze')) {
      return affectDeferred.promise;
    }
    throw new Error(`Unexpected fetch URL: ${requestUrl}`);
  });

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('/internal/affect/analyze'))).toBe(true));

  act(() => {
    socket.receive(buildEnvelope('affect.snapshot', buildAffectPayload({
      source_context: { origin: 'realtime', dataset: 'websocket', record_id: 'record_ws_001', note: 'fresh websocket snapshot' },
      fusion_result: { emotion_state: 'websocket-grounded', detail: 'fresh websocket detail' },
    })));
  });

  await waitFor(() => expect(screen.getAllByText('websocket-grounded').length).toBeGreaterThan(0));

  await act(async () => {
    affectDeferred.resolve(jsonResponse({ message: 'late refresh failure' }, 503));
  });
  await flushAsyncUpdates();

  expect(screen.getAllByText('websocket-grounded').length).toBeGreaterThan(0);
  expect(screen.getAllByText('fresh websocket detail').length).toBeGreaterThan(0);
  expect(screen.queryByText('late refresh failure')).not.toBeInTheDocument();
});

test('knowledge.retrieved updates retrieval summary and grounded refs from reply', async () => {
  const socket = await createConnectedSession();

  act(() => {
    socket.receive(buildEnvelope('knowledge.retrieved', {
      source_ids: ['kb_sleep_001', 'kb_anxiety_002'],
      grounded_refs: ['seed_ref'],
      filters_applied: ['risk:low', 'stage:assess'],
      candidate_count: 2,
      retrieval_attempted: true,
      retrieval_status: 'succeeded',
      risk_level: 'low',
      stage: 'assess',
      error_message: '',
    }));
  });

  await waitFor(() => expect(screen.getByText('kb_sleep_001, kb_anxiety_002')).toBeInTheDocument());
  expect(screen.getByText('status: succeeded')).toBeInTheDocument();
  expect(screen.getByText('filters: risk:low, stage:assess')).toBeInTheDocument();
  expect(screen.getByText('grounded refs: seed_ref')).toBeInTheDocument();
  expect(screen.getByText('knowledge retrieved: kb_sleep_001, kb_anxiety_002')).toBeInTheDocument();

  act(() => {
    socket.receive(buildEnvelope('dialogue.reply', {
      session_id: sessionPayload.session_id,
      trace_id: sessionPayload.trace_id,
      message_id: 'msg_assistant_knowledge',
      reply: 'assistant grounded reply',
      emotion: 'calm',
      risk_level: 'low',
      stage: 'assess',
      next_action: 'ask_followup',
      submitted_at: '2026-03-16T08:00:07Z',
      knowledge_refs: ['kb_sleep_001#card', 'kb_anxiety_002#card'],
    }, { source_service: 'orchestrator' }));
  });

  await waitFor(() => expect(screen.getAllByText('assistant grounded reply').length).toBeGreaterThan(0));
  expect(screen.getByText('grounded refs: kb_sleep_001#card, kb_anxiety_002#card')).toBeInTheDocument();
  expect(screen.getByText('received')).toBeInTheDocument();
});

test('session.error shows an error without removing existing messages', async () => {
  window.localStorage.setItem(appConfig.activeSessionStorageKey, sessionPayload.session_id);
  fetch.mockResolvedValueOnce(jsonResponse(buildSessionState({
    session: {
      ...sessionPayload,
      status: 'active',
      updated_at: '2026-03-16T08:00:10Z',
    },
    messages: [
      buildMessage({
        message_id: 'msg_user_existing',
        content_text: 'existing user message',
        submitted_at: '2026-03-16T08:00:08Z',
      }),
      buildMessage({
        message_id: 'msg_assistant_existing',
        role: 'assistant',
        status: 'completed',
        content_text: 'existing assistant reply',
        submitted_at: '2026-03-16T08:00:09Z',
        metadata: {
          stage: 'engage',
          emotion: 'calm',
          risk_level: 'low',
          next_action: 'listen',
        },
      }),
    ],
  })));

  render(<App appConfig={appConfig} />);

  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
  const socket = latestSocket();
  await openSocket(socket);

  act(() => {
    socket.receive(buildEnvelope('session.error', {
      error_code: 'dialogue_reply_failed',
      message: 'Dialogue pipeline failed',
      trace_id: sessionPayload.trace_id,
      session_id: sessionPayload.session_id,
      retryable: false,
    }));
  });

  expect(screen.getAllByText('Dialogue pipeline failed').length).toBeGreaterThan(0);
  expect(screen.getAllByText('existing user message').length).toBeGreaterThan(0);
  expect(screen.getAllByText('existing assistant reply').length).toBeGreaterThan(0);
});

test('audio recording uploads chunks, sends preview before finalize, and completes on realtime events', async () => {
  installMockAudioEnvironment();
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));
  installAudioFetchMock();

  render(<App appConfig={{ ...appConfig, enableAudioPreview: true, enableAudioFinalize: true, audioPreviewChunkThreshold: 2 }} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  await act(async () => {
    fireEvent.click(getMicButton());
  });

  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  expect(MockMediaRecorder.instances).toHaveLength(1);
  const recorder = MockMediaRecorder.instances[0];
  expect(recorder.timeslice).toBe(250);
  expect(screen.getByText('granted')).toBeInTheDocument();

  await act(async () => {
    recorder.emitChunk('chunk-1');
  });
  await flushAsyncUpdates();
  expect(findFetchUrl('/audio/chunk')).toContain('chunk_seq=1');
  expect(findFetchUrl('/audio/chunk')).toContain('is_final=false');

  await act(async () => {
    recorder.emitChunk('chunk-2');
  });
  await flushAsyncUpdates();
  expect(fetch.mock.calls.filter(([url]) => String(url).includes('/audio/chunk'))).toHaveLength(2);
  expect(fetch.mock.calls.filter(([url]) => String(url).includes('/audio/preview'))).toHaveLength(1);
  expect(findFetchUrl('/audio/preview')).toContain('preview_seq=1');

  act(() => {
    socket.receive(buildEnvelope('transcript.partial', {
      transcript_kind: 'partial',
      text: 'partial from audio',
      preview_seq: 1,
      recording_id: 'wrong_recording_id',
      generated_at: '2026-03-16T08:00:03Z',
      language: 'zh-CN',
      confidence: 0.62,
    }));
  });
  expect(screen.queryByText('partial from audio')).not.toBeInTheDocument();

  const activeRecordingId = screen.getByText(/audio runtime/i)
    ? MockMediaRecorder.instances[0]
    : null;
  expect(activeRecordingId).not.toBeNull();

  const previewUrl = fetch.mock.calls.find(([url]) => String(url).includes('/audio/preview'))?.[0];
  const recordingId = new URL(String(previewUrl)).searchParams.get('recording_id');
  expect(recordingId).toMatch(/^rec_/);

  act(() => {
    socket.receive(buildEnvelope('transcript.partial', {
      transcript_kind: 'partial',
      text: 'partial from audio',
      preview_seq: 1,
      recording_id: recordingId,
      generated_at: '2026-03-16T08:00:03Z',
      language: 'zh-CN',
      confidence: 0.62,
    }));
  });
  await waitFor(() => expect(screen.getAllByText('partial from audio').length).toBeGreaterThan(0));

  act(() => {
    socket.receive(buildEnvelope('transcript.partial', {
      transcript_kind: 'partial',
      text: 'stale partial',
      preview_seq: 0,
      recording_id: recordingId,
      generated_at: '2026-03-16T08:00:03Z',
      language: 'zh-CN',
      confidence: 0.4,
    }));
  });
  expect(screen.queryByText('stale partial')).not.toBeInTheDocument();

  await act(async () => {
    fireEvent.click(getMicButton());
  });
  await flushAsyncUpdates();

  const chunkUrls = fetch.mock.calls.filter(([url]) => String(url).includes('/audio/chunk')).map(([url]) => String(url));
  expect(chunkUrls).toHaveLength(3);
  expect(chunkUrls[2]).toContain('chunk_seq=3');
  expect(chunkUrls[2]).toContain('is_final=true');

  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('/audio/finalize'))).toBe(true));
  const previewCallIndex = fetch.mock.calls.findIndex(([url]) => String(url).includes('/audio/preview'));
  const finalizeCallIndex = fetch.mock.calls.findIndex(([url]) => String(url).includes('/audio/finalize'));
  expect(previewCallIndex).toBeGreaterThan(-1);
  expect(finalizeCallIndex).toBeGreaterThan(previewCallIndex);
  await waitFor(() => expect(screen.getAllByText('awaiting_realtime').length).toBeGreaterThan(0));

  act(() => {
    socket.receive(buildEnvelope('transcript.final', {
      transcript_kind: 'final',
      text: 'final from audio',
      message_id: 'msg_audio_accepted',
      source_kind: 'audio',
      recording_id: recordingId,
      generated_at: '2026-03-16T08:00:04Z',
      language: 'zh-CN',
      confidence: 0.91,
    }));
  });
  await waitFor(() => expect(screen.getAllByText('final from audio').length).toBeGreaterThan(0));

  act(() => {
    socket.receive(buildEnvelope('message.accepted', {
      ...buildMessage({
        message_id: 'msg_audio_accepted',
        source_kind: 'audio',
        content_text: 'final from audio',
        submitted_at: '2026-03-16T08:00:04Z',
      }),
    }));
  });
  await waitFor(() => expect(screen.getAllByText('completed').length).toBeGreaterThan(0));
  expect(screen.queryByText('partial from audio')).not.toBeInTheDocument();

  act(() => {
    socket.receive(buildEnvelope('transcript.partial', {
      transcript_kind: 'partial',
      text: 'late old partial',
      preview_seq: 2,
      recording_id: recordingId,
      generated_at: '2026-03-16T08:00:05Z',
      language: 'zh-CN',
      confidence: 0.2,
    }));
    socket.receive(buildEnvelope('dialogue.reply', {
      session_id: sessionPayload.session_id,
      trace_id: sessionPayload.trace_id,
      message_id: 'msg_assistant_audio_001',
      reply: 'assistant after audio',
      emotion: 'calm',
      risk_level: 'low',
      stage: 'assess',
      next_action: 'ask_followup',
      submitted_at: '2026-03-16T08:00:05Z',
    }, { source_service: 'orchestrator' }));
  });

  expect(screen.queryByText('late old partial')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByText('assistant after audio').length).toBeGreaterThan(0));
  expect(screen.getByText('received')).toBeInTheDocument();
});

test('microphone denial and unsupported MediaRecorder surface stable audio errors', async () => {
  const deniedGetUserMedia = jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  installMockAudioEnvironment({ getUserMedia: deniedGetUserMedia });
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  await act(async () => {
    fireEvent.click(getMicButton());
  });

  await waitFor(() => expect(screen.getByText('denied')).toBeInTheDocument());
  expect(screen.getAllByText('Microphone permission was denied.').length).toBeGreaterThan(0);

  installMockAudioEnvironment({ MediaRecorder: undefined });
  await act(async () => {
    fireEvent.click(getMicButton());
  });

  await waitFor(() => expect(screen.getByText('unsupported')).toBeInTheDocument());
  expect(screen.getAllByText('Current browser does not support MediaRecorder.').length).toBeGreaterThan(0);
});

test('audio chunk and finalize failures stay in error state', async () => {
  installMockAudioEnvironment();
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));
  installAudioFetchMock({
    onChunk: (url, count) => {
      if (count === 1) {
        return jsonResponse({ message: 'chunk upload failed' }, 500);
      }
      return jsonResponse({ media_id: 'media_ok', created_at: '2026-03-16T08:00:03Z' }, 200);
    },
    onFinalize: () => jsonResponse({ message: 'finalize failed' }, 500),
  });

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();
  await openSocket(socket);

  await act(async () => {
    fireEvent.click(getMicButton());
  });

  const recorder = MockMediaRecorder.instances[0];
  await act(async () => {
    recorder.emitChunk('chunk-1');
  });
  await waitFor(() => expect(screen.getAllByText('error').length).toBeGreaterThan(0));
  expect(screen.getAllByText('chunk upload failed').length).toBeGreaterThan(0);

  await act(async () => {
    fireEvent.click(getMicButton());
  });
  await flushAsyncUpdates();
  await waitFor(() => expect(screen.getAllByText('finalize failed').length).toBeGreaterThan(0));
  expect(screen.getAllByText('error').length).toBeGreaterThan(0);
});

test('dialogue reply synthesizes audio, autoplays, and logs runtime events', async () => {
  const { runtimeEvents, ttsBodies } = installPhaseFFetchMock();
  const { play, load } = installMockAssistantAudio();
  const socket = await createPhaseFSession();
  const replyPayload = emitDialogueReply(socket);

  await waitFor(() => expect(ttsBodies).toHaveLength(1));
  expect(ttsBodies[0]).toMatchObject({
    text: replyPayload.reply,
    subtitle: replyPayload.reply,
    voice_id: 'companion_female_01',
    session_id: sessionPayload.session_id,
    trace_id: sessionPayload.trace_id,
    message_id: replyPayload.message_id,
  });

  await waitFor(() => expect(load).toHaveBeenCalled());
  await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  expect(getCardValue('TTS playback')).toBe('ready');
  expect(getCardValue('Avatar runtime')).toBe('idle');
  expect(screen.getByText('语音已生成，准备播放。')).toBeInTheDocument();
  expect(screen.getByText('voice: zh-CN-XiaoxiaoNeural')).toBeInTheDocument();
  expect(screen.getByText('audio url: http://127.0.0.1:8040/media/tts/tts_mock_001.mp3')).toBeInTheDocument();

  const audioElement = getAssistantAudioElement();
  act(() => {
    audioElement.dispatchEvent(new Event('play'));
  });

  await waitFor(() => expect(getCardValue('TTS playback')).toBe('playing'));
  expect(getCardValue('Avatar runtime')).toBe('speaking');
  expect(screen.getByText('expression preset: focused_assess')).toBeInTheDocument();
  expect(screen.getByText('speech: speaking')).toBeInTheDocument();
  expect(screen.getAllByText(/mouth: (small|wide|round)/).length).toBeGreaterThan(0);

  act(() => {
    audioElement.dispatchEvent(new Event('ended'));
  });

  await waitFor(() => expect(getCardValue('TTS playback')).toBe('completed'));
  expect(getCardValue('Avatar runtime')).toBe('completed');
  expect(screen.getByText('speech: completed')).toBeInTheDocument();
  expect(screen.getAllByText('mouth: closed').length).toBeGreaterThan(0);

  const eventTypes = buildRuntimeEventTypeList(runtimeEvents);
  expect(eventTypes).toContain('tts.synthesized');
  expect(eventTypes).toContain('tts.playback.started');
  expect(eventTypes).toContain('tts.playback.ended');
  expect(eventTypes.filter((eventType) => eventType === 'avatar.command').length).toBeGreaterThanOrEqual(2);
});

test('dialogue reply normalizes internal tts audio url and still allows playback', async () => {
  installPhaseFFetchMock({
    audioUrl: 'http://tts-service/media/tts/tts_mock_001.mp3',
  });
  const { play } = installMockAssistantAudio();
  const socket = await createPhaseFSession();

  emitDialogueReply(socket);

  await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  expect(screen.getByText('audio url: http://127.0.0.1:8040/media/tts/tts_mock_001.mp3')).toBeInTheDocument();

  const audioElement = getAssistantAudioElement();
  expect(audioElement.src).toBe('http://127.0.0.1:8040/media/tts/tts_mock_001.mp3');

  act(() => {
    audioElement.dispatchEvent(new Event('play'));
    audioElement.dispatchEvent(new Event('ended'));
  });

  await waitFor(() => expect(getCardValue('TTS playback')).toBe('completed'));
  expect(getCardValue('Avatar runtime')).toBe('completed');
});

test('late media error after completion keeps completed playback state', async () => {
  installPhaseFFetchMock();
  installMockAssistantAudio();
  const socket = await createPhaseFSession();

  emitDialogueReply(socket);

  const audioElement = getAssistantAudioElement();
  act(() => {
    audioElement.dispatchEvent(new Event('play'));
    audioElement.dispatchEvent(new Event('ended'));
    audioElement.dispatchEvent(new Event('error'));
  });

  await waitFor(() => expect(getCardValue('TTS playback')).toBe('completed'));
  expect(getCardValue('Avatar runtime')).toBe('completed');
  expect(screen.queryByText('语音资源已生成，但浏览器未能加载音频资源，可点击重播语音重试。')).not.toBeInTheDocument();
});

test('avatar selection changes create-session avatar but keeps active session avatar stable', async () => {
  const { createBodies, ttsBodies } = installPhaseFFetchMock();
  installMockAssistantAudio();
  render(<App appConfig={appConfig} />);

  fireEvent.click(screen.getByRole('button', { name: '引导角色 B' }));
  expect(screen.getByText('当前将用于下次创建会话：引导角色 B / zh-CN-YunxiNeural')).toBeInTheDocument();

  const socket = await clickCreateSession();
  await openSocket(socket);
  await waitFor(() => expect(createBodies).toHaveLength(1));
  expect(createBodies[0].avatar_id).toBe('coach_male_01');
  expect(screen.getByText('当前将用于下次创建会话：引导角色 B / zh-CN-YunxiNeural')).toBeInTheDocument();

  emitDialogueReply(socket);
  await waitFor(() => expect(ttsBodies).toHaveLength(1));
  expect(ttsBodies[0].voice_id).toBe('coach_male_01');
  await waitFor(() => expect(screen.getByText((content) => content.startsWith('voice:'))).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText('voice: zh-CN-YunxiNeural')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: '陪伴角色 A' }));
  await waitFor(() => expect(screen.getByText('当前将用于下次创建会话：陪伴角色 A / zh-CN-XiaoxiaoNeural')).toBeInTheDocument());
  expect(screen.getByText('当前 live session 仍使用：引导角色 B')).toBeInTheDocument();

  expect(createBodies).toHaveLength(1);
  expect(ttsBodies).toHaveLength(1);
});

test('expression preset follows stage and risk from realtime reply and affect snapshot', async () => {
  installPhaseFFetchMock();
  installMockAssistantAudio();
  const socket = await createPhaseFSession();

  emitAffectSnapshot(socket, {
    current_stage: 'handoff',
    fusion_result: {
      emotion_state: 'distressed',
      risk_level: 'high',
      confidence: 0.91,
      conflict: false,
      conflict_reason: '',
      detail: 'high risk fusion detail',
    },
  });

  emitDialogueReply(socket, {
    stage: 'handoff',
    risk_level: 'high',
    emotion: 'distressed',
  });

  await waitFor(() => expect(screen.getByText('expression preset: guarded_handoff')).toBeInTheDocument());
  expect(screen.getByText('高风险或 handoff 阶段降低轻快感，保持严肃和稳定。')).toBeInTheDocument();
});

test('mouth drive animates during playback and closes after end', async () => {
  jest.useFakeTimers();
  installPhaseFFetchMock({
    durationMs: 2400,
  });
  installMockAssistantAudio();
  const socket = await createPhaseFSession();

  emitDialogueReply(socket, {
    reply: '谢谢你愿意说出来。我们先慢一点，把今晚最难受的部分说清楚。',
  });

  const audioElement = getAssistantAudioElement();
  act(() => {
    audioElement.dispatchEvent(new Event('play'));
  });

  await waitFor(() => expect(screen.getAllByText(/mouth: (small|wide|round)/).length).toBeGreaterThan(0));

  act(() => {
    jest.advanceTimersByTime(360);
  });

  expect(screen.getAllByText(/mouth: (small|wide|round)/).length).toBeGreaterThan(0);

  act(() => {
    audioElement.dispatchEvent(new Event('ended'));
  });

  await waitFor(() => expect(screen.getAllByText('mouth: closed').length).toBeGreaterThan(0));
});
