import React, { useEffect, useRef, useState } from 'react';
import {
  canRenderLive2D,
  configureLive2DModelMatrix,
  createLive2DProjection,
  loadLive2DArrayBuffer,
  loadLive2DModelSetting,
  loadLive2DRuntime,
  loadLive2DTexture,
  measureLive2DViewport,
  observeLive2DViewport,
  resolveLive2DModelBasePath,
  resizeLive2DCanvas,
} from './live2dHelpers';

const LIVE2D_PARAMETER_ALIASES = Object.freeze({
  ParamAngleX: ['ParamAngleX', 'PARAM_ANGLE_X'],
  ParamAngleY: ['ParamAngleY', 'PARAM_ANGLE_Y'],
  ParamAngleZ: ['ParamAngleZ', 'PARAM_ANGLE_Z'],
  ParamBodyAngleX: ['ParamBodyAngleX', 'PARAM_BODY_ANGLE_X'],
  ParamBodyAngleY: ['ParamBodyAngleY', 'PARAM_BODY_ANGLE_Y'],
  ParamBodyAngleZ: ['ParamBodyAngleZ', 'PARAM_BODY_ANGLE_Z'],
  ParamMouthForm: ['ParamMouthForm', 'PARAM_MOUTH_FORM'],
  ParamMouthOpenY: ['ParamMouthOpenY', 'PARAM_MOUTH_OPEN_Y'],
  ParamBrowLY: ['ParamBrowLY', 'PARAM_BROW_L_Y'],
  ParamBrowRY: ['ParamBrowRY', 'PARAM_BROW_R_Y'],
  ParamBrowLX: ['ParamBrowLX', 'PARAM_BROW_L_X'],
  ParamBrowRX: ['ParamBrowRX', 'PARAM_BROW_R_X'],
  ParamBrowLAngle: ['ParamBrowLAngle', 'PARAM_BROW_L_ANGLE'],
  ParamBrowRAngle: ['ParamBrowRAngle', 'PARAM_BROW_R_ANGLE'],
  ParamBrowLForm: ['ParamBrowLForm', 'PARAM_BROW_L_FORM'],
  ParamBrowRForm: ['ParamBrowRForm', 'PARAM_BROW_R_FORM'],
  ParamEyeLSmile: ['ParamEyeLSmile', 'PARAM_EYE_L_SMILE'],
  ParamEyeRSmile: ['ParamEyeRSmile', 'PARAM_EYE_R_SMILE'],
  ParamEyeLOpen: ['ParamEyeLOpen', 'PARAM_EYE_L_OPEN'],
  ParamEyeROpen: ['ParamEyeROpen', 'PARAM_EYE_R_OPEN'],
  ParamEyeBallX: ['ParamEyeBallX', 'PARAM_EYE_BALL_X'],
  ParamEyeBallY: ['ParamEyeBallY', 'PARAM_EYE_BALL_Y'],
  ParamEyeBallForm: ['ParamEyeBallForm', 'PARAM_EYE_BALL_FORM'],
  ParamCheek: ['ParamCheek', 'PARAM_CHEEK'],
  ParamBreath: ['ParamBreath', 'PARAM_BREATH'],
  ParamHairFront: ['ParamHairFront', 'PARAM_HAIR_FRONT'],
  ParamHairSide: ['ParamHairSide', 'PARAM_HAIR_SIDE'],
  ParamHairBack: ['ParamHairBack', 'PARAM_HAIR_BACK'],
});

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

function resolveLive2DAssetUrl(baseAssetUrl, assetPath) {
  const normalizedAssetPath = String(assetPath || '').trim();
  if (!normalizedAssetPath) {
    return '';
  }
  try {
    return new URL(normalizedAssetPath, baseAssetUrl).toString();
  } catch (error) {
    return normalizedAssetPath;
  }
}

function resolveLive2DMatrixFitOptions(fitOptions) {
  if (!fitOptions || typeof fitOptions !== 'object') {
    return {};
  }

  if (
    Number.isFinite(fitOptions.logicalWidth)
    || Number.isFinite(fitOptions.logicalHeight)
    || Number.isFinite(fitOptions.centerX)
    || Number.isFinite(fitOptions.centerY)
  ) {
    return fitOptions;
  }

  const scaleMultiplier = Number.isFinite(fitOptions.scaleMultiplier) ? fitOptions.scaleMultiplier : 1;
  const anchorX = Number.isFinite(fitOptions.anchorX) ? fitOptions.anchorX : 0.5;
  const anchorY = Number.isFinite(fitOptions.anchorY) ? fitOptions.anchorY : 0.5;
  const offsetX = Number.isFinite(fitOptions.offsetX) ? fitOptions.offsetX : 0;
  const offsetY = Number.isFinite(fitOptions.offsetY) ? fitOptions.offsetY : 0;

  return {
    logicalHeight: 2.9 * scaleMultiplier,
    centerX: (0.5 - anchorX) * 0.6,
    centerY: -0.45 + ((0.5 - anchorY) * 1.1),
    offsetX,
    offsetY: offsetY * 1.5,
  };
}

class CubismCanvasModel {
  constructor(runtime) {
    this.runtime = runtime;
    this.userModel = new runtime.CubismUserModel();
    this.modelSetting = null;
    this.baseAssetUrl = '';
    this.parameterIdCache = new Map();
    this.resolvedParameterNameCache = new Map();
    this.motionCache = new Map();
    this.textureIds = [];
    this.eyeBlinkIds = [];
    this.lipSyncIds = [];
    this.expressionValues = {};
    this.mouthOpenY = 0;
  }

  getModel() {
    return this.userModel?.getModel?.() || null;
  }

  getModelMatrix() {
    return this.userModel?.getModelMatrix?.() || null;
  }

  getRenderer() {
    return this.userModel?.getRenderer?.() || null;
  }

  getId(parameterName) {
    if (!this.parameterIdCache.has(parameterName)) {
      this.parameterIdCache.set(
        parameterName,
        this.runtime.CubismFramework.getIdManager().getId(parameterName),
      );
    }
    return this.parameterIdCache.get(parameterName);
  }

  resolveParameterName(parameterName) {
    if (this.resolvedParameterNameCache.has(parameterName)) {
      return this.resolvedParameterNameCache.get(parameterName);
    }

    const model = this.getModel();
    if (!model) {
      return null;
    }

    const candidates = LIVE2D_PARAMETER_ALIASES[parameterName] || [parameterName];
    const resolvedParameterName = candidates.find((candidate) => (
      model.getParameterIndex(this.getId(candidate)) < model.getParameterCount()
    )) || null;

    this.resolvedParameterNameCache.set(parameterName, resolvedParameterName);
    return resolvedParameterName;
  }

  hasParameter(parameterName) {
    return Boolean(this.resolveParameterName(parameterName));
  }

  getResolvedParameterId(parameterName) {
    const resolvedParameterName = this.resolveParameterName(parameterName);
    return resolvedParameterName ? this.getId(resolvedParameterName) : null;
  }

  setExpressionValues(expressionValues, mouthOpenY) {
    this.expressionValues = expressionValues && typeof expressionValues === 'object' ? expressionValues : {};
    this.mouthOpenY = Number.isFinite(mouthOpenY) ? mouthOpenY : 0;
  }

  resolveAssetPath(assetPath) {
    return resolveLive2DAssetUrl(this.baseAssetUrl, assetPath);
  }

  buildBreathParameters() {
    const breathConfig = [
      ['ParamAngleX', 0, 1.8, 6.2, 0.25],
      ['ParamAngleY', 0, 0.5, 6.8, 0.2],
      ['ParamAngleZ', 0, 0.8, 7.1, 0.15],
      ['ParamBodyAngleX', 0, 1.1, 6.6, 0.25],
      ['ParamBodyAngleY', 0, 0.35, 6.9, 0.15],
    ];

    return breathConfig.reduce((items, [parameterName, offset, peak, cycle, weight]) => {
      if (!this.hasParameter(parameterName)) {
        return items;
      }
      const parameterId = this.getResolvedParameterId(parameterName);
      if (!parameterId) {
        return items;
      }
      items.push(
        new this.runtime.BreathParameterData(parameterId, offset, peak, cycle, weight),
      );
      return items;
    }, []);
  }

  async load({ gl, idleMotion, modelPath, viewport }) {
    this.baseAssetUrl = new URL(resolveLive2DModelBasePath(modelPath), window.location.origin).toString();
    this.modelSetting = await loadLive2DModelSetting(modelPath, this.runtime.CubismModelSettingJson);

    const modelBuffer = await loadLive2DArrayBuffer(
      this.resolveAssetPath(this.modelSetting.getModelFileName()),
    );
    this.userModel.loadModel(modelBuffer);

    const model = this.getModel();
    if (!model) {
      throw new Error('Live2D model did not initialize correctly.');
    }

    this.eyeBlinkIds = [];
    for (let index = 0; index < this.modelSetting.getEyeBlinkParameterCount(); index += 1) {
      const parameterId = this.modelSetting.getEyeBlinkParameterId(index);
      if (parameterId) {
        this.eyeBlinkIds.push(parameterId);
      }
    }

    this.lipSyncIds = [];
    for (let index = 0; index < this.modelSetting.getLipSyncParameterCount(); index += 1) {
      const parameterId = this.modelSetting.getLipSyncParameterId(index);
      if (parameterId) {
        this.lipSyncIds.push(parameterId);
      }
    }

    this.userModel._eyeBlink = this.eyeBlinkIds.length
      ? this.runtime.CubismEyeBlink.create(this.modelSetting)
      : null;

    const breathParameters = this.buildBreathParameters();
    if (breathParameters.length) {
      this.userModel._breath = this.runtime.CubismBreath.create();
      this.userModel._breath.setParameters(breathParameters);
    } else {
      this.userModel._breath = null;
    }

    const physicsFileName = this.modelSetting.getPhysicsFileName();
    if (physicsFileName) {
      const physicsBuffer = await loadLive2DArrayBuffer(this.resolveAssetPath(physicsFileName));
      this.userModel.loadPhysics(physicsBuffer, physicsBuffer.byteLength);
    }

    const poseFileName = this.modelSetting.getPoseFileName();
    if (poseFileName) {
      const poseBuffer = await loadLive2DArrayBuffer(this.resolveAssetPath(poseFileName));
      this.userModel.loadPose(poseBuffer, poseBuffer.byteLength);
    }

    this.userModel.createRenderer(viewport.width, viewport.height, 1);
    const renderer = this.getRenderer();
    if (!renderer) {
      throw new Error('Live2D renderer did not initialize correctly.');
    }
    renderer.startUp(gl);
    renderer.setIsPremultipliedAlpha(true);
    renderer.setIsCulling(false);

    this.textureIds = await Promise.all(
      Array.from({ length: this.modelSetting.getTextureCount() }, (_, index) => loadLive2DTexture(
        gl,
        this.resolveAssetPath(this.modelSetting.getTextureFileName(index)),
      )),
    );

    this.textureIds.forEach((textureId, index) => {
      renderer.bindTexture(index, textureId);
    });

    this.userModel.setRenderTargetSize(viewport.width, viewport.height);

    if (typeof idleMotion?.group === 'string' && Number.isInteger(idleMotion?.index)) {
      await this.startMotion(idleMotion.group, idleMotion.index, { loop: true, priority: 1 });
    }

    model.saveParameters();
    this.userModel.setInitialized(true);
    this.userModel.setUpdating(false);
  }

  async getOrLoadMotion(group, index, { loop = false } = {}) {
    const motionKey = `${group}:${index}`;
    if (this.motionCache.has(motionKey)) {
      return this.motionCache.get(motionKey);
    }

    const motionFileName = this.modelSetting?.getMotionFileName?.(group, index);
    if (!motionFileName) {
      return null;
    }

    const motionBuffer = await loadLive2DArrayBuffer(this.resolveAssetPath(motionFileName));
    const motion = this.userModel.loadMotion(
      motionBuffer,
      motionBuffer.byteLength,
      motionKey,
      undefined,
      undefined,
      this.modelSetting,
      group,
      index,
    );

    if (!motion) {
      return null;
    }

    if (typeof motion.setEffectIds === 'function') {
      motion.setEffectIds(this.eyeBlinkIds, this.lipSyncIds);
    }
    if (loop && typeof motion.setLoop === 'function') {
      motion.setLoop(true);
    }
    if (loop && typeof motion.setLoopFadeIn === 'function') {
      motion.setLoopFadeIn(true);
    }

    this.motionCache.set(motionKey, motion);
    return motion;
  }

  async startMotion(group, index, { loop = false, priority = 1 } = {}) {
    const motion = await this.getOrLoadMotion(group, index, { loop });
    if (!motion || !this.userModel?._motionManager) {
      return;
    }
    this.userModel._motionManager.startMotionPriority(motion, false, priority);
  }

  applyExpressionValues() {
    const model = this.getModel();
    if (!model) {
      return;
    }

    Object.entries(this.expressionValues).forEach(([parameterName, value]) => {
      if ((parameterName === 'ParamEyeLOpen' || parameterName === 'ParamEyeROpen') && this.userModel?._eyeBlink) {
        return;
      }
      const parameterId = this.getResolvedParameterId(parameterName);
      if (!parameterId) {
        return;
      }
      model.setParameterValueById(parameterId, value);
    });

    if (this.lipSyncIds.length > 0) {
      this.lipSyncIds.forEach((parameterId) => {
        model.setParameterValueById(parameterId, this.mouthOpenY);
      });
      return;
    }

    const mouthParameterId = this.getResolvedParameterId('ParamMouthOpenY');
    if (mouthParameterId) {
      model.setParameterValueById(mouthParameterId, this.mouthOpenY);
    }
  }

  update(deltaSeconds) {
    const model = this.getModel();
    if (!model) {
      return;
    }

    model.loadParameters();
    const motionUpdated = this.userModel?._motionManager?.updateMotion(model, deltaSeconds) || false;
    model.saveParameters();

    if (!motionUpdated && this.userModel?._eyeBlink) {
      this.userModel._eyeBlink.updateParameters(model, deltaSeconds);
    }

    if (this.userModel?._breath) {
      this.userModel._breath.updateParameters(model, deltaSeconds);
    }

    this.applyExpressionValues();

    if (this.userModel?._physics) {
      this.userModel._physics.evaluate(model, deltaSeconds);
    }

    if (this.userModel?._pose) {
      this.userModel._pose.updateParameters(model, deltaSeconds);
    }

    model.update();
  }

  draw(gl, viewport, fitOptions) {
    const renderer = this.getRenderer();
    const modelMatrix = this.getModelMatrix();
    if (!renderer || !modelMatrix) {
      return;
    }

    configureLive2DModelMatrix(this.userModel, this.modelSetting, resolveLive2DMatrixFitOptions(fitOptions));

    const projectionMatrix = createLive2DProjection(
      this.runtime.CubismMatrix44,
      viewport.width,
      viewport.height,
    );
    const mvpMatrix = projectionMatrix.clone();
    mvpMatrix.multiplyByMatrix(modelMatrix);

    renderer.setMvpMatrix(mvpMatrix);
    renderer.setRenderState(null, [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight]);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    renderer.drawModel(this.runtime.shaderPath);
  }

  setRenderTargetSize(width, height) {
    this.userModel?.setRenderTargetSize?.(width, height);
  }

  release(gl) {
    if (gl && this.textureIds.length) {
      this.textureIds.forEach((textureId) => {
        try {
          gl.deleteTexture(textureId);
        } catch (error) {
          // Ignore context teardown errors during cleanup.
        }
      });
    }
    this.textureIds = [];
    this.motionCache.clear();
    this.parameterIdCache.clear();
    this.resolvedParameterNameCache.clear();

    if (this.modelSetting?.release) {
      this.modelSetting.release();
    }
    this.modelSetting = null;

    this.userModel?.release?.();
    this.userModel = null;
  }
}

export default function Live2DAvatar({
  className = '',
  corePath = '/live2d/live2dcubismcore.min.js',
  fallback = null,
  fitOptions = null,
  idleMotion = null,
  modelPath,
  mouthState = 'closed',
  speechState = 'idle',
  expressionPreset = null,
}) {
  const rootRef = useRef(null);
  const canvasHostRef = useRef(null);
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const modelRef = useRef(null);
  const viewportRef = useRef({ width: 200, height: 240 });
  const animationStateRef = useRef({
    expressionPreset,
    fitOptions,
    mouthState,
    speechState,
  });
  const [renderState, setRenderState] = useState(() => (canRenderLive2D() ? 'loading' : 'fallback'));

  animationStateRef.current = {
    expressionPreset,
    fitOptions,
    mouthState,
    speechState,
  };

  useEffect(() => {
    let animationFrameId = 0;
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
        const runtime = await loadLive2DRuntime(corePath);
        if (cancelled) {
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        canvas.style.background = 'transparent';
        canvas.style.backgroundColor = 'transparent';
        canvas.setAttribute('aria-hidden', 'true');

        const gl = canvas.getContext('webgl', {
          alpha: true,
          antialias: true,
          premultipliedAlpha: true,
        })
          || canvas.getContext('experimental-webgl', {
            alpha: true,
            antialias: true,
            premultipliedAlpha: true,
          })
          || canvas.getContext('webgl2', {
            alpha: true,
            antialias: true,
            premultipliedAlpha: true,
          });

        if (!gl) {
          throw new Error('WebGL is unavailable for the Live2D canvas.');
        }

        clearElementChildren(canvasHostElement);
        canvasHostElement.appendChild(canvas);
        canvasRef.current = canvas;
        glRef.current = gl;

        viewportRef.current = measureLive2DViewport(rootRef.current);
        const initialDisplayViewport = resizeLive2DCanvas(
          canvas,
          gl,
          viewportRef.current.width,
          viewportRef.current.height,
        );

        const live2DModel = new CubismCanvasModel(runtime);
        modelRef.current = live2DModel;

        await live2DModel.load({
          gl,
          idleMotion,
          modelPath,
          viewport: initialDisplayViewport,
        });

        if (cancelled) {
          live2DModel.release(gl);
          return;
        }

        stopObservingViewport = observeLive2DViewport(rootRef.current, () => {
          if (!rootRef.current || !canvasRef.current || !glRef.current || !modelRef.current) {
            return;
          }
          viewportRef.current = measureLive2DViewport(rootRef.current);
          const nextDisplayViewport = resizeLive2DCanvas(
            canvasRef.current,
            glRef.current,
            viewportRef.current.width,
            viewportRef.current.height,
          );
          modelRef.current.setRenderTargetSize(nextDisplayViewport.width, nextDisplayViewport.height);
        });

        let lastTimestamp = window.performance?.now?.() || 0;
        const renderFrame = (timestamp) => {
          if (cancelled || !modelRef.current || !glRef.current) {
            return;
          }

          const elapsedSeconds = lastTimestamp > 0
            ? Math.min(0.1, Math.max(1 / 120, (timestamp - lastTimestamp) / 1000))
            : 1 / 60;
          lastTimestamp = timestamp;

          const nextAnimationState = animationStateRef.current;
          modelRef.current.setExpressionValues(
            buildLive2DExpressionMap(nextAnimationState.expressionPreset, nextAnimationState.speechState),
            resolveLive2DMouthOpenY(nextAnimationState.mouthState, nextAnimationState.speechState),
          );
          modelRef.current.update(elapsedSeconds);
          modelRef.current.draw(glRef.current, viewportRef.current, nextAnimationState.fitOptions);

          animationFrameId = window.requestAnimationFrame(renderFrame);
        };

        setRenderState('ready');
        animationFrameId = window.requestAnimationFrame(renderFrame);
      } catch (error) {
        console.error('Failed to initialize Live2D avatar.', error);
        setRenderState('error');
      }
    }

    void mountLive2D();

    return () => {
      cancelled = true;
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      stopObservingViewport();
      if (modelRef.current) {
        modelRef.current.release(glRef.current);
        modelRef.current = null;
      }
      canvasRef.current = null;
      glRef.current = null;
      clearElementChildren(canvasHostElement);
    };
  }, [corePath, idleMotion, modelPath]);

  const showsCanvas = renderState === 'ready';
  const showsLoadingPlaceholder = renderState === 'loading';
  const showsFallback = renderState === 'fallback' || renderState === 'error';

  return (
    <div className={`relative overflow-hidden ${className}`} data-live2d-state={renderState} ref={rootRef}>
      <div className={`absolute inset-0 transition-opacity duration-300 ${showsCanvas ? 'opacity-100' : 'opacity-0'}`} ref={canvasHostRef} />
      {showsLoadingPlaceholder ? (
        <div
          className="absolute inset-0 flex items-end justify-center"
          data-testid="live2d-loading-placeholder"
        >
          <div className="absolute inset-x-[18%] bottom-[8%] h-[62%] rounded-t-[44%] rounded-b-[12%] bg-gradient-to-b from-white/40 via-[#F4EEE5] to-[#E7F1EA] opacity-90" />
          <div className="absolute inset-x-[28%] bottom-[58%] h-[24%] rounded-full bg-white/70 blur-sm" />
          <div className="absolute inset-x-[20%] bottom-0 h-[18%] rounded-t-[44px] bg-white/55" />
        </div>
      ) : null}
      {showsFallback ? (
        <div className="absolute inset-0">
          {fallback}
        </div>
      ) : null}
    </div>
  );
}
