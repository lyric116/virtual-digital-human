import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

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

  receiveRaw(data) {
    this.emit('message', { data });
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

beforeEach(() => {
  window.localStorage.clear();
  MockWebSocket.reset();
  global.fetch = jest.fn();
  window.WebSocket = MockWebSocket;
  global.WebSocket = MockWebSocket;
});

afterEach(() => {
  jest.useRealTimers();
});

test('renders runtime config compatibility baseline', () => {
  render(<App appConfig={appConfig} />);
  expect(screen.getByText(/runtime config compatibility baseline/i)).toBeInTheDocument();
  expect(screen.getByText('http://127.0.0.1:8000')).toBeInTheDocument();
  expect(screen.getByText('ws://127.0.0.1:8000/ws')).toBeInTheDocument();
});

test('renders phase b session baseline controls', () => {
  render(<App appConfig={appConfig} />);
  expect(screen.getByText(/session create \/ state restore \/ text submit/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /创建会话|create session/i })).toBeInTheDocument();
  expect(screen.getByText(/当前没有本地缓存的会话|no stored session is available yet/i)).toBeInTheDocument();
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
  fetch.mockResolvedValueOnce(jsonResponse({
    session: sessionPayload,
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
  }));

  render(<App appConfig={appConfig} />);

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/session/sess_test_001/state'),
    expect.any(Object),
  ));
  await waitFor(() => expect(screen.getByText('restored assistant')).toBeInTheDocument());
  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

  const socket = latestSocket();
  expect(socket.url).toBe(
    'ws://127.0.0.1:8000/ws/session/sess_test_001?trace_id=trace_test_001',
  );
});

test('submit text uses websocket completion, clears draft on accepted, updates stage on reply, and dedupes repeated envelopes', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(sessionPayload, 201))
    .mockResolvedValueOnce(jsonResponse({
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

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();

  act(() => {
    socket.open();
  });

  fireEvent.change(
    screen.getByPlaceholderText(/轻轻敲下您的心声|type your thoughts here/i),
    { target: { value: 'hello realtime' } },
  );
  fireEvent.click(screen.getByTitle(/发送文本|send text/i));

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:8000/api/session/sess_test_001/text',
    expect.any(Object),
  ));
  expect(screen.queryByDisplayValue('hello realtime')).toBeInTheDocument();

  const acceptedEnvelope = buildEnvelope('message.accepted', {
    ...buildMessage({
      message_id: 'msg_user_001',
      content_text: 'hello realtime',
      submitted_at: '2026-03-16T08:00:04Z',
      metadata: { client_seq: 1 },
    }),
  });

  act(() => {
    socket.receive(acceptedEnvelope);
    socket.receive(acceptedEnvelope);
  });

  await waitFor(() => expect(screen.queryByDisplayValue('hello realtime')).not.toBeInTheDocument());
  expect(screen.getAllByText('hello realtime')).toHaveLength(1);
  expect(screen.getByText('awaiting_reply')).toBeInTheDocument();

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
    socket.receive(replyEnvelope);
    socket.receive(replyEnvelope);
  });

  await waitFor(() => expect(screen.getAllByText('assistant via realtime')).toHaveLength(1));
  expect(screen.getByText('assess')).toBeInTheDocument();
  expect(screen.getByText('received')).toBeInTheDocument();
});

test('heartbeat sends ping and updates the last heartbeat timestamp', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();

  await openSocket(socket);
  expect(JSON.parse(socket.sent[0])).toMatchObject({
    type: 'ping',
    session_id: sessionPayload.session_id,
  });

  act(() => {
    socket.receive(buildEnvelope('session.heartbeat', {
      connection_status: 'alive',
      client_time: '2026-03-16T08:00:06Z',
      server_time: '2026-03-16T08:00:07Z',
      heartbeat_interval_ms: 200,
    }));
  });

  expect(screen.getAllByText(/2026-03-16T08:00:07Z/).length).toBeGreaterThan(0);
});

test('non-terminal websocket close schedules a reconnect', async () => {
  jest.useFakeTimers();
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();

  await openSocket(socket);

  act(() => {
    socket.serverClose(1011, 'server_restart');
  });

  await waitFor(() => expect(screen.getByText('reconnecting')).toBeInTheDocument());

  act(() => {
    jest.advanceTimersByTime(appConfig.reconnectDelayMs);
  });

  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2));
  expect(latestSocket().url).toBe(
    'ws://127.0.0.1:8000/ws/session/sess_test_001?trace_id=trace_test_001',
  );
});

test('terminal websocket close stops reconnecting', async () => {
  jest.useFakeTimers();
  fetch.mockResolvedValueOnce(jsonResponse(sessionPayload, 201));

  render(<App appConfig={appConfig} />);
  const socket = await clickCreateSession();

  await openSocket(socket);

  act(() => {
    socket.serverClose(4404, 'session_not_found');
  });

  await waitFor(() => expect(screen.getByText('closed')).toBeInTheDocument());

  act(() => {
    jest.advanceTimersByTime(appConfig.reconnectDelayMs);
  });

  expect(MockWebSocket.instances).toHaveLength(1);
});

test('session.error shows an error without removing existing messages', async () => {
  window.localStorage.setItem(appConfig.activeSessionStorageKey, sessionPayload.session_id);
  fetch.mockResolvedValueOnce(jsonResponse({
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
  }));

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
  expect(screen.getAllByText('existing user message')).toHaveLength(1);
  expect(screen.getAllByText('existing assistant reply')).toHaveLength(1);
});
