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

test('renders runtime config compatibility baseline', () => {
  render(<App appConfig={appConfig} />);
  expect(screen.getByText(/runtime config compatibility baseline/i)).toBeInTheDocument();
  expect(screen.getByText('http://127.0.0.1:8000')).toBeInTheDocument();
  expect(screen.getByText('ws://127.0.0.1:8000/ws')).toBeInTheDocument();
});
