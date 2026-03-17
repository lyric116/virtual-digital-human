import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const defaultAppConfig = {
  apiBaseUrl: 'http://127.0.0.1:8000',
  wsUrl: 'ws://127.0.0.1:8000/ws',
  ttsBaseUrl: 'http://127.0.0.1:8040',
  affectBaseUrl: 'http://127.0.0.1:8060',
  defaultAvatarId: 'companion_female_01',
  activeSessionStorageKey: 'virtual-human-active-session-id',
  exportCacheStorageKey: 'virtual-human-last-export',
  heartbeatIntervalMs: 5000,
  reconnectDelayMs: 1000,
  enableAudioFinalize: true,
  enableAudioPreview: true,
  audioPreviewChunkThreshold: 2,
  videoFrameUploadIntervalMs: 1800,
  autoplayAssistantAudio: true,
};

function readStringConfigValue(config, keys, fallback) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function readNumberConfigValue(config, keys, fallback) {
  for (const key of keys) {
    const rawValue = config[key];
    const numericValue = Number(rawValue);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return numericValue;
    }
  }
  return fallback;
}

function readBooleanConfigValue(config, keys, fallback) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return fallback;
}

function resolveAppConfig(rootWindow) {
  const config = rootWindow?.__APP_CONFIG__ || {};
  return {
    sourceLabel: rootWindow?.__APP_CONFIG__ ? 'window.__APP_CONFIG__' : 'built-in defaults',
    apiBaseUrl: readStringConfigValue(
      config,
      ['apiBaseUrl', 'gatewayBaseUrl', 'api_base_url'],
      defaultAppConfig.apiBaseUrl,
    ),
    wsUrl: readStringConfigValue(config, ['wsUrl', 'ws_url'], defaultAppConfig.wsUrl),
    ttsBaseUrl: readStringConfigValue(
      config,
      ['ttsBaseUrl', 'tts_base_url'],
      defaultAppConfig.ttsBaseUrl,
    ),
    affectBaseUrl: readStringConfigValue(
      config,
      ['affectBaseUrl', 'affect_base_url'],
      defaultAppConfig.affectBaseUrl,
    ),
    defaultAvatarId: readStringConfigValue(
      config,
      ['defaultAvatarId', 'default_avatar_id'],
      defaultAppConfig.defaultAvatarId,
    ),
    activeSessionStorageKey: readStringConfigValue(
      config,
      ['activeSessionStorageKey', 'active_session_storage_key'],
      defaultAppConfig.activeSessionStorageKey,
    ),
    exportCacheStorageKey: readStringConfigValue(
      config,
      ['exportCacheStorageKey', 'export_cache_storage_key'],
      defaultAppConfig.exportCacheStorageKey,
    ),
    heartbeatIntervalMs: readNumberConfigValue(
      config,
      ['heartbeatIntervalMs', 'heartbeat_interval_ms'],
      defaultAppConfig.heartbeatIntervalMs,
    ),
    reconnectDelayMs: readNumberConfigValue(
      config,
      ['reconnectDelayMs', 'reconnect_delay_ms'],
      defaultAppConfig.reconnectDelayMs,
    ),
    enableAudioFinalize: readBooleanConfigValue(
      config,
      ['enableAudioFinalize', 'enable_audio_finalize'],
      defaultAppConfig.enableAudioFinalize,
    ),
    enableAudioPreview: readBooleanConfigValue(
      config,
      ['enableAudioPreview', 'enable_audio_preview'],
      defaultAppConfig.enableAudioPreview,
    ),
    audioPreviewChunkThreshold: readNumberConfigValue(
      config,
      ['audioPreviewChunkThreshold', 'audio_preview_chunk_threshold'],
      defaultAppConfig.audioPreviewChunkThreshold,
    ),
    videoFrameUploadIntervalMs: readNumberConfigValue(
      config,
      ['videoFrameUploadIntervalMs', 'video_frame_upload_interval_ms'],
      defaultAppConfig.videoFrameUploadIntervalMs,
    ),
    autoplayAssistantAudio: readBooleanConfigValue(
      config,
      ['autoplayAssistantAudio', 'autoplay_assistant_audio'],
      defaultAppConfig.autoplayAssistantAudio,
    ),
  };
}

const appConfig = resolveAppConfig(window);
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <App appConfig={appConfig} />
  </React.StrictMode>,
);
