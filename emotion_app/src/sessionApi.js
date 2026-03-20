function buildErrorMessage(payload, fallbackMessage) {
  if (payload && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }
  if (payload && typeof payload.detail === 'string' && payload.detail.trim()) {
    return payload.detail.trim();
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

export async function requestSessionExport(apiBaseUrl, sessionId) {
  const response = await fetch(`${apiBaseUrl}/api/session/${encodeURIComponent(sessionId)}/export`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, `Session export failed with status ${response.status}`));
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

export async function requestAudioChunkUpload(apiBaseUrl, sessionId, payload) {
  const query = new URLSearchParams();
  query.set('chunk_seq', String(payload.chunkSeq));
  if (typeof payload.chunkStartedAtMs === 'number') {
    query.set('chunk_started_at_ms', String(payload.chunkStartedAtMs));
  }
  if (typeof payload.durationMs === 'number') {
    query.set('duration_ms', String(payload.durationMs));
  }
  query.set('is_final', payload.isFinal ? 'true' : 'false');

  const response = await fetch(
    `${apiBaseUrl}/api/session/${encodeURIComponent(sessionId)}/audio/chunk?${query.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': payload.blob?.type || 'application/octet-stream',
      },
      body: payload.blob,
    },
  );

  const responsePayload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(responsePayload, `Audio chunk upload failed with status ${response.status}`));
  }
  return responsePayload;
}

export async function requestAudioPreview(apiBaseUrl, sessionId, payload) {
  const query = new URLSearchParams();
  query.set('preview_seq', String(payload.previewSeq));
  query.set('recording_id', payload.recordingId);
  if (typeof payload.durationMs === 'number') {
    query.set('duration_ms', String(payload.durationMs));
  }

  const response = await fetch(
    `${apiBaseUrl}/api/session/${encodeURIComponent(sessionId)}/audio/preview?${query.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': payload.blob?.type || 'application/octet-stream',
      },
      body: payload.blob,
    },
  );

  const responsePayload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(responsePayload, `Audio preview failed with status ${response.status}`));
  }
  return responsePayload;
}

export async function requestAudioFinalize(apiBaseUrl, sessionId, payload) {
  const query = new URLSearchParams();
  if (typeof payload.durationMs === 'number') {
    query.set('duration_ms', String(payload.durationMs));
  }
  if (typeof payload.recordingId === 'string' && payload.recordingId.trim()) {
    query.set('recording_id', payload.recordingId);
  }

  const response = await fetch(
    `${apiBaseUrl}/api/session/${encodeURIComponent(sessionId)}/audio/finalize?${query.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': payload.blob?.type || 'application/octet-stream',
      },
      body: payload.blob,
    },
  );

  const responsePayload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(responsePayload, `Audio finalize failed with status ${response.status}`));
  }
  return responsePayload;
}

export async function requestAsrTranscription(asrBaseUrl, payload) {
  const query = new URLSearchParams();
  if (typeof payload.filename === 'string' && payload.filename.trim()) {
    query.set('filename', payload.filename);
  }
  if (typeof payload.recordId === 'string' && payload.recordId.trim()) {
    query.set('record_id', payload.recordId);
  }
  const queryString = query.toString();

  const response = await fetch(
    `${asrBaseUrl}/api/asr/transcribe${queryString ? `?${queryString}` : ''}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': payload.blob?.type || 'application/octet-stream',
      },
      body: payload.blob,
    },
  );

  const responsePayload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(responsePayload, `ASR transcription failed with status ${response.status}`));
  }
  return responsePayload;
}

export async function requestAsrStreamPreview(asrBaseUrl, payload) {
  const query = new URLSearchParams();
  query.set('session_id', payload.sessionId);
  query.set('recording_id', payload.recordingId);
  query.set('preview_seq', String(payload.previewSeq));
  if (typeof payload.filename === 'string' && payload.filename.trim()) {
    query.set('filename', payload.filename);
  }

  const response = await fetch(
    `${asrBaseUrl}/api/asr/stream/preview?${query.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': payload.blob?.type || 'application/octet-stream',
      },
      body: payload.blob,
    },
  );

  const responsePayload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(responsePayload, `ASR stream preview failed with status ${response.status}`));
  }
  return responsePayload;
}

export async function requestAsrStreamRelease(asrBaseUrl, payload) {
  const query = new URLSearchParams();
  query.set('session_id', payload.sessionId);
  query.set('recording_id', payload.recordingId);

  const response = await fetch(
    `${asrBaseUrl}/api/asr/stream/release?${query.toString()}`,
    {
      method: 'POST',
    },
  );

  const responsePayload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(responsePayload, `ASR stream release failed with status ${response.status}`));
  }
  return responsePayload;
}

export async function requestVideoFrameUpload(apiBaseUrl, sessionId, payload) {
  const query = new URLSearchParams();
  query.set('frame_seq', String(payload.frameSeq));
  if (typeof payload.capturedAtMs === 'number') {
    query.set('captured_at_ms', String(payload.capturedAtMs));
  }
  if (typeof payload.width === 'number') {
    query.set('width', String(payload.width));
  }
  if (typeof payload.height === 'number') {
    query.set('height', String(payload.height));
  }

  const response = await fetch(
    `${apiBaseUrl}/api/session/${encodeURIComponent(sessionId)}/video/frame?${query.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': payload.blob?.type || 'application/octet-stream',
      },
      body: payload.blob,
    },
  );

  const responsePayload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(responsePayload, `Video frame upload failed with status ${response.status}`));
  }
  return responsePayload;
}

export async function requestTTSSynthesis(ttsBaseUrl, payload) {
  const response = await fetch(`${ttsBaseUrl}/internal/tts/synthesize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responsePayload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(responsePayload, `TTS synthesize failed with status ${response.status}`));
  }
  return responsePayload;
}

export async function requestRuntimeEvent(apiBaseUrl, sessionId, payload) {
  const response = await fetch(
    `${apiBaseUrl}/api/session/${encodeURIComponent(sessionId)}/runtime-event`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  const responsePayload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(responsePayload, `Runtime event failed with status ${response.status}`));
  }
  return responsePayload;
}

export async function requestAffectAnalysis(affectBaseUrl, payload) {
  const response = await fetch(`${affectBaseUrl}/internal/affect/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responsePayload = await parseJson(response);
  if (!response.ok) {
    throw new Error(buildErrorMessage(responsePayload, `Affect analyze failed with status ${response.status}`));
  }
  return responsePayload;
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
