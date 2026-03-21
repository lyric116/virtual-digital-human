const live2dCoreScriptPromises = new Map();
const live2dRuntimePromises = new Map();

export const DEFAULT_LIVE2D_SHADER_PATH = '/live2d/shaders/';

export function canRenderLive2D() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas?.getContext?.('webgl')
      || canvas?.getContext?.('experimental-webgl')
      || canvas?.getContext?.('webgl2'),
    );
  } catch (error) {
    return false;
  }
}

export function measureLive2DViewport(element, fallbackWidth = 200, fallbackHeight = 240) {
  const rect = element?.getBoundingClientRect?.();
  return {
    width: Math.max(1, Math.round(rect?.width || fallbackWidth)),
    height: Math.max(1, Math.round(rect?.height || fallbackHeight)),
  };
}

export function observeLive2DViewport(element, onResize) {
  if (!element || typeof onResize !== 'function') {
    return () => {};
  }

  if (typeof ResizeObserver === 'function') {
    const resizeObserver = new ResizeObserver(() => onResize());
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }

  return () => {};
}

export async function ensureLive2DCubismCore(corePath) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Live2D runtime requires a browser environment.');
  }

  if (window.Live2DCubismCore) {
    return window.Live2DCubismCore;
  }

  const normalizedCorePath = String(corePath || '').trim();
  if (!normalizedCorePath) {
    throw new Error('Missing Live2D Cubism Core asset path.');
  }

  if (!live2dCoreScriptPromises.has(normalizedCorePath)) {
    live2dCoreScriptPromises.set(normalizedCorePath, new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[data-live2d-core-src="${normalizedCorePath}"]`);
      if (existingScript) {
        if (window.Live2DCubismCore) {
          resolve(window.Live2DCubismCore);
          return;
        }
        existingScript.addEventListener('load', () => {
          if (window.Live2DCubismCore) {
              resolve(window.Live2DCubismCore);
            return;
          }
          reject(new Error('Live2D Cubism Core loaded without a global runtime.'));
        }, { once: true });
        existingScript.addEventListener('error', () => {
          live2dCoreScriptPromises.delete(normalizedCorePath);
          reject(new Error(`Failed to load Live2D Cubism Core from ${normalizedCorePath}.`));
        }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.async = true;
      script.src = normalizedCorePath;
      script.dataset.live2dCoreSrc = normalizedCorePath;
      script.onload = () => {
        if (window.Live2DCubismCore) {
          resolve(window.Live2DCubismCore);
          return;
        }
        live2dCoreScriptPromises.delete(normalizedCorePath);
        reject(new Error('Live2D Cubism Core loaded without a global runtime.'));
      };
      script.onerror = () => {
        live2dCoreScriptPromises.delete(normalizedCorePath);
        reject(new Error(`Failed to load Live2D Cubism Core from ${normalizedCorePath}.`));
      };
      document.head.appendChild(script);
    }));
  }

  return live2dCoreScriptPromises.get(normalizedCorePath);
}

export async function loadLive2DRuntime(corePath) {
  const normalizedCorePath = String(corePath || '').trim();
  await ensureLive2DCubismCore(normalizedCorePath);

  if (!live2dRuntimePromises.has(normalizedCorePath)) {
    live2dRuntimePromises.set(normalizedCorePath, (async () => {
      const [
        frameworkModule,
        modelSettingModule,
        userModelModule,
        matrixModule,
        eyeBlinkModule,
        breathModule,
        shaderModule,
        offscreenModule,
      ] = await Promise.all([
        import('./cubism-framework/live2dcubismframework'),
        import('./cubism-framework/cubismmodelsettingjson'),
        import('./cubism-framework/model/cubismusermodel'),
        import('./cubism-framework/math/cubismmatrix44'),
        import('./cubism-framework/effect/cubismeyeblink'),
        import('./cubism-framework/effect/cubismbreath'),
        import('./cubism-framework/rendering/cubismshader_webgl'),
        import('./cubism-framework/rendering/cubismoffscreenmanager'),
      ]);

      const { CubismFramework } = frameworkModule;
      if (!CubismFramework.isStarted()) {
        CubismFramework.startUp();
      }
      if (!CubismFramework.isInitialized()) {
        CubismFramework.initialize();
      }

      return {
        CubismFramework,
        CubismModelSettingJson: modelSettingModule.CubismModelSettingJson,
        CubismUserModel: userModelModule.CubismUserModel,
        CubismMatrix44: matrixModule.CubismMatrix44,
        CubismEyeBlink: eyeBlinkModule.CubismEyeBlink,
        CubismBreath: breathModule.CubismBreath,
        BreathParameterData: breathModule.BreathParameterData,
        CubismShaderManager_WebGL: shaderModule.CubismShaderManager_WebGL,
        CubismWebGLOffscreenManager: offscreenModule.CubismWebGLOffscreenManager,
        shaderPath: DEFAULT_LIVE2D_SHADER_PATH,
      };
    })().catch((error) => {
      live2dRuntimePromises.delete(normalizedCorePath);
      throw error;
    }));
  }

  return live2dRuntimePromises.get(normalizedCorePath);
}

export function resolveLive2DModelBasePath(modelPath) {
  const normalizedModelPath = String(modelPath || '').trim();
  const lastSlashIndex = normalizedModelPath.lastIndexOf('/');
  if (lastSlashIndex < 0) {
    return '';
  }
  return normalizedModelPath.slice(0, lastSlashIndex + 1);
}

export async function loadLive2DArrayBuffer(assetPath) {
  const response = await fetch(assetPath);
  if (!response.ok) {
    throw new Error(`Failed to fetch Live2D asset: ${assetPath}`);
  }
  return response.arrayBuffer();
}

export async function loadLive2DModelSetting(modelPath, CubismModelSettingJson) {
  const buffer = await loadLive2DArrayBuffer(modelPath);
  return new CubismModelSettingJson(buffer, buffer.byteLength);
}

export async function loadLive2DTexture(gl, texturePath) {
  const image = await new Promise((resolve, reject) => {
    const nextImage = new Image();
    nextImage.decoding = 'async';
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error(`Failed to load Live2D texture: ${texturePath}`));
    nextImage.src = texturePath;
  });

  const texture = gl.createTexture();
  if (!texture) {
    throw new Error(`Failed to create WebGL texture for ${texturePath}`);
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

export function resizeLive2DCanvas(canvas, gl, width, height) {
  const devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const displayWidth = Math.max(1, Math.round(width * devicePixelRatio));
  const displayHeight = Math.max(1, Math.round(height * devicePixelRatio));

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

  return {
    width: canvas.width,
    height: canvas.height,
  };
}

export function configureLive2DModelMatrix(userModel, modelSetting, options = {}) {
  const modelMatrix = userModel?.getModelMatrix?.();
  if (!modelMatrix) {
    return;
  }

  modelMatrix.loadIdentity();

  const layout = new Map();
  const hasLayout = Boolean(modelSetting?.getLayoutMap?.(layout));
  if (hasLayout) {
    modelMatrix.setupFromLayout(layout);
  }

  const logicalWidth = Number.isFinite(options?.logicalWidth) ? options.logicalWidth : null;
  const logicalHeight = Number.isFinite(options?.logicalHeight)
    ? options.logicalHeight
    : hasLayout ? null : 2.9;

  if (logicalWidth != null) {
    modelMatrix.setWidth(logicalWidth);
  } else if (logicalHeight != null) {
    modelMatrix.setHeight(logicalHeight);
  }

  const centerX = Number.isFinite(options?.centerX) ? options.centerX : hasLayout ? null : 0;
  const centerY = Number.isFinite(options?.centerY) ? options.centerY : hasLayout ? null : -0.45;

  if (centerX != null) {
    modelMatrix.centerX(centerX);
  }
  if (centerY != null) {
    modelMatrix.centerY(centerY);
  }

  const offsetX = Number.isFinite(options?.offsetX) ? options.offsetX : 0;
  const offsetY = Number.isFinite(options?.offsetY) ? options.offsetY : 0;

  if (offsetX !== 0) {
    modelMatrix.translateX(modelMatrix.getTranslateX() + offsetX);
  }
  if (offsetY !== 0) {
    modelMatrix.translateY(modelMatrix.getTranslateY() + offsetY);
  }
}

export function createLive2DProjection(CubismMatrix44, width, height) {
  const projection = new CubismMatrix44();
  if (width > height) {
    projection.scale(height / width, 1.0);
  } else {
    projection.scale(1.0, width / height);
  }
  return projection;
}
