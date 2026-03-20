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

function clampLive2DParameter(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function buildLive2DExpressionMap(expressionPreset, speechState) {
  const valence = Number(expressionPreset?.valence || 0);
  const arousal = Number(expressionPreset?.arousal || 0);
  const speakingBoost = speechState === 'speaking' ? 0.08 : 0;

  return {
    ParamAngleX: clampLive2DParameter(valence * 6, -10, 10),
    ParamAngleY: clampLive2DParameter((-arousal * 8) + (speechState === 'completed' ? 1.5 : 0), -10, 10),
    ParamAngleZ: clampLive2DParameter(valence * 2.5, -10, 10),
    ParamBodyAngleX: clampLive2DParameter(valence * 3.5, -8, 8),
    ParamBodyAngleY: clampLive2DParameter(-arousal * 2.5, -4, 4),
    ParamMouthForm: clampLive2DParameter((valence * 0.7) + 0.1, -1, 1),
    ParamBrowLY: clampLive2DParameter((0.1 - valence * 0.18) + arousal * 0.08, -1, 1),
    ParamBrowRY: clampLive2DParameter((0.1 - valence * 0.18) + arousal * 0.08, -1, 1),
    ParamEyeLSmile: clampLive2DParameter(Math.max(0, valence * 0.55 + speakingBoost), 0, 1),
    ParamEyeRSmile: clampLive2DParameter(Math.max(0, valence * 0.55 + speakingBoost), 0, 1),
    ParamEyeLOpen: clampLive2DParameter(0.92 - arousal * 0.12 + speakingBoost * 0.2, 0.55, 1.2),
    ParamEyeROpen: clampLive2DParameter(0.92 - arousal * 0.12 + speakingBoost * 0.2, 0.55, 1.2),
  };
}

function resolveLive2DMouthOpenY(mouthState, speechState) {
  if (speechState !== 'speaking') {
    return 0;
  }
  if (mouthState === 'wide') {
    return 1;
  }
  if (mouthState === 'round') {
    return 0.72;
  }
  if (mouthState === 'small') {
    return 0.42;
  }
  return 0.16;
}

export default function Live2DAvatar({
  className = '',
  corePath = '/live2d/live2dcubismcore.min.js',
  fallback = null,
  idleMotion = null,
  modelPath,
  mouthState = 'closed',
  speechState = 'idle',
  expressionPreset = null,
}) {
  const rootRef = useRef(null);
  const canvasHostRef = useRef(null);
  const appRef = useRef(null);
  const modelRef = useRef(null);
  const [renderState, setRenderState] = useState(() => (canRenderLive2D() ? 'loading' : 'fallback'));

  useEffect(() => {
    const live2DModel = modelRef.current;
    const coreModel = live2DModel?.internalModel?.coreModel;
    if (!live2DModel || !coreModel) {
      return;
    }

    const expressionValues = buildLive2DExpressionMap(expressionPreset, speechState);
    Object.entries(expressionValues).forEach(([parameterId, value]) => {
      coreModel.setParameterValueById(parameterId, value);
    });
    coreModel.setParameterValueById('ParamMouthOpenY', resolveLive2DMouthOpenY(mouthState, speechState));
  }, [expressionPreset, mouthState, speechState]);

  useEffect(() => {
    let cancelled = false;
    let stopObservingViewport = () => {};
    const canvasHostElement = canvasHostRef.current;

    async function mountLive2D() {
      if (!modelPath || !rootRef.current || !canvasHostElement || !canRenderLive2D()) {
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
        clearElementChildren(canvasHostElement);
        canvasHostElement.appendChild(app.canvas);

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
      clearElementChildren(canvasHostElement);
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
