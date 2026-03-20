const live2dCoreScriptPromises = new Map();
const live2dRuntimePromises = new Map();

export function canRenderLive2D() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
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

export function fitLive2DModel(model, width, height) {
  if (!model || !width || !height) {
    return;
  }

  const internalWidth = model.internalModel?.width || model.width || 1;
  const internalHeight = model.internalModel?.height || model.height || 1;
  const scale = Math.min(width / internalWidth, height / internalHeight) * 0.92;

  model.anchor.set(0.5, 1);
  model.position.set(width / 2, height);
  model.scale.set(scale);
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
      const PIXI = await import('pixi.js');
      window.PIXI = PIXI;
      const live2d = await import('@naari3/pixi-live2d-display/cubism5');
      if (typeof live2d.cubism5Ready === 'function') {
        await live2d.cubism5Ready();
      }
      return {
        PIXI,
        ...live2d,
      };
    })().catch((error) => {
      live2dRuntimePromises.delete(normalizedCorePath);
      throw error;
    }));
  }

  return live2dRuntimePromises.get(normalizedCorePath);
}
