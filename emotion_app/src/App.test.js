import { render, screen } from '@testing-library/react';
import App from './App';

const appConfig = {
  apiBaseUrl: 'http://127.0.0.1:8000',
  wsUrl: 'ws://127.0.0.1:8000/ws',
  ttsBaseUrl: 'http://127.0.0.1:8040',
  affectBaseUrl: 'http://127.0.0.1:8060',
  defaultAvatarId: 'companion_female_01',
  activeSessionStorageKey: 'virtual-human-active-session-id',
  exportCacheStorageKey: 'virtual-human-last-export',
  sourceLabel: 'test',
};

beforeEach(() => {
  window.localStorage.clear();
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
