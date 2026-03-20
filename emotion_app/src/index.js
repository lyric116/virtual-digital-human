import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { resolveAppConfig } from './appHelpers';

const appConfig = resolveAppConfig(
  window?.__APP_CONFIG__,
  window?.__APP_CONFIG__ ? 'window.__APP_CONFIG__' : 'built-in defaults',
);
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <App appConfig={appConfig} />
  </React.StrictMode>,
);
