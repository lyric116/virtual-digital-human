import React, { useEffect, useRef, useState } from 'react';
import {
  canRenderLive2D,
  fitLive2DModel,
  loadLive2DRuntime,
  measureLive2DViewport,
  observeLive2DViewport,
} from './live2dHelpers';

function clearElementChildren(element) {
  if (!element) {
    return;
  }
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

export default function Live2DAvatar({
  className = '',
  corePath = '/live2d/live2dcubismcore.min.js',
  fallback = null,
  idleMotion = null,
  modelPath,
}) {
  const rootRef = useRef(null);
  const canvasHostRef = useRef(null);
  const appRef = useRef(null);
  const modelRef = useRef(null);
  const [renderState, setRenderState] = useState(() => (canRenderLive2D() ? 'loading' : 'fallback'));

  useEffect(() => {
    let cancelled = false;
    let stopObservingViewport = () => {};

    async function mountLive2D() {
      if (!modelPath || !rootRef.current || !canvasHostRef.current || !canRenderLive2D()) {
        setRenderState('fallback');
        return;
      }

      setRenderState('loading');

      try {
        const {
          Live2DModel,
          MotionPriority,
          PIXI,
        } = await loadLive2DRuntime(corePath);

        if (cancelled) {
          return;
        }

        const app = new PIXI.Application();
        const initialViewport = measureLive2DViewport(rootRef.current);
        await app.init({
          width: initialViewport.width,
          height: initialViewport.height,
          antialias: true,
          autoDensity: true,
          backgroundAlpha: 0,
          preference: 'webgl',
          resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
        });

        if (cancelled) {
          app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
          return;
        }

        appRef.current = app;
        clearElementChildren(canvasHostRef.current);
        canvasHostRef.current.appendChild(app.canvas);

        const model = await Live2DModel.from(modelPath, {
          autoFocus: false,
          autoHitTest: false,
          idleMotionGroup: typeof idleMotion?.group === 'string' ? idleMotion.group : '',
          ticker: PIXI.Ticker.shared,
        });

        if (cancelled) {
          app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
          return;
        }

        modelRef.current = model;
        app.stage.addChild(model);

        const syncViewport = () => {
          if (!appRef.current || !modelRef.current || !rootRef.current) {
            return;
          }
          const nextViewport = measureLive2DViewport(rootRef.current);
          appRef.current.renderer.resize(nextViewport.width, nextViewport.height);
          fitLive2DModel(modelRef.current, nextViewport.width, nextViewport.height);
        };

        syncViewport();
        stopObservingViewport = observeLive2DViewport(rootRef.current, syncViewport);

        if (typeof idleMotion?.group === 'string' && Number.isInteger(idleMotion?.index)) {
          void model.motion(idleMotion.group, idleMotion.index, MotionPriority.IDLE);
        }

        setRenderState('ready');
      } catch (error) {
        console.error('Failed to initialize Live2D avatar.', error);
        setRenderState('error');
      }
    }

    void mountLive2D();

    return () => {
      cancelled = true;
      stopObservingViewport();
      modelRef.current = null;
      if (appRef.current) {
        appRef.current.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
        appRef.current = null;
      }
      clearElementChildren(canvasHostRef.current);
    };
  }, [corePath, idleMotion?.group, idleMotion?.index, modelPath]);

  return (
    <div className={`relative overflow-hidden ${className}`} data-live2d-state={renderState} ref={rootRef}>
      <div className={`absolute inset-0 transition-opacity duration-300 ${renderState === 'ready' ? 'opacity-100' : 'opacity-0'}`} ref={canvasHostRef} />
      {renderState === 'ready' ? null : (
        <div className="absolute inset-0">
          {fallback}
        </div>
      )}
    </div>
  );
}
