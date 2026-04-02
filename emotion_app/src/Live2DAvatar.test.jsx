import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Live2DAvatar from './Live2DAvatar';
import * as live2dHelpers from './live2dHelpers';

jest.mock('./live2dHelpers', () => ({
  canRenderLive2D: jest.fn(),
  configureLive2DModelMatrix: jest.fn(),
  createLive2DProjection: jest.fn(),
  loadLive2DArrayBuffer: jest.fn(),
  loadLive2DModelSetting: jest.fn(),
  loadLive2DRuntime: jest.fn(),
  loadLive2DTexture: jest.fn(),
  measureLive2DViewport: jest.fn(() => ({ width: 200, height: 240 })),
  observeLive2DViewport: jest.fn(() => () => {}),
  resolveLive2DModelBasePath: jest.fn(() => '/live2d/models/'),
  resizeLive2DCanvas: jest.fn((_canvas, _gl, width, height) => ({ width, height })),
}));

describe('Live2DAvatar loading states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('keeps the avatar fallback hidden while a Live2D model is loading', () => {
    live2dHelpers.canRenderLive2D.mockReturnValue(true);
    live2dHelpers.loadLive2DRuntime.mockReturnValue(new Promise(() => {}));

    render(
      <Live2DAvatar
        fallback={<div data-testid="avatar-fallback">fallback avatar</div>}
        modelPath="/live2d/haru.model3.json"
      />,
    );

    expect(screen.getByTestId('live2d-loading-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-fallback')).not.toBeInTheDocument();
  });

  test('shows the provided fallback when Live2D rendering is unavailable', () => {
    live2dHelpers.canRenderLive2D.mockReturnValue(false);

    render(
      <Live2DAvatar
        fallback={<div data-testid="avatar-fallback">fallback avatar</div>}
        modelPath="/live2d/haru.model3.json"
      />,
    );

    expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('live2d-loading-placeholder')).not.toBeInTheDocument();
  });

  test('shows the provided fallback when Live2D initialization fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    live2dHelpers.canRenderLive2D.mockReturnValue(true);
    live2dHelpers.loadLive2DRuntime.mockRejectedValue(new Error('load failed'));

    render(
      <Live2DAvatar
        fallback={<div data-testid="avatar-fallback">fallback avatar</div>}
        modelPath="/live2d/haru.model3.json"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument());
    expect(screen.queryByTestId('live2d-loading-placeholder')).not.toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });
});
