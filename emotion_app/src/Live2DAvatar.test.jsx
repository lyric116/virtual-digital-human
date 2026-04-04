import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createMockRuntime() {
  class MockRenderer {
    startUp() {}

    setIsPremultipliedAlpha() {}

    setIsCulling() {}

    bindTexture() {}

    setMvpMatrix() {}

    setRenderState() {}

    drawModel() {}
  }

  class MockUserModel {
    constructor() {
      this._model = {
        getParameterIndex: () => 999,
        getParameterCount: () => 0,
        saveParameters: jest.fn(),
        loadParameters: jest.fn(),
        update: jest.fn(),
        setParameterValueById: jest.fn(),
      };
      this._renderer = null;
      this._motionManager = {
        updateMotion: jest.fn(() => false),
        startMotionPriority: jest.fn(),
      };
      this._eyeBlink = null;
      this._breath = null;
      this._physics = null;
      this._pose = null;
    }

    loadModel() {}

    getModel() {
      return this._model;
    }

    getModelMatrix() {
      return null;
    }

    getRenderer() {
      return this._renderer;
    }

    loadPhysics() {}

    loadPose() {}

    createRenderer() {
      this._renderer = new MockRenderer();
    }

    setRenderTargetSize() {}

    setInitialized() {}

    setUpdating() {}

    loadMotion() {
      return null;
    }

    release() {}
  }

  return {
    CubismFramework: {
      getIdManager: () => ({
        getId: (parameterName) => parameterName,
      }),
    },
    CubismUserModel: MockUserModel,
    CubismEyeBlink: {
      create: jest.fn(() => ({
        updateParameters: jest.fn(),
      })),
    },
    CubismBreath: {
      create: jest.fn(() => ({
        setParameters: jest.fn(),
        updateParameters: jest.fn(),
      })),
    },
    BreathParameterData: class BreathParameterData {},
    CubismMatrix44: class CubismMatrix44 {},
    shaderPath: '/live2d/shaders/',
  };
}

function createMockModelSetting(modelFileName) {
  return {
    getModelFileName: () => modelFileName,
    getEyeBlinkParameterCount: () => 0,
    getEyeBlinkParameterId: () => null,
    getLipSyncParameterCount: () => 0,
    getLipSyncParameterId: () => null,
    getPhysicsFileName: () => '',
    getPoseFileName: () => '',
    getTextureCount: () => 0,
    getTextureFileName: () => '',
    getMotionFileName: () => '',
    release: jest.fn(),
  };
}

describe('Live2DAvatar loading states', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    jest.clearAllMocks();
    live2dHelpers.canRenderLive2D.mockReturnValue(true);
    live2dHelpers.loadLive2DRuntime.mockResolvedValue(createMockRuntime());
    live2dHelpers.loadLive2DModelSetting.mockImplementation((modelPath) => (
      Promise.resolve(createMockModelSetting(modelPath.includes('next') ? 'next.moc3' : 'base.moc3'))
    ));
    live2dHelpers.loadLive2DTexture.mockResolvedValue('texture-id');

    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      deleteTexture: jest.fn(),
    }));
    window.requestAnimationFrame = jest.fn(() => 1);
    window.cancelAnimationFrame = jest.fn();
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    jest.restoreAllMocks();
  });

  test('keeps the avatar fallback hidden while a Live2D model is loading', () => {
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

  test('silently ignores initialization results that resolve after unmount', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const modelDeferred = createDeferred();

    live2dHelpers.loadLive2DArrayBuffer.mockImplementation((assetPath) => {
      if (assetPath.includes('base.moc3')) {
        return modelDeferred.promise;
      }
      return Promise.resolve(new ArrayBuffer(8));
    });

    const { unmount } = render(
      <Live2DAvatar
        fallback={<div data-testid="avatar-fallback">fallback avatar</div>}
        modelPath="/live2d/base.model3.json"
      />,
    );

    unmount();

    await act(async () => {
      modelDeferred.resolve(new ArrayBuffer(8));
      await modelDeferred.promise;
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test('shows the provided fallback when Live2D initialization fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    live2dHelpers.loadLive2DRuntime.mockRejectedValue(new Error('load failed'));

    render(
      <Live2DAvatar
        fallback={<div data-testid="avatar-fallback">fallback avatar</div>}
        modelPath="/live2d/haru.model3.json"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument());
    expect(screen.queryByTestId('live2d-loading-placeholder')).not.toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
