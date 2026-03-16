function buildErrorMessage(payload, fallbackMessage) {
  if (payload && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }
  return fallbackMessage;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

export async function requestSession(apiBaseUrl, avatarId) {
  const response = await fetch(`${apiBaseUrl}/api/session/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input_modes: ['text', 'audio', 'video'],
      avatar_id: avatarId,
      metadata: {
        source: 'emotion_app',
      },
    }),
  });

  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, `Session create failed with status ${response.status}`));
  }
  return payload;
}

export async function requestSessionState(apiBaseUrl, sessionId) {
  const response = await fetch(`${apiBaseUrl}/api/session/${encodeURIComponent(sessionId)}/state`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, `Session state fetch failed with status ${response.status}`));
  }
  return payload;
}

export async function requestTextMessage(apiBaseUrl, sessionId, contentText, clientSeq) {
  const response = await fetch(`${apiBaseUrl}/api/session/${encodeURIComponent(sessionId)}/text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content_text: contentText,
      client_seq: clientSeq,
      metadata: {
        source: 'emotion_app',
      },
    }),
  });

  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, `Text submit failed with status ${response.status}`));
  }
  return payload;
}

export async function pollSessionStateForReply(apiBaseUrl, sessionId, previousMessageCount, maxAttempts = 12) {
  let lastPayload = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    lastPayload = await requestSessionState(apiBaseUrl, sessionId);
    const messages = Array.isArray(lastPayload?.messages) ? lastPayload.messages : [];
    const hasAssistantReply = messages.length >= previousMessageCount + 2
      || (messages.length > previousMessageCount && messages[messages.length - 1]?.role === 'assistant');

    if (hasAssistantReply || attempt === maxAttempts - 1) {
      return lastPayload;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return lastPayload;
}

export function buildRealtimeSocketUrl(wsUrl, sessionId, traceId) {
  const baseUrl = typeof wsUrl === 'string' ? wsUrl.replace(/\/+$/, '') : '';
  return `${baseUrl}/session/${encodeURIComponent(sessionId)}?trace_id=${encodeURIComponent(traceId || '')}`;
}

export function buildHeartbeatMessage(sessionId, traceId) {
  return {
    type: 'ping',
    session_id: sessionId,
    trace_id: traceId || '',
    sent_at: new Date().toISOString(),
  };
}

export function isTerminalRealtimeClose(event) {
  if (!event || typeof event !== 'object') {
    return false;
  }

  const closeCode = typeof event.code === 'number' ? event.code : 1000;
  const closeReason = typeof event.reason === 'string' ? event.reason : '';
  if (closeCode === 4404) {
    return true;
  }
  return closeReason === 'session_not_found';
}

export function readStoredSessionId(storageKey) {
  try {
    return window?.localStorage?.getItem(storageKey) || null;
  } catch (error) {
    return null;
  }
}

export function writeStoredSessionId(storageKey, sessionId) {
  try {
    window?.localStorage?.setItem(storageKey, sessionId);
  } catch (error) {
    // Ignore localStorage availability errors in browser-restricted contexts.
  }
}

export function clearStoredSessionId(storageKey) {
  try {
    window?.localStorage?.removeItem(storageKey);
  } catch (error) {
    // Ignore localStorage availability errors in browser-restricted contexts.
  }
}
