/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { CubismFramework } from '../live2dcubismframework';
import { CubismMath } from '../math/cubismmath';
import { CubismBlendMode, CubismTextureColor } from '../rendering/cubismrenderer';
import { CSM_ASSERT, CubismLogWarning } from '../utils/cubismdebug';
const resolveCoreColorBlendType = (propertyName, fallbackValue) => {
    const value = Live2DCubismCore[propertyName];
    return typeof value === 'number' ? value : fallbackValue;
};
const CoreColorBlendType = {
    Normal: resolveCoreColorBlendType('ColorBlendType_Normal', 0),
    AddGlow: resolveCoreColorBlendType('ColorBlendType_AddGlow', 1),
    Add: resolveCoreColorBlendType('ColorBlendType_Add', 2),
    Darken: resolveCoreColorBlendType('ColorBlendType_Darken', 3),
    Multiply: resolveCoreColorBlendType('ColorBlendType_Multiply', 4),
    ColorBurn: resolveCoreColorBlendType('ColorBlendType_ColorBurn', 5),
    LinearBurn: resolveCoreColorBlendType('ColorBlendType_LinearBurn', 6),
    Lighten: resolveCoreColorBlendType('ColorBlendType_Lighten', 7),
    Screen: resolveCoreColorBlendType('ColorBlendType_Screen', 8),
    ColorDodge: resolveCoreColorBlendType('ColorBlendType_ColorDodge', 9),
    Overlay: resolveCoreColorBlendType('ColorBlendType_Overlay', 10),
    SoftLight: resolveCoreColorBlendType('ColorBlendType_SoftLight', 11),
    HardLight: resolveCoreColorBlendType('ColorBlendType_HardLight', 12),
    LinearLight: resolveCoreColorBlendType('ColorBlendType_LinearLight', 13),
    Hue: resolveCoreColorBlendType('ColorBlendType_Hue', 14),
    Color: resolveCoreColorBlendType('ColorBlendType_Color', 15),
    AddCompatible: resolveCoreColorBlendType('ColorBlendType_AddCompatible', 16),
    MultiplyCompatible: resolveCoreColorBlendType('ColorBlendType_MultiplyCompatible', 17)
};
export const NoParentIndex = -1; // 親が取得できない場合の値を表す定数
export const NoOffscreenIndex = -1; // オフスクリーンが取得できない場合の値を表す定数
/**
 * カラーブレンドのタイプ
 */
export var CubismColorBlend;
(function (CubismColorBlend) {
    CubismColorBlend[CubismColorBlend["ColorBlend_None"] = -1] = "ColorBlend_None";
    CubismColorBlend[CubismColorBlend["ColorBlend_Normal"] = CoreColorBlendType.Normal] = "ColorBlend_Normal";
    CubismColorBlend[CubismColorBlend["ColorBlend_AddGlow"] = CoreColorBlendType.AddGlow] = "ColorBlend_AddGlow";
    CubismColorBlend[CubismColorBlend["ColorBlend_Add"] = CoreColorBlendType.Add] = "ColorBlend_Add";
    CubismColorBlend[CubismColorBlend["ColorBlend_Darken"] = CoreColorBlendType.Darken] = "ColorBlend_Darken";
    CubismColorBlend[CubismColorBlend["ColorBlend_Multiply"] = CoreColorBlendType.Multiply] = "ColorBlend_Multiply";
    CubismColorBlend[CubismColorBlend["ColorBlend_ColorBurn"] = CoreColorBlendType.ColorBurn] = "ColorBlend_ColorBurn";
    CubismColorBlend[CubismColorBlend["ColorBlend_LinearBurn"] = CoreColorBlendType.LinearBurn] = "ColorBlend_LinearBurn";
    CubismColorBlend[CubismColorBlend["ColorBlend_Lighten"] = CoreColorBlendType.Lighten] = "ColorBlend_Lighten";
    CubismColorBlend[CubismColorBlend["ColorBlend_Screen"] = CoreColorBlendType.Screen] = "ColorBlend_Screen";
    CubismColorBlend[CubismColorBlend["ColorBlend_ColorDodge"] = CoreColorBlendType.ColorDodge] = "ColorBlend_ColorDodge";
    CubismColorBlend[CubismColorBlend["ColorBlend_Overlay"] = CoreColorBlendType.Overlay] = "ColorBlend_Overlay";
    CubismColorBlend[CubismColorBlend["ColorBlend_SoftLight"] = CoreColorBlendType.SoftLight] = "ColorBlend_SoftLight";
    CubismColorBlend[CubismColorBlend["ColorBlend_HardLight"] = CoreColorBlendType.HardLight] = "ColorBlend_HardLight";
    CubismColorBlend[CubismColorBlend["ColorBlend_LinearLight"] = CoreColorBlendType.LinearLight] = "ColorBlend_LinearLight";
    CubismColorBlend[CubismColorBlend["ColorBlend_Hue"] = CoreColorBlendType.Hue] = "ColorBlend_Hue";
    CubismColorBlend[CubismColorBlend["ColorBlend_Color"] = CoreColorBlendType.Color] = "ColorBlend_Color";
    // Cubism 5.2以前
    CubismColorBlend[CubismColorBlend["ColorBlend_AddCompatible"] = CoreColorBlendType.AddCompatible] = "ColorBlend_AddCompatible";
    CubismColorBlend[CubismColorBlend["ColorBlend_MultiplyCompatible"] = CoreColorBlendType.MultiplyCompatible] = "ColorBlend_MultiplyCompatible";
})(CubismColorBlend || (CubismColorBlend = {}));
/**
 * アルファブレンドのタイプ
 */
export var CubismAlphaBlend;
(function (CubismAlphaBlend) {
    CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_None"] = -1] = "AlphaBlend_None";
    CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_Over"] = 0] = "AlphaBlend_Over";
    CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_Atop"] = 1] = "AlphaBlend_Atop";
    CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_Out"] = 2] = "AlphaBlend_Out";
    CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_ConjointOver"] = 3] = "AlphaBlend_ConjointOver";
    CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_DisjointOver"] = 4] = "AlphaBlend_DisjointOver";
})(CubismAlphaBlend || (CubismAlphaBlend = {}));
/**
 * オブジェクトのタイプ
 */
export var CubismModelObjectType;
(function (CubismModelObjectType) {
    CubismModelObjectType[CubismModelObjectType["CubismModelObjectType_Drawable"] = 0] = "CubismModelObjectType_Drawable";
    CubismModelObjectType[CubismModelObjectType["CubismModelObjectType_Parts"] = 1] = "CubismModelObjectType_Parts";
})(CubismModelObjectType || (CubismModelObjectType = {}));
/**
 * Structure for managing the override of parameter repetition settings
 */
export class ParameterRepeatData {
    /**
     * Constructor
     *
     * @param isOverridden whether to be overriden
     * @param isParameterRepeated override flag for settings
     */
    constructor(isOverridden = false, isParameterRepeated = false) {
        this.isOverridden = isOverridden;
        this.isParameterRepeated = isParameterRepeated;
    }
}
/**
 * (deprecated) SDK側から与えられたDrawableの乗算色・スクリーン色上書きフラグと
 * その色を保持する構造体
 */
export class DrawableColorData {
    constructor(isOverridden = false, color = new CubismTextureColor()) {
        this.isOverridden = isOverridden;
        this.color = color;
    }
    get isOverwritten() {
        return this.isOverridden;
    }
}
/**
 * (deprecated) テクスチャの色をRGBAで扱うための構造体
 */
export class PartColorData {
    constructor(isOverridden = false, color = new CubismTextureColor()) {
        this.isOverridden = isOverridden;
        this.color = color;
    }
    get isOverwritten() {
        return this.isOverridden;
    }
}
/**
 * SDK側から与えられた描画オブジェクトの乗算色・スクリーン色上書きフラグと
 * その色を保持する構造体
 */
export class ColorData {
    constructor(isOverridden = false, color = new CubismTextureColor()) {
        this.isOverridden = isOverridden;
        this.color = color;
    }
}
/**
 * (deprecated) テクスチャのカリング設定を管理するための構造体
 */
export class DrawableCullingData {
    /**
     * コンストラクタ
     *
     * @param isOverridden
     * @param isCulling
     */
    constructor(isOverridden = false, isCulling = false) {
        this.isOverridden = isOverridden;
        this.isCulling = isCulling;
    }
    get isOverwritten() {
        return this.isOverridden;
    }
}
/**
 * テクスチャのカリング設定を管理するための構造体
 */
export class CullingData {
    /**
     * コンストラクタ
     *
     * @param isOverridden
     * @param isCulling
     */
    constructor(isOverridden = false, isCulling = false) {
        this.isOverridden = isOverridden;
        this.isCulling = isCulling;
    }
}
/**
 * パーツ子描画オブジェクト情報構造体
 */
export class PartChildDrawObjects {
    constructor(drawableIndices = new Array(), offscreenIndices = new Array()) {
        this.drawableIndices = drawableIndices;
        this.offscreenIndices = offscreenIndices;
    }
}
/**
 * オブジェクト情報構造体
 */
export class CubismModelObjectInfo {
    constructor(objectIndex, objectType) {
        this.objectIndex = objectIndex;
        this.objectType = objectType;
    }
}
/**
 * パーツ情報管理構造体
 */
export class CubismModelPartInfo {
    constructor(objects = new Array(), childDrawObjects = new PartChildDrawObjects()) {
        this.objects = objects;
        this.childDrawObjects = childDrawObjects;
    }
    // 子オブジェクト数を返す関数
    getChildObjectCount() {
        return this.objects.length;
    }
}
/**
 * モデル
 *
 * Mocデータから生成されるモデルのクラス。
 */
export class CubismModel {
    /**
     * Offscreen情報を取得する
     */
    getOffscreens() {
        return this._model.offscreens || {
            count: 0,
            opacities: [],
            masks: [],
            maskCounts: [],
            ownerIndices: [],
            blendModes: [],
            constantFlags: [],
            multiplyColors: [],
            screenColors: []
        };
    }
    /**
     * モデルのパラメータの更新
     */
    update() {
        // Update model
        this._model.update();
        this._model.drawables.resetDynamicFlags();
    }
    /**
     * PixelsPerUnitを取得する
     * @return PixelsPerUnit
     */
    getPixelsPerUnit() {
        if (this._model == null) {
            return 0.0;
        }
        return this._model.canvasinfo.PixelsPerUnit;
    }
    /**
     * キャンバスの幅を取得する
     */
    getCanvasWidth() {
        if (this._model == null) {
            return 0.0;
        }
        return (this._model.canvasinfo.CanvasWidth / this._model.canvasinfo.PixelsPerUnit);
    }
    /**
     * キャンバスの高さを取得する
     */
    getCanvasHeight() {
        if (this._model == null) {
            return 0.0;
        }
        return (this._model.canvasinfo.CanvasHeight / this._model.canvasinfo.PixelsPerUnit);
    }
    /**
     * パラメータを保存する
     */
    saveParameters() {
        const parameterCount = this._model.parameters.count;
        const savedParameterCount = this._savedParameters.length;
        for (let i = 0; i < parameterCount; ++i) {
            if (i < savedParameterCount) {
                this._savedParameters[i] = this._parameterValues[i];
            }
            else {
                this._savedParameters.push(this._parameterValues[i]);
            }
        }
    }
    /**
     * Drawableの乗算色を取得する
     *
     * @param drawableIndex Drawableのインデックス
     *
     * @return 指定した描画オブジェクトの乗算色(RGBA)
     */
    getMultiplyColor(drawableIndex) {
        if (this.getOverrideFlagForModelMultiplyColors() ||
            this.getOverrideFlagForDrawableMultiplyColors(drawableIndex)) {
            return this._userDrawableMultiplyColors[drawableIndex].color;
        }
        return this.getDrawableMultiplyColor(drawableIndex);
    }
    /**
     * Drawableのスクリーン色を取得する
     *
     * @param drawableIndex Drawableのインデックス
     *
     * @return 指定した描画オブジェクトのスクリーン色(RGBA)
     */
    getScreenColor(drawableIndex) {
        if (this.getOverrideFlagForModelScreenColors() ||
            this.getOverrideFlagForDrawableScreenColors(drawableIndex)) {
            return this._userDrawableScreenColors[drawableIndex].color;
        }
        return this.getDrawableScreenColor(drawableIndex);
    }
    /**
     * Drawableの乗算色をセットする
     *
     * @param drawableIndex Drawableのインデックス
     * @param color 設定する乗算色(CubismTextureColor)
     */
    setMultiplyColorByTextureColor(drawableIndex, color) {
        this.setMultiplyColorByRGBA(drawableIndex, color.r, color.g, color.b, color.a);
    }
    /**
     * Drawableの乗算色をセットする
     *
     * @param drawableIndex Drawableのインデックス
     * @param r 設定する乗算色のR値
     * @param g 設定する乗算色のG値
     * @param b 設定する乗算色のB値
     * @param a 設定する乗算色のA値
     */
    setMultiplyColorByRGBA(drawableIndex, r, g, b, a = 1.0) {
        this._userDrawableMultiplyColors[drawableIndex].color.r = r;
        this._userDrawableMultiplyColors[drawableIndex].color.g = g;
        this._userDrawableMultiplyColors[drawableIndex].color.b = b;
        this._userDrawableMultiplyColors[drawableIndex].color.a = a;
    }
    /**
     * Drawableのスクリーン色をセットする
     *
     * @param drawableIndex Drawableのインデックス
     * @param color 設定するスクリーン色(CubismTextureColor)
     */
    setScreenColorByTextureColor(drawableIndex, color) {
        this.setScreenColorByRGBA(drawableIndex, color.r, color.g, color.b, color.a);
    }
    /**
     * Drawableのスクリーン色をセットする
     *
     * @param drawableIndex Drawableのインデックス
     * @param r 設定するスクリーン色のR値
     * @param g 設定するスクリーン色のG値
     * @param b 設定するスクリーン色のB値
     * @param a 設定するスクリーン色のA値
     */
    setScreenColorByRGBA(drawableIndex, r, g, b, a = 1.0) {
        this._userDrawableScreenColors[drawableIndex].color.r = r;
        this._userDrawableScreenColors[drawableIndex].color.g = g;
        this._userDrawableScreenColors[drawableIndex].color.b = b;
        this._userDrawableScreenColors[drawableIndex].color.a = a;
    }
    /**
     * partの乗算色を取得する
     *
     * @param partIndex partのインデックス
     * @return 指定したpartの乗算色
     */
    getPartMultiplyColor(partIndex) {
        return this._userPartMultiplyColors[partIndex].color;
    }
    /**
     * partのスクリーン色を取得する
     *
     * @param partIndex partのインデックス
     * @return 指定したpartのスクリーン色
     */
    getPartScreenColor(partIndex) {
        return this._userPartScreenColors[partIndex].color;
    }
    /**
     * partのOverrideColor setter関数
     *
     * @param partIndex partのインデックス
     * @param r 設定する色のR値
     * @param g 設定する色のG値
     * @param b 設定する色のB値
     * @param a 設定する色のA値
     * @param partColors 設定するpartのカラーデータ配列
     * @param drawableColors partに関連するDrawableのカラーデータ配列
     */
    setPartColor(partIndex, r, g, b, a, partColors, drawableColors) {
        partColors[partIndex].color.r = r;
        partColors[partIndex].color.g = g;
        partColors[partIndex].color.b = b;
        partColors[partIndex].color.a = a;
        if (partColors[partIndex].isOverridden) {
            for (let i = 0; i < this._partChildDrawables[partIndex].length; ++i) {
                const drawableIndex = this._partChildDrawables[partIndex][i];
                drawableColors[drawableIndex].color.r = r;
                drawableColors[drawableIndex].color.g = g;
                drawableColors[drawableIndex].color.b = b;
                drawableColors[drawableIndex].color.a = a;
            }
        }
    }
    /**
     * 乗算色をセットする
     *
     * @param partIndex partのインデックス
     * @param color 設定する乗算色(CubismTextureColor)
     */
    setPartMultiplyColorByTextureColor(partIndex, color) {
        this.setPartMultiplyColorByRGBA(partIndex, color.r, color.g, color.b, color.a);
    }
    /**
     * 乗算色をセットする
     *
     * @param partIndex partのインデックス
     * @param r 設定する乗算色のR値
     * @param g 設定する乗算色のG値
     * @param b 設定する乗算色のB値
     * @param a 設定する乗算色のA値
     */
    setPartMultiplyColorByRGBA(partIndex, r, g, b, a) {
        this.setPartColor(partIndex, r, g, b, a, this._userPartMultiplyColors, this._userDrawableMultiplyColors);
    }
    /**
     * スクリーン色をセットする
     *
     * @param partIndex partのインデックス
     * @param color 設定するスクリーン色(CubismTextureColor)
     */
    setPartScreenColorByTextureColor(partIndex, color) {
        this.setPartScreenColorByRGBA(partIndex, color.r, color.g, color.b, color.a);
    }
    /**
     * スクリーン色をセットする
     *
     * @param partIndex partのインデックス
     * @param r 設定するスクリーン色のR値
     * @param g 設定するスクリーン色のG値
     * @param b 設定するスクリーン色のB値
     * @param a 設定するスクリーン色のA値
     */
    setPartScreenColorByRGBA(partIndex, r, g, b, a) {
        this.setPartColor(partIndex, r, g, b, a, this._userPartScreenColors, this._userDrawableScreenColors);
    }
    /**
     * Offscreenの乗算色を取得する
     *
     * @param offscreenIndex Offscreenのインデックス
     *
     * @return 指定した描画オブジェクトの乗算色(RGBA)
     */
    getMultiplyColorOffscreen(offscreenIndex) {
        if (this.getOverrideFlagForModelMultiplyColors() ||
            this.getOverrideFlagForOffscreenMultiplyColors(offscreenIndex)) {
            return this._userOffscreenMultiplyColors[offscreenIndex].color;
        }
        return this.getOffscreenMultiplyColor(offscreenIndex);
    }
    /**
     * Offscreenのスクリーン色を取得する
     *
     * @param offscreenIndex Offscreenのインデックス
     *
     * @return 指定した描画オブジェクトのスクリーン色(RGBA)
     */
    getScreenColorOffscreen(offscreenIndex) {
        if (this.getOverrideFlagForModelScreenColors() ||
            this.getOverrideFlagForOffscreenScreenColors(offscreenIndex)) {
            return this._userOffscreenScreenColors[offscreenIndex].color;
        }
        return this.getOffscreenScreenColor(offscreenIndex);
    }
    /**
     * Offscreenの乗算色をセットする
     *
     * @param offscreenIndex Offscreenのインデックス
     * @param color 設定する乗算色(CubismTextureColor)
     */
    setMultiplyColorByTextureColorOffscreen(offscreenIndex, color) {
        this.setMultiplyColorByRGBAOffscreen(offscreenIndex, color.r, color.g, color.b, color.a);
    }
    /**
     * Offscreenの乗算色をセットする
     *
     * @param offscreenIndex Offscreenのインデックス
     * @param r 設定する乗算色のR値
     * @param g 設定する乗算色のG値
     * @param b 設定する乗算色のB値
     * @param a 設定する乗算色のA値
     */
    setMultiplyColorByRGBAOffscreen(offscreenIndex, r, g, b, a = 1.0) {
        this._userOffscreenMultiplyColors[offscreenIndex].color.r = r;
        this._userOffscreenMultiplyColors[offscreenIndex].color.g = g;
        this._userOffscreenMultiplyColors[offscreenIndex].color.b = b;
        this._userOffscreenMultiplyColors[offscreenIndex].color.a = a;
    }
    /**
     * Offscreenのスクリーン色をセットする
     *
     * @param offscreenIndex Offscreenのインデックス
     * @param color 設定するスクリーン色(CubismTextureColor)
     */
    setScreenColorByTextureColorOffscreen(offscreenIndex, color) {
        this.setScreenColorByRGBAOffscreen(offscreenIndex, color.r, color.g, color.b, color.a);
    }
    /**
     * Offscreenのスクリーン色をセットする
     *
     * @param offscreenIndex Offscreenのインデックス
     * @param r 設定するスクリーン色のR値
     * @param g 設定するスクリーン色のG値
     * @param b 設定するスクリーン色のB値
     * @param a 設定するスクリーン色のA値
     */
    setScreenColorByRGBAOffscreen(offscreenIndex, r, g, b, a = 1.0) {
        this._userOffscreenScreenColors[offscreenIndex].color.r = r;
        this._userOffscreenScreenColors[offscreenIndex].color.g = g;
        this._userOffscreenScreenColors[offscreenIndex].color.b = b;
        this._userOffscreenScreenColors[offscreenIndex].color.a = a;
    }
    /**
     * Checks whether parameter repetition is performed for the entire model.
     *
     * @return true if parameter repetition is performed for the entire model; otherwise returns false.
     */
    getOverrideFlagForModelParameterRepeat() {
        return this._isOverriddenParameterRepeat;
    }
    /**
     * Sets whether parameter repetition is performed for the entire model.
     * Use true to perform parameter repetition for the entire model, or false to not perform it.
     */
    setOverrideFlagForModelParameterRepeat(isRepeat) {
        this._isOverriddenParameterRepeat = isRepeat;
    }
    /**
     * Returns the flag indicating whether to override the parameter repeat.
     *
     * @param parameterIndex Parameter index
     *
     * @return true if the parameter repeat is overridden, false otherwise.
     */
    getOverrideFlagForParameterRepeat(parameterIndex) {
        return this._userParameterRepeatDataList[parameterIndex].isOverridden;
    }
    /**
     * Sets the flag indicating whether to override the parameter repeat.
     *
     * @param parameterIndex Parameter index
     * @param value true if it is to be overridden; otherwise, false.
     */
    setOverrideFlagForParameterRepeat(parameterIndex, value) {
        this._userParameterRepeatDataList[parameterIndex].isOverridden = value;
    }
    /**
     * Returns the repeat flag.
     *
     * @param parameterIndex Parameter index
     *
     * @return true if repeating, false otherwise.
     */
    getRepeatFlagForParameterRepeat(parameterIndex) {
        return this._userParameterRepeatDataList[parameterIndex]
            .isParameterRepeated;
    }
    /**
     * Sets the repeat flag.
     *
     * @param parameterIndex Parameter index
     * @param value true to enable repeating, false otherwise.
     */
    setRepeatFlagForParameterRepeat(parameterIndex, value) {
        this._userParameterRepeatDataList[parameterIndex].isParameterRepeated =
            value;
    }
    /**
     * SDKから指定したモデルの乗算色を上書きするか
     *
     * @deprecated 名称変更のため非推奨 getOverrideFlagForModelMultiplyColors() に置き換え
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverwriteFlagForModelMultiplyColors() {
        CubismLogWarning('getOverwriteFlagForModelMultiplyColors() is a deprecated function. Please use getOverrideFlagForModelMultiplyColors().');
        return this.getOverrideFlagForModelMultiplyColors();
    }
    /**
     * SDKから指定したモデルの乗算色を上書きするか
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverrideFlagForModelMultiplyColors() {
        return this._isOverriddenModelMultiplyColors;
    }
    /**
     * SDKから指定したモデルのスクリーン色を上書きするか
     *
     * @deprecated 名称変更のため非推奨 getOverrideFlagForModelScreenColors() に置き換え
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverwriteFlagForModelScreenColors() {
        CubismLogWarning('getOverwriteFlagForModelScreenColors() is a deprecated function. Please use getOverrideFlagForModelScreenColors().');
        return this.getOverrideFlagForModelScreenColors();
    }
    /**
     * SDKから指定したモデルのスクリーン色を上書きするか
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverrideFlagForModelScreenColors() {
        return this._isOverriddenModelScreenColors;
    }
    /**
     * SDKから指定したモデルの乗算色を上書きするかセットする
     *
     * @deprecated 名称変更のため非推奨 setOverrideFlagForModelMultiplyColors(value: boolean) に置き換え
     *
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteFlagForModelMultiplyColors(value) {
        CubismLogWarning('setOverwriteFlagForModelMultiplyColors(value: boolean) is a deprecated function. Please use setOverrideFlagForModelMultiplyColors(value: boolean).');
        this.setOverrideFlagForModelMultiplyColors(value);
    }
    /**
     * SDKから指定したモデルの乗算色を上書きするかセットする
     *
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideFlagForModelMultiplyColors(value) {
        this._isOverriddenModelMultiplyColors = value;
    }
    /**
     * SDKから指定したモデルのスクリーン色を上書きするかセットする
     *
     * @deprecated 名称変更のため非推奨 setOverrideFlagForModelScreenColors(value: boolean) に置き換え
     *
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteFlagForModelScreenColors(value) {
        CubismLogWarning('setOverwriteFlagForModelScreenColors(value: boolean) is a deprecated function. Please use setOverrideFlagForModelScreenColors(value: boolean).');
        this.setOverrideFlagForModelScreenColors(value);
    }
    /**
     * SDKから指定したモデルのスクリーン色を上書きするかセットする
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideFlagForModelScreenColors(value) {
        this._isOverriddenModelScreenColors = value;
    }
    /**
     * SDKから指定したDrawableIndexの乗算色を上書きするか
     *
     * @deprecated 名称変更のため非推奨 getOverrideFlagForDrawableMultiplyColors(drawableIndex: number) に置き換え
     *
     * @param drawableIndex drawableのインデックス
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverwriteFlagForDrawableMultiplyColors(drawableIndex) {
        CubismLogWarning('getOverwriteFlagForDrawableMultiplyColors(drawableIndex: number) is a deprecated function. Please use getOverrideFlagForDrawableMultiplyColors(drawableIndex: number).');
        return this.getOverrideFlagForDrawableMultiplyColors(drawableIndex);
    }
    /**
     * SDKから指定したDrawableIndexの乗算色を上書きするか
     *
     * @param drawableIndex drawableのインデックス
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverrideFlagForDrawableMultiplyColors(drawableIndex) {
        return this._userDrawableMultiplyColors[drawableIndex].isOverridden;
    }
    /**
     * SDKから指定したDrawableIndexのスクリーン色を上書きするか
     *
     * @deprecated 名称変更のため非推奨 getOverrideFlagForDrawableScreenColors(drawableIndex: number) に置き換え
     *
     * @param drawableIndex drawableのインデックス
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverwriteFlagForDrawableScreenColors(drawableIndex) {
        CubismLogWarning('getOverwriteFlagForDrawableScreenColors(drawableIndex: number) is a deprecated function. Please use getOverrideFlagForDrawableScreenColors(drawableIndex: number).');
        return this.getOverrideFlagForDrawableScreenColors(drawableIndex);
    }
    /**
     * SDKから指定したDrawableIndexのスクリーン色を上書きするか
     *
     * @param drawableIndex drawableのインデックス
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverrideFlagForDrawableScreenColors(drawableIndex) {
        return this._userDrawableScreenColors[drawableIndex].isOverridden;
    }
    /**
     * SDKから指定したDrawableIndexの乗算色を上書きするかセットする
     *
     * @deprecated 名称変更のため非推奨 setOverrideFlagForDrawableMultiplyColors(drawableIndex: number, value: boolean) に置き換え
     *
     * @param drawableIndex drawableのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteFlagForDrawableMultiplyColors(drawableIndex, value) {
        CubismLogWarning('setOverwriteFlagForDrawableMultiplyColors(drawableIndex: number, value: boolean) is a deprecated function. Please use setOverrideFlagForDrawableMultiplyColors(drawableIndex: number, value: boolean).');
        this.setOverrideFlagForDrawableMultiplyColors(drawableIndex, value);
    }
    /**
     * SDKから指定したDrawableIndexの乗算色を上書きするかセットする
     *
     * @param drawableIndex drawableのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideFlagForDrawableMultiplyColors(drawableIndex, value) {
        this._userDrawableMultiplyColors[drawableIndex].isOverridden = value;
    }
    /**
     * SDKから指定したDrawableIndexのスクリーン色を上書きするかセットする
     *
     * @deprecated 名称変更のため非推奨 setOverrideFlagForDrawableScreenColors(drawableIndex: number, value: boolean) に置き換え
     *
     * @param drawableIndex drawableのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteFlagForDrawableScreenColors(drawableIndex, value) {
        CubismLogWarning('setOverwriteFlagForDrawableScreenColors(drawableIndex: number, value: boolean) is a deprecated function. Please use setOverrideFlagForDrawableScreenColors(drawableIndex: number, value: boolean).');
        this.setOverrideFlagForDrawableScreenColors(drawableIndex, value);
    }
    /**
     * SDKから指定したDrawableIndexのスクリーン色を上書きするかセットする
     *
     * @param drawableIndex drawableのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideFlagForDrawableScreenColors(drawableIndex, value) {
        this._userDrawableScreenColors[drawableIndex].isOverridden = value;
    }
    /**
     * SDKからpartの乗算色を上書きするか
     *
     * @deprecated 名称変更のため非推奨 getOverrideColorForPartMultiplyColors(partIndex: number) に置き換え
     *
     * @param partIndex partのインデックス
     *
     * @return true    ->  SDKからの情報を優先する
     *          false   ->  モデルに設定されている色情報を使用
     */
    getOverwriteColorForPartMultiplyColors(partIndex) {
        CubismLogWarning('getOverwriteColorForPartMultiplyColors(partIndex: number) is a deprecated function. Please use getOverrideColorForPartMultiplyColors(partIndex: number).');
        return this.getOverrideColorForPartMultiplyColors(partIndex);
    }
    /**
     * SDKからpartの乗算色を上書きするか
     *
     * @param partIndex partのインデックス
     *
     * @return true    ->  SDKからの情報を優先する
     *          false   ->  モデルに設定されている色情報を使用
     */
    getOverrideColorForPartMultiplyColors(partIndex) {
        return this._userPartMultiplyColors[partIndex].isOverridden;
    }
    /**
     * SDKからpartのスクリーン色を上書きするか
     *
     * @deprecated 名称変更のため非推奨 getOverrideColorForPartScreenColors(partIndex: number) に置き換え
     *
     * @param partIndex partのインデックス
     *
     * @return true    ->  SDKからの情報を優先する
     *          false   ->  モデルに設定されている色情報を使用
     */
    getOverwriteColorForPartScreenColors(partIndex) {
        CubismLogWarning('getOverwriteColorForPartScreenColors(partIndex: number) is a deprecated function. Please use getOverrideColorForPartScreenColors(partIndex: number).');
        return this.getOverrideColorForPartScreenColors(partIndex);
    }
    /**
     * SDKからpartのスクリーン色を上書きするか
     *
     * @param partIndex partのインデックス
     *
     * @return true    ->  SDKからの情報を優先する
     *          false   ->  モデルに設定されている色情報を使用
     */
    getOverrideColorForPartScreenColors(partIndex) {
        return this._userPartScreenColors[partIndex].isOverridden;
    }
    /**
     * partのOverrideFlag setter関数
     *
     * @deprecated 名称変更のため非推奨 setOverrideColorForPartColors(
     * partIndex: number,
     * value: boolean,
     * partColors: Array<PartColorData>,
     * drawableColors: Array<DrawableColorData>) に置き換え
     *
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     * @param partColors 設定するpartのカラーデータ配列
     * @param drawableColors partに関連するDrawableのカラーデータ配列
     */
    setOverwriteColorForPartColors(partIndex, value, partColors, drawableColors) {
        CubismLogWarning('setOverwriteColorForPartColors(partIndex: number, value: boolean, partColors: Array<PartColorData>, drawableColors: Array<DrawableColorData>) is a deprecated function. Please use setOverrideColorForPartColors(partIndex: number, value: boolean, partColors: Array<PartColorData>, drawableColors: Array<DrawableColorData>).');
        this.setOverrideColorForPartColors(partIndex, value, partColors, drawableColors);
    }
    /**
     * partのOverrideFlag setter関数
     *
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     * @param partColors 設定するpartのカラーデータ配列
     * @param drawableColors partに関連するDrawableのカラーデータ配列
     */
    setOverrideColorForPartColors(partIndex, value, partColors, drawableColors) {
        partColors[partIndex].isOverridden = value;
        for (let i = 0; i < this._partChildDrawables[partIndex].length; ++i) {
            const drawableIndex = this._partChildDrawables[partIndex][i];
            drawableColors[drawableIndex].isOverridden = value;
            if (value) {
                drawableColors[drawableIndex].color.r = partColors[partIndex].color.r;
                drawableColors[drawableIndex].color.g = partColors[partIndex].color.g;
                drawableColors[drawableIndex].color.b = partColors[partIndex].color.b;
                drawableColors[drawableIndex].color.a = partColors[partIndex].color.a;
            }
        }
    }
    /**
     * SDKからpartのスクリーン色を上書きするかをセットする
     *
     * @deprecated 名称変更のため非推奨 setOverrideColorForPartMultiplyColors(partIndex: number, value: boolean) に置き換え
     *
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteColorForPartMultiplyColors(partIndex, value) {
        CubismLogWarning('setOverwriteColorForPartMultiplyColors(partIndex: number, value: boolean) is a deprecated function. Please use setOverrideColorForPartMultiplyColors(partIndex: number, value: boolean).');
        this.setOverrideColorForPartMultiplyColors(partIndex, value);
    }
    /**
     * SDKからpartのスクリーン色を上書きするかをセットする
     *
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideColorForPartMultiplyColors(partIndex, value) {
        this._userPartMultiplyColors[partIndex].isOverridden = value;
        this.setOverrideColorForPartColors(partIndex, value, this._userPartMultiplyColors, this._userDrawableMultiplyColors);
    }
    /**
     * SDKからpartのスクリーン色を上書きするかをセットする
     *
     * @deprecated 名称変更のため非推奨 setOverrideColorForPartScreenColors(partIndex: number, value: boolean) に置き換え
     *
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteColorForPartScreenColors(partIndex, value) {
        CubismLogWarning('setOverwriteColorForPartScreenColors(partIndex: number, value: boolean) is a deprecated function. Please use setOverrideColorForPartScreenColors(partIndex: number, value: boolean).');
        this.setOverrideColorForPartScreenColors(partIndex, value);
    }
    /**
     * SDKからpartのスクリーン色を上書きするかをセットする
     *
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideColorForPartScreenColors(partIndex, value) {
        this._userPartScreenColors[partIndex].isOverridden = value;
        this.setOverrideColorForPartColors(partIndex, value, this._userPartScreenColors, this._userDrawableScreenColors);
    }
    /**
     * SDKから指定したOffscreenIndexの乗算色を上書きするか
     *
     * @param offscreenIndex offscreenのインデックス
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverrideFlagForOffscreenMultiplyColors(offscreenIndex) {
        return this._userOffscreenMultiplyColors[offscreenIndex].isOverridden;
    }
    /**
     * SDKから指定したOffscreenIndexのスクリーン色を上書きするか
     *
     * @param offscreenIndex offscreenのインデックス
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverrideFlagForOffscreenScreenColors(offscreemIndex) {
        return this._userOffscreenScreenColors[offscreemIndex].isOverridden;
    }
    /**
     * SDKから指定したDrawableIndexの乗算色を上書きするかセットする
     *
     * @param offscreenIndex offscreenのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideFlagForOffscreenMultiplyColors(offscreenIndex, value) {
        this._userOffscreenMultiplyColors[offscreenIndex].isOverridden = value;
    }
    /**
     * SDKから指定したOffscreenIndexのスクリーン色を上書きするかセットする
     *
     * @param offscreenIndex offscreenのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideFlagForOffscreenScreenColors(offscreenIndex, value) {
        this._userOffscreenScreenColors[offscreenIndex].isOverridden = value;
    }
    /**
     * Drawableのカリング情報を取得する。
     *
     * @param   drawableIndex   Drawableのインデックス
     *
     * @return  Drawableのカリング情報
     */
    getDrawableCulling(drawableIndex) {
        if (this.getOverrideFlagForModelCullings() ||
            this.getOverrideFlagForDrawableCullings(drawableIndex)) {
            return this._userDrawableCullings[drawableIndex].isCulling;
        }
        const constantFlags = this._model.drawables.constantFlags;
        return !Live2DCubismCore.Utils.hasIsDoubleSidedBit(constantFlags[drawableIndex]);
    }
    /**
     * Drawableのカリング情報を設定する。
     *
     * @param drawableIndex Drawableのインデックス
     * @param isCulling カリング情報
     */
    setDrawableCulling(drawableIndex, isCulling) {
        this._userDrawableCullings[drawableIndex].isCulling = isCulling;
    }
    /**
     * Offscreenのカリング情報を取得する。
     *
     * @param   offscreenIndex   Offscreenのインデックス
     *
     * @return  Offscreenのカリング情報
     */
    getOffscreenCulling(offscreenIndex) {
        if (this.getOverrideFlagForModelCullings() ||
            this.getOverrideFlagForOffscreenCullings(offscreenIndex)) {
            return this._userOffscreenCullings[offscreenIndex].isCulling;
        }
        const constantFlags = this.getOffscreens().constantFlags;
        return !Live2DCubismCore.Utils.hasIsDoubleSidedBit(constantFlags[offscreenIndex]);
    }
    /**
     * Offscreenのカリング設定を設定する。
     *
     * @param offscreenIndex Offscreenのインデックス
     * @param isCulling カリング情報
     */
    setOffscreenCulling(offscreenIndex, isCulling) {
        this._userOffscreenCullings[offscreenIndex].isCulling = isCulling;
    }
    /**
     * SDKからモデル全体のカリング設定を上書きするか。
     *
     * @deprecated 名称変更のため非推奨 getOverrideFlagForModelCullings() に置き換え
     *
     * @return  true    ->  SDK上のカリング設定を使用
     *          false   ->  モデルのカリング設定を使用
     */
    getOverwriteFlagForModelCullings() {
        CubismLogWarning('getOverwriteFlagForModelCullings() is a deprecated function. Please use getOverrideFlagForModelCullings().');
        return this.getOverrideFlagForModelCullings();
    }
    /**
     * SDKからモデル全体のカリング設定を上書きするか。
     *
     * @return  true    ->  SDK上のカリング設定を使用
     *          false   ->  モデルのカリング設定を使用
     */
    getOverrideFlagForModelCullings() {
        return this._isOverriddenCullings;
    }
    /**
     * SDKからモデル全体のカリング設定を上書きするかを設定する。
     *
     * @deprecated 名称変更のため非推奨 setOverrideFlagForModelCullings(isOverriddenCullings: boolean) に置き換え
     *
     * @param isOveriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
     */
    setOverwriteFlagForModelCullings(isOverriddenCullings) {
        CubismLogWarning('setOverwriteFlagForModelCullings(isOverriddenCullings: boolean) is a deprecated function. Please use setOverrideFlagForModelCullings(isOverriddenCullings: boolean).');
        this.setOverrideFlagForModelCullings(isOverriddenCullings);
    }
    /**
     * SDKからモデル全体のカリング設定を上書きするかを設定する。
     *
     * @param isOverriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
     */
    setOverrideFlagForModelCullings(isOverriddenCullings) {
        this._isOverriddenCullings = isOverriddenCullings;
    }
    /**
     *
     * @deprecated 名称変更のため非推奨 getOverrideFlagForDrawableCullings(drawableIndex: number) に置き換え
     *
     * @param drawableIndex Drawableのインデックス
     * @return  true    ->  SDK上のカリング設定を使用
     *          false   ->  モデルのカリング設定を使用
     */
    getOverwriteFlagForDrawableCullings(drawableIndex) {
        CubismLogWarning('getOverwriteFlagForDrawableCullings(drawableIndex: number) is a deprecated function. Please use getOverrideFlagForDrawableCullings(drawableIndex: number).');
        return this.getOverrideFlagForDrawableCullings(drawableIndex);
    }
    /**
     *
     * @param drawableIndex Drawableのインデックス
     * @return  true    ->  SDK上のカリング設定を使用
     *          false   ->  モデルのカリング設定を使用
     */
    getOverrideFlagForDrawableCullings(drawableIndex) {
        return this._userDrawableCullings[drawableIndex].isOverridden;
    }
    /**
     * @param offscreenIndex Offscreenのインデックス
     * @return  true    ->  SDK上のカリング設定を使用
     *          false   ->  モデルのカリング設定を使用
     */
    getOverrideFlagForOffscreenCullings(offscreenIndex) {
        return this._userOffscreenCullings[offscreenIndex].isOverridden;
    }
    /**
     *
     * @deprecated 名称変更のため非推奨 setOverrideFlagForDrawableCullings(drawableIndex: number, isOverriddenCullings: bolean) に置き換え
     *
     * @param drawableIndex Drawableのインデックス
     * @param isOverriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
     */
    setOverwriteFlagForDrawableCullings(drawableIndex, isOverriddenCullings) {
        CubismLogWarning('setOverwriteFlagForDrawableCullings(drawableIndex: number, isOverriddenCullings: boolean) is a deprecated function. Please use setOverrideFlagForDrawableCullings(drawableIndex: number, isOverriddenCullings: boolean).');
        this.setOverrideFlagForDrawableCullings(drawableIndex, isOverriddenCullings);
    }
    /**
     *
     * @param drawableIndex Drawableのインデックス
     * @param isOverriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
     */
    setOverrideFlagForDrawableCullings(drawableIndex, isOverriddenCullings) {
        this._userDrawableCullings[drawableIndex].isOverridden =
            isOverriddenCullings;
    }
    /**
     * モデルの不透明度を取得する
     *
     * @return 不透明度の値
     */
    getModelOapcity() {
        return this._modelOpacity;
    }
    /**
     * モデルの不透明度を設定する
     *
     * @param value 不透明度の値
     */
    setModelOapcity(value) {
        this._modelOpacity = value;
    }
    /**
     * モデルを取得
     */
    getModel() {
        return this._model;
    }
    /**
     * パーツのインデックスを取得
     * @param partId パーツのID
     * @return パーツのインデックス
     */
    getPartIndex(partId) {
        let partIndex;
        const partCount = this._model.parts.count;
        for (partIndex = 0; partIndex < partCount; ++partIndex) {
            if (partId == this._partIds[partIndex]) {
                return partIndex;
            }
        }
        // モデルに存在していない場合、非存在パーツIDリスト内にあるかを検索し、そのインデックスを返す
        if (this._notExistPartId.has(partId)) {
            return this._notExistPartId.get(partId);
        }
        // 非存在パーツIDリストにない場合、新しく要素を追加する
        partIndex = partCount + this._notExistPartId.size;
        this._notExistPartId.set(partId, partIndex);
        this._notExistPartOpacities.set(partIndex, null);
        return partIndex;
    }
    /**
     * パーツのIDを取得する。
     *
     * @param partIndex 取得するパーツのインデックス
     * @return パーツのID
     */
    getPartId(partIndex) {
        const partId = this._model.parts.ids[partIndex];
        return CubismFramework.getIdManager().getId(partId);
    }
    /**
     * パーツの個数の取得
     * @return パーツの個数
     */
    getPartCount() {
        const partCount = this._model.parts.count;
        return partCount;
    }
    /**
     * パーツの親パーツインデックスのリストを取得
     *
     * @return パーツの親パーツインデックスのリスト
     */
    getPartParentPartIndices() {
        const parentIndices = this._model.parts.parentIndices;
        return parentIndices;
    }
    /**
     * パーツの不透明度の設定(Index)
     * @param partIndex パーツのインデックス
     * @param opacity 不透明度
     */
    setPartOpacityByIndex(partIndex, opacity) {
        if (this._notExistPartOpacities.has(partIndex)) {
            this._notExistPartOpacities.set(partIndex, opacity);
            return;
        }
        // インデックスの範囲内検知
        CSM_ASSERT(0 <= partIndex && partIndex < this.getPartCount());
        this._partOpacities[partIndex] = opacity;
    }
    /**
     * パーツの不透明度の設定(Id)
     * @param partId パーツのID
     * @param opacity パーツの不透明度
     */
    setPartOpacityById(partId, opacity) {
        // 高速化のためにPartIndexを取得できる機構になっているが、外部からの設定の時は呼び出し頻度が低いため不要
        const index = this.getPartIndex(partId);
        if (index < 0) {
            return; // パーツがないのでスキップ
        }
        this.setPartOpacityByIndex(index, opacity);
    }
    /**
     * パーツの不透明度の取得(index)
     * @param partIndex パーツのインデックス
     * @return パーツの不透明度
     */
    getPartOpacityByIndex(partIndex) {
        if (this._notExistPartOpacities.has(partIndex)) {
            // モデルに存在しないパーツIDの場合、非存在パーツリストから不透明度を返す。
            return this._notExistPartOpacities.get(partIndex);
        }
        // インデックスの範囲内検知
        CSM_ASSERT(0 <= partIndex && partIndex < this.getPartCount());
        return this._partOpacities[partIndex];
    }
    /**
     * パーツの不透明度の取得(id)
     * @param partId パーツのＩｄ
     * @return パーツの不透明度
     */
    getPartOpacityById(partId) {
        // 高速化のためにPartIndexを取得できる機構になっているが、外部からの設定の時は呼び出し頻度が低いため不要
        const index = this.getPartIndex(partId);
        if (index < 0) {
            return 0; // パーツが無いのでスキップ
        }
        return this.getPartOpacityByIndex(index);
    }
    /**
     * パラメータのインデックスの取得
     * @param パラメータID
     * @return パラメータのインデックス
     */
    getParameterIndex(parameterId) {
        let parameterIndex;
        const idCount = this._model.parameters.count;
        for (parameterIndex = 0; parameterIndex < idCount; ++parameterIndex) {
            if (parameterId != this._parameterIds[parameterIndex]) {
                continue;
            }
            return parameterIndex;
        }
        // モデルに存在していない場合、非存在パラメータIDリスト内を検索し、そのインデックスを返す
        if (this._notExistParameterId.has(parameterId)) {
            return this._notExistParameterId.get(parameterId);
        }
        // 非存在パラメータIDリストにない場合新しく要素を追加する
        parameterIndex =
            this._model.parameters.count + this._notExistParameterId.size;
        this._notExistParameterId.set(parameterId, parameterIndex);
        this._notExistParameterValues.set(parameterIndex, null);
        return parameterIndex;
    }
    /**
     * パラメータの個数の取得
     * @return パラメータの個数
     */
    getParameterCount() {
        return this._model.parameters.count;
    }
    /**
     * パラメータの種類の取得
     * @param parameterIndex パラメータのインデックス
     * @return csmParameterType_Normal -> 通常のパラメータ
     *          csmParameterType_BlendShape -> ブレンドシェイプパラメータ
     */
    getParameterType(parameterIndex) {
        return this._model.parameters.types[parameterIndex];
    }
    /**
     * パラメータの最大値の取得
     * @param parameterIndex パラメータのインデックス
     * @return パラメータの最大値
     */
    getParameterMaximumValue(parameterIndex) {
        return this._model.parameters.maximumValues[parameterIndex];
    }
    /**
     * パラメータの最小値の取得
     * @param parameterIndex パラメータのインデックス
     * @return パラメータの最小値
     */
    getParameterMinimumValue(parameterIndex) {
        return this._model.parameters.minimumValues[parameterIndex];
    }
    /**
     * パラメータのデフォルト値の取得
     * @param parameterIndex パラメータのインデックス
     * @return パラメータのデフォルト値
     */
    getParameterDefaultValue(parameterIndex) {
        return this._model.parameters.defaultValues[parameterIndex];
    }
    /**
     * 指定したパラメータindexのIDを取得
     *
     * @param parameterIndex パラメータのインデックス
     * @return パラメータID
     */
    getParameterId(parameterIndex) {
        return CubismFramework.getIdManager().getId(this._model.parameters.ids[parameterIndex]);
    }
    /**
     * パラメータの値の取得
     * @param parameterIndex    パラメータのインデックス
     * @return パラメータの値
     */
    getParameterValueByIndex(parameterIndex) {
        if (this._notExistParameterValues.has(parameterIndex)) {
            return this._notExistParameterValues.get(parameterIndex);
        }
        // インデックスの範囲内検知
        CSM_ASSERT(0 <= parameterIndex && parameterIndex < this.getParameterCount());
        return this._parameterValues[parameterIndex];
    }
    /**
     * パラメータの値の取得
     * @param parameterId    パラメータのID
     * @return パラメータの値
     */
    getParameterValueById(parameterId) {
        // 高速化のためにparameterIndexを取得できる機構になっているが、外部からの設定の時は呼び出し頻度が低いため不要
        const parameterIndex = this.getParameterIndex(parameterId);
        return this.getParameterValueByIndex(parameterIndex);
    }
    /**
     * パラメータの値の設定
     * @param parameterIndex パラメータのインデックス
     * @param value パラメータの値
     * @param weight 重み
     */
    setParameterValueByIndex(parameterIndex, value, weight = 1.0) {
        if (this._notExistParameterValues.has(parameterIndex)) {
            this._notExistParameterValues.set(parameterIndex, weight == 1
                ? value
                : this._notExistParameterValues.get(parameterIndex) * (1 - weight) +
                    value * weight);
            return;
        }
        // インデックスの範囲内検知
        CSM_ASSERT(0 <= parameterIndex && parameterIndex < this.getParameterCount());
        if (this.isRepeat(parameterIndex)) {
            value = this.getParameterRepeatValue(parameterIndex, value);
        }
        else {
            value = this.getParameterClampValue(parameterIndex, value);
        }
        this._parameterValues[parameterIndex] =
            weight == 1
                ? value
                : (this._parameterValues[parameterIndex] =
                    this._parameterValues[parameterIndex] * (1 - weight) +
                        value * weight);
    }
    /**
     * パラメータの値の設定
     * @param parameterId パラメータのID
     * @param value パラメータの値
     * @param weight 重み
     */
    setParameterValueById(parameterId, value, weight = 1.0) {
        const index = this.getParameterIndex(parameterId);
        this.setParameterValueByIndex(index, value, weight);
    }
    /**
     * パラメータの値の加算(index)
     * @param parameterIndex パラメータインデックス
     * @param value 加算する値
     * @param weight 重み
     */
    addParameterValueByIndex(parameterIndex, value, weight = 1.0) {
        this.setParameterValueByIndex(parameterIndex, this.getParameterValueByIndex(parameterIndex) + value * weight);
    }
    /**
     * パラメータの値の加算(id)
     * @param parameterId パラメータＩＤ
     * @param value 加算する値
     * @param weight 重み
     */
    addParameterValueById(parameterId, value, weight = 1.0) {
        const index = this.getParameterIndex(parameterId);
        this.addParameterValueByIndex(index, value, weight);
    }
    /**
     * Gets whether the parameter has the repeat setting.
     *
     * @param parameterIndex Parameter index
     *
     * @return true if it is set, otherwise returns false.
     */
    isRepeat(parameterIndex) {
        if (this._notExistParameterValues.has(parameterIndex)) {
            return false;
        }
        // In-index range detection
        CSM_ASSERT(0 <= parameterIndex && parameterIndex < this.getParameterCount());
        let isRepeat;
        // Determines whether to perform parameter repeat processing
        if (this._isOverriddenParameterRepeat ||
            this._userParameterRepeatDataList[parameterIndex].isOverridden) {
            // Use repeat information set on the SDK side
            isRepeat =
                this._userParameterRepeatDataList[parameterIndex].isParameterRepeated;
        }
        else {
            // Use repeat information set in Editor
            isRepeat = this._model.parameters.repeats[parameterIndex] != 0;
        }
        return isRepeat;
    }
    /**
     * Returns the calculated result ensuring the value falls within the parameter's range.
     *
     * @param parameterIndex Parameter index
     * @param value Parameter value
     *
     * @return a value that falls within the parameter’s range. If the parameter does not exist, returns it as is.
     */
    getParameterRepeatValue(parameterIndex, value) {
        if (this._notExistParameterValues.has(parameterIndex)) {
            return value;
        }
        // In-index range detection
        CSM_ASSERT(0 <= parameterIndex && parameterIndex < this.getParameterCount());
        const maxValue = this._model.parameters.maximumValues[parameterIndex];
        const minValue = this._model.parameters.minimumValues[parameterIndex];
        const valueSize = maxValue - minValue;
        if (maxValue < value) {
            const overValue = CubismMath.mod(value - maxValue, valueSize);
            if (!Number.isNaN(overValue)) {
                value = minValue + overValue;
            }
            else {
                value = maxValue;
            }
        }
        if (value < minValue) {
            const overValue = CubismMath.mod(minValue - value, valueSize);
            if (!Number.isNaN(overValue)) {
                value = maxValue - overValue;
            }
            else {
                value = minValue;
            }
        }
        return value;
    }
    /**
     * Returns the result of clamping the value to ensure it falls within the parameter's range.
     *
     * @param parameterIndex Parameter index
     * @param value Parameter value
     *
     * @return the clamped value. If the parameter does not exist, returns it as is.
     */
    getParameterClampValue(parameterIndex, value) {
        if (this._notExistParameterValues.has(parameterIndex)) {
            return value;
        }
        // In-index range detection
        CSM_ASSERT(0 <= parameterIndex && parameterIndex < this.getParameterCount());
        const maxValue = this._model.parameters.maximumValues[parameterIndex];
        const minValue = this._model.parameters.minimumValues[parameterIndex];
        return CubismMath.clamp(value, minValue, maxValue);
    }
    /**
     * Returns the repeat of the parameter.
     *
     * @param parameterIndex Parameter index
     *
     * @return the raw data parameter repeat from the Cubism Core.
     */
    getParameterRepeats(parameterIndex) {
        return this._model.parameters.repeats[parameterIndex] != 0;
    }
    /**
     * パラメータの値の乗算
     * @param parameterId パラメータのID
     * @param value 乗算する値
     * @param weight 重み
     */
    multiplyParameterValueById(parameterId, value, weight = 1.0) {
        const index = this.getParameterIndex(parameterId);
        this.multiplyParameterValueByIndex(index, value, weight);
    }
    /**
     * パラメータの値の乗算
     * @param parameterIndex パラメータのインデックス
     * @param value 乗算する値
     * @param weight 重み
     */
    multiplyParameterValueByIndex(parameterIndex, value, weight = 1.0) {
        this.setParameterValueByIndex(parameterIndex, this.getParameterValueByIndex(parameterIndex) *
            (1.0 + (value - 1.0) * weight));
    }
    /**
     * Drawableのインデックスの取得
     * @param drawableId DrawableのID
     * @return Drawableのインデックス
     */
    getDrawableIndex(drawableId) {
        const drawableCount = this._model.drawables.count;
        for (let drawableIndex = 0; drawableIndex < drawableCount; ++drawableIndex) {
            if (this._drawableIds[drawableIndex] == drawableId) {
                return drawableIndex;
            }
        }
        return -1;
    }
    /**
     * Drawableの個数の取得
     * @return drawableの個数
     */
    getDrawableCount() {
        const drawableCount = this._model.drawables.count;
        return drawableCount;
    }
    /**
     * DrawableのIDを取得する
     * @param drawableIndex Drawableのインデックス
     * @return drawableのID
     */
    getDrawableId(drawableIndex) {
        const parameterIds = this._model.drawables.ids;
        return CubismFramework.getIdManager().getId(parameterIds[drawableIndex]);
    }
    /**
     * Drawableの描画順リストの取得
     * @return Drawableの描画順リスト
     */
    getRenderOrders() {
        if (typeof this._model.getRenderOrders === 'function') {
            return this._model.getRenderOrders();
        }
        return this._model.drawables.renderOrders;
    }
    /**
     * @deprecated
     * 関数名が誤っていたため、代替となる getDrawableTextureIndex を追加し、この関数は非推奨となりました。
     *
     * Drawableのテクスチャインデックスリストの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableのテクスチャインデックスリスト
     */
    getDrawableTextureIndices(drawableIndex) {
        return this.getDrawableTextureIndex(drawableIndex);
    }
    /**
     * Drawableのテクスチャインデックスの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableのテクスチャインデックス
     */
    getDrawableTextureIndex(drawableIndex) {
        const textureIndices = this._model.drawables.textureIndices;
        return textureIndices[drawableIndex];
    }
    /**
     * DrawableのVertexPositionsの変化情報の取得
     *
     * 直近のCubismModel.update関数でDrawableの頂点情報が変化したかを取得する。
     *
     * @param   drawableIndex   Drawableのインデックス
     * @return  true    Drawableの頂点情報が直近のCubismModel.update関数で変化した
     *          false   Drawableの頂点情報が直近のCubismModel.update関数で変化していない
     */
    getDrawableDynamicFlagVertexPositionsDidChange(drawableIndex) {
        const dynamicFlags = this._model.drawables.dynamicFlags;
        return Live2DCubismCore.Utils.hasVertexPositionsDidChangeBit(dynamicFlags[drawableIndex]);
    }
    /**
     * Drawableの頂点インデックスの個数の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点インデックスの個数
     */
    getDrawableVertexIndexCount(drawableIndex) {
        const indexCounts = this._model.drawables.indexCounts;
        return indexCounts[drawableIndex];
    }
    /**
     * Drawableの頂点の個数の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点の個数
     */
    getDrawableVertexCount(drawableIndex) {
        const vertexCounts = this._model.drawables.vertexCounts;
        return vertexCounts[drawableIndex];
    }
    /**
     * Drawableの頂点リストの取得
     * @param drawableIndex drawableのインデックス
     * @return drawableの頂点リスト
     */
    getDrawableVertices(drawableIndex) {
        return this.getDrawableVertexPositions(drawableIndex);
    }
    /**
     * Drawableの頂点インデックスリストの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点インデックスリスト
     */
    getDrawableVertexIndices(drawableIndex) {
        const indicesArray = this._model.drawables.indices;
        return indicesArray[drawableIndex];
    }
    /**
     * Drawableの頂点リストの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点リスト
     */
    getDrawableVertexPositions(drawableIndex) {
        const verticesArray = this._model.drawables.vertexPositions;
        return verticesArray[drawableIndex];
    }
    /**
     * Drawableの頂点のUVリストの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点UVリスト
     */
    getDrawableVertexUvs(drawableIndex) {
        const uvsArray = this._model.drawables.vertexUvs;
        return uvsArray[drawableIndex];
    }
    /**
     * Drawableの不透明度の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの不透明度
     */
    getDrawableOpacity(drawableIndex) {
        const opacities = this._model.drawables.opacities;
        return opacities[drawableIndex];
    }
    /**
     * Drawableの乗算色の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの乗算色(RGBA)
     * スクリーン色はRGBAで取得されるが、Aは必ず0
     */
    getDrawableMultiplyColor(drawableIndex) {
        if (this._drawableMultiplyColors == null) {
            this._drawableMultiplyColors = new Array(this._model.drawables.count);
            this._drawableMultiplyColors.fill(new CubismTextureColor());
        }
        const multiplyColors = this._model.drawables.multiplyColors;
        const index = drawableIndex * 4;
        this._drawableMultiplyColors[drawableIndex].r = multiplyColors[index];
        this._drawableMultiplyColors[drawableIndex].g = multiplyColors[index + 1];
        this._drawableMultiplyColors[drawableIndex].b = multiplyColors[index + 2];
        this._drawableMultiplyColors[drawableIndex].a = multiplyColors[index + 3];
        return this._drawableMultiplyColors[drawableIndex];
    }
    /**
     * Drawableのスクリーン色の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableのスクリーン色(RGBA)
     * スクリーン色はRGBAで取得されるが、Aは必ず0
     */
    getDrawableScreenColor(drawableIndex) {
        if (this._drawableScreenColors == null) {
            this._drawableScreenColors = new Array(this._model.drawables.count);
            this._drawableScreenColors.fill(new CubismTextureColor());
        }
        const screenColors = this._model.drawables.screenColors;
        const index = drawableIndex * 4;
        this._drawableScreenColors[drawableIndex].r = screenColors[index];
        this._drawableScreenColors[drawableIndex].g = screenColors[index + 1];
        this._drawableScreenColors[drawableIndex].b = screenColors[index + 2];
        this._drawableScreenColors[drawableIndex].a = screenColors[index + 3];
        return this._drawableScreenColors[drawableIndex];
    }
    /**
     * Offscreenの乗算色の取得
     * @param offscreenIndex Offscreenのインデックス
     * @return Offscreenの乗算色(RGBA)
     * スクリーン色はRGBAで取得されるが、Aは必ず0
     */
    getOffscreenMultiplyColor(offscreenIndex) {
        if (this._offscreenMultiplyColors == null) {
            this._offscreenMultiplyColors = new Array(this.getOffscreens().count);
            this._offscreenMultiplyColors.fill(new CubismTextureColor());
        }
        const multiplyColors = this.getOffscreens().multiplyColors;
        const index = offscreenIndex * 4;
        this._offscreenMultiplyColors[offscreenIndex].r = multiplyColors[index];
        this._offscreenMultiplyColors[offscreenIndex].g = multiplyColors[index + 1];
        this._offscreenMultiplyColors[offscreenIndex].b = multiplyColors[index + 2];
        this._offscreenMultiplyColors[offscreenIndex].a = multiplyColors[index + 3];
        return this._offscreenMultiplyColors[offscreenIndex];
    }
    /**
     * Offscreenのスクリーン色の取得
     * @param offscreenIndex Offscreenのインデックス
     * @return Offscreenのスクリーン色(RGBA)
     * スクリーン色はRGBAで取得されるが、Aは必ず0
     */
    getOffscreenScreenColor(offscreenIndex) {
        if (this._offscreenScreenColors == null) {
            this._offscreenScreenColors = new Array(this.getOffscreens().count);
            this._offscreenScreenColors.fill(new CubismTextureColor());
        }
        const screenColors = this.getOffscreens().screenColors;
        const index = offscreenIndex * 4;
        this._offscreenScreenColors[offscreenIndex].r = screenColors[index];
        this._offscreenScreenColors[offscreenIndex].g = screenColors[index + 1];
        this._offscreenScreenColors[offscreenIndex].b = screenColors[index + 2];
        this._offscreenScreenColors[offscreenIndex].a = screenColors[index + 3];
        return this._offscreenScreenColors[offscreenIndex];
    }
    /**
     * Drawableの親パーツのインデックスの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの親パーツのインデックス
     */
    getDrawableParentPartIndex(drawableIndex) {
        return this._model.drawables.parentPartIndices[drawableIndex];
    }
    /**
     * Drawableのブレンドモードを取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableのブレンドモード
     */
    getDrawableBlendMode(drawableIndex) {
        const constantFlags = this._model.drawables.constantFlags;
        return Live2DCubismCore.Utils.hasBlendAdditiveBit(constantFlags[drawableIndex])
            ? CubismBlendMode.CubismBlendMode_Additive
            : Live2DCubismCore.Utils.hasBlendMultiplicativeBit(constantFlags[drawableIndex])
                ? CubismBlendMode.CubismBlendMode_Multiplicative
                : CubismBlendMode.CubismBlendMode_Normal;
    }
    /**
     * Drawableのカラーブレンドの取得(Cubism 5.3 以降)
     *
     * @param drawableIndex Drawableのインデックス
     * @return Drawableのカラーブレンド
     */
    getDrawableColorBlend(drawableIndex) {
        // キャッシュ
        if (this._drawableColorBlends[drawableIndex] ==
            CubismColorBlend.ColorBlend_None) {
            const blendModes = this._model.drawables.blendModes;
            if (blendModes && blendModes[drawableIndex] != null) {
                this._drawableColorBlends[drawableIndex] = blendModes[drawableIndex] & 0xff;
            }
            else {
                switch (this.getDrawableBlendMode(drawableIndex)) {
                    case CubismBlendMode.CubismBlendMode_Additive:
                        this._drawableColorBlends[drawableIndex] =
                            CubismColorBlend.ColorBlend_AddCompatible;
                        break;
                    case CubismBlendMode.CubismBlendMode_Multiplicative:
                        this._drawableColorBlends[drawableIndex] =
                            CubismColorBlend.ColorBlend_MultiplyCompatible;
                        break;
                    case CubismBlendMode.CubismBlendMode_Normal:
                    default:
                        this._drawableColorBlends[drawableIndex] =
                            CubismColorBlend.ColorBlend_Normal;
                        break;
                }
            }
        }
        return this._drawableColorBlends[drawableIndex];
    }
    /**
     * Drawableのアルファブレンドの取得(Cubism 5.3 以降)
     *
     * @param drawableIndex Drawableのインデックス
     * @return Drawableのアルファブレンド
     */
    getDrawableAlphaBlend(drawableIndex) {
        // キャッシュ
        if (this._drawableAlphaBlends[drawableIndex] ==
            CubismAlphaBlend.AlphaBlend_None) {
            const blendModes = this._model.drawables.blendModes;
            if (blendModes && blendModes[drawableIndex] != null) {
                this._drawableAlphaBlends[drawableIndex] =
                    (blendModes[drawableIndex] >> 8) & 0xff;
            }
            else {
                this._drawableAlphaBlends[drawableIndex] = CubismAlphaBlend.AlphaBlend_Over;
            }
        }
        return this._drawableAlphaBlends[drawableIndex];
    }
    /**
     * Drawableのマスクの反転使用の取得
     *
     * Drawableのマスク使用時の反転設定を取得する。
     * マスクを使用しない場合は無視される。
     *
     * @param drawableIndex Drawableのインデックス
     * @return Drawableの反転設定
     */
    getDrawableInvertedMaskBit(drawableIndex) {
        const constantFlags = this._model.drawables.constantFlags;
        return Live2DCubismCore.Utils.hasIsInvertedMaskBit(constantFlags[drawableIndex]);
    }
    /**
     * Drawableのクリッピングマスクリストの取得
     * @return Drawableのクリッピングマスクリスト
     */
    getDrawableMasks() {
        const masks = this._model.drawables.masks;
        return masks;
    }
    /**
     * Drawableのクリッピングマスクの個数リストの取得
     * @return Drawableのクリッピングマスクの個数リスト
     */
    getDrawableMaskCounts() {
        const maskCounts = this._model.drawables.maskCounts;
        return maskCounts;
    }
    /**
     * クリッピングマスクの使用状態
     *
     * @return true クリッピングマスクを使用している
     * @return false クリッピングマスクを使用していない
     */
    isUsingMasking() {
        for (let d = 0; d < this._model.drawables.count; ++d) {
            if (this._model.drawables.maskCounts[d] <= 0) {
                continue;
            }
            return true;
        }
        return false;
    }
    /**
     * Offscreenでクリッピングマスクを使用しているかどうかを取得
     *
     * @return true クリッピングマスクをオフスクリーンで使用している
     */
    isUsingMaskingForOffscreen() {
        for (let d = 0; d < this.getOffscreenCount(); ++d) {
            if (this.getOffscreens().maskCounts[d] <= 0) {
                continue;
            }
            return true;
        }
        return false;
    }
    /**
     * Drawableの表示情報を取得する
     *
     * @param drawableIndex Drawableのインデックス
     * @return true Drawableが表示
     * @return false Drawableが非表示
     */
    getDrawableDynamicFlagIsVisible(drawableIndex) {
        const dynamicFlags = this._model.drawables.dynamicFlags;
        return Live2DCubismCore.Utils.hasIsVisibleBit(dynamicFlags[drawableIndex]);
    }
    /**
     * DrawableのDrawOrderの変化情報の取得
     *
     * 直近のCubismModel.update関数でdrawableのdrawOrderが変化したかを取得する。
     * drawOrderはartMesh上で指定する0から1000の情報
     * @param drawableIndex drawableのインデックス
     * @return true drawableの不透明度が直近のCubismModel.update関数で変化した
     * @return false drawableの不透明度が直近のCubismModel.update関数で変化している
     */
    getDrawableDynamicFlagVisibilityDidChange(drawableIndex) {
        const dynamicFlags = this._model.drawables.dynamicFlags;
        return Live2DCubismCore.Utils.hasVisibilityDidChangeBit(dynamicFlags[drawableIndex]);
    }
    /**
     * Drawableの不透明度の変化情報の取得
     *
     * 直近のCubismModel.update関数でdrawableの不透明度が変化したかを取得する。
     *
     * @param drawableIndex drawableのインデックス
     * @return true Drawableの不透明度が直近のCubismModel.update関数で変化した
     * @return false Drawableの不透明度が直近のCubismModel.update関数で変化してない
     */
    getDrawableDynamicFlagOpacityDidChange(drawableIndex) {
        const dynamicFlags = this._model.drawables.dynamicFlags;
        return Live2DCubismCore.Utils.hasOpacityDidChangeBit(dynamicFlags[drawableIndex]);
    }
    /**
     * Drawableの描画順序の変化情報の取得
     *
     * 直近のCubismModel.update関数でDrawableの描画の順序が変化したかを取得する。
     *
     * @param drawableIndex Drawableのインデックス
     * @return true Drawableの描画の順序が直近のCubismModel.update関数で変化した
     * @return false Drawableの描画の順序が直近のCubismModel.update関数で変化してない
     */
    getDrawableDynamicFlagRenderOrderDidChange(drawableIndex) {
        const dynamicFlags = this._model.drawables.dynamicFlags;
        return Live2DCubismCore.Utils.hasRenderOrderDidChangeBit(dynamicFlags[drawableIndex]);
    }
    /**
     * Drawableの乗算色・スクリーン色の変化情報の取得
     *
     * 直近のCubismModel.update関数でDrawableの乗算色・スクリーン色が変化したかを取得する。
     *
     * @param drawableIndex Drawableのインデックス
     * @return true Drawableの乗算色・スクリーン色が直近のCubismModel.update関数で変化した
     * @return false Drawableの乗算色・スクリーン色が直近のCubismModel.update関数で変化してない
     */
    getDrawableDynamicFlagBlendColorDidChange(drawableIndex) {
        const dynamicFlags = this._model.drawables.dynamicFlags;
        return Live2DCubismCore.Utils.hasBlendColorDidChangeBit(dynamicFlags[drawableIndex]);
    }
    /**
     * オフスクリーンの個数を取得する
     * @return オフスクリーンの個数
     */
    getOffscreenCount() {
        return this.getOffscreens().count;
    }
    /**
     * Offscreenのカラーブレンドの取得(Cubism 5.3 以降)
     *
     * @param offscreenIndex Offscreenのインデックス
     * @return Offscreenのカラーブレンド
     */
    getOffscreenColorBlend(offscreenIndex) {
        // キャッシュ
        if (this._offscreenColorBlends[offscreenIndex] ==
            CubismColorBlend.ColorBlend_None) {
            this._offscreenColorBlends[offscreenIndex] =
                this.getOffscreens().blendModes[offscreenIndex] & 0xff;
        }
        return this._offscreenColorBlends[offscreenIndex];
    }
    /**
     * Offscreenのアルファブレンドの取得(Cubism 5.3 以降)
     *
     * @param offscreenIndex Offscreenのインデックス
     * @return Offscreenのアルファブレンド
     */
    getOffscreenAlphaBlend(offscreenIndex) {
        // キャッシュ
        if (this._offscreenAlphaBlends[offscreenIndex] ==
            CubismAlphaBlend.AlphaBlend_None) {
            this._offscreenAlphaBlends[offscreenIndex] =
                (this.getOffscreens().blendModes[offscreenIndex] >> 8) & 0xff;
        }
        return this._offscreenAlphaBlends[offscreenIndex];
    }
    /**
     * オフスクリーンのオーナーインデックス配列を取得する
     * @return オフスクリーンのオーナーインデックス配列
     */
    getOffscreenOwnerIndices() {
        return this.getOffscreens().ownerIndices;
    }
    /**
     * オフスクリーンの不透明度を取得
     * @param offscreenIndex オフスクリーンのインデックス
     * @return 不透明度
     */
    getOffscreenOpacity(offscreenIndex) {
        if (offscreenIndex < 0 || offscreenIndex >= this.getOffscreens().count) {
            return 1.0; // オフスクリーンが無いのでスキップ
        }
        return this.getOffscreens().opacities[offscreenIndex];
    }
    /**
     * オフスクリーンのクリッピングマスクリストの取得
     * @return オフスクリーンのクリッピングマスクリスト
     */
    getOffscreenMasks() {
        return this.getOffscreens().masks;
    }
    /**
     * オフスクリーンのクリッピングマスクの個数リストの取得
     * @return オフスクリーンのクリッピングマスクの個数リスト
     */
    getOffscreenMaskCounts() {
        return this.getOffscreens().maskCounts;
    }
    /**
     * オフスクリーンのマスク反転設定を取得する
     * @param offscreenIndex オフスクリーンのインデックス
     * @return オフスクリーンのマスク反転設定
     */
    getOffscreenInvertedMask(offscreenIndex) {
        const constantFlags = this.getOffscreens().constantFlags;
        // Live2DCubismCore.Utils.hasIsInvertedMaskBit を利用
        return Live2DCubismCore.Utils.hasIsInvertedMaskBit(constantFlags[offscreenIndex]);
    }
    /**
     * ブレンドモード使用判定
     * @return ブレンドモードを使用しているか
     */
    isBlendModeEnabled() {
        return this._isBlendModeEnabled;
    }
    /**
     * 保存されたパラメータの読み込み
     */
    loadParameters() {
        let parameterCount = this._model.parameters.count;
        const savedParameterCount = this._savedParameters.length;
        if (parameterCount > savedParameterCount) {
            parameterCount = savedParameterCount;
        }
        for (let i = 0; i < parameterCount; ++i) {
            this._parameterValues[i] = this._savedParameters[i];
        }
    }
    /**
     * 初期化する
     */
    initialize() {
        CSM_ASSERT(this._model);
        this._parameterValues = this._model.parameters.values;
        this._partOpacities = this._model.parts.opacities;
        this._offscreenOpacities = this.getOffscreens().opacities;
        this._parameterMaximumValues = this._model.parameters.maximumValues;
        this._parameterMinimumValues = this._model.parameters.minimumValues;
        {
            const parameterIds = this._model.parameters.ids;
            const parameterCount = this._model.parameters.count;
            this._parameterIds.length = parameterCount;
            this._userParameterRepeatDataList.length = parameterCount;
            for (let i = 0; i < parameterCount; ++i) {
                this._parameterIds[i] = CubismFramework.getIdManager().getId(parameterIds[i]);
                this._userParameterRepeatDataList[i] = new ParameterRepeatData(false, false);
            }
        }
        const partCount = this._model.parts.count;
        {
            const partIds = this._model.parts.ids;
            this._partIds.length = partCount;
            for (let i = 0; i < partCount; ++i) {
                this._partIds[i] = CubismFramework.getIdManager().getId(partIds[i]);
            }
        }
        {
            const drawableIds = this._model.drawables.ids;
            const drawableCount = this._model.drawables.count;
            const offsetsPartChildDrawables = new Array();
            offsetsPartChildDrawables.length = partCount;
            this._userPartMultiplyColors.length = partCount;
            this._userPartScreenColors.length = partCount;
            this._partChildDrawables.length = partCount;
            this._userDrawableMultiplyColors.length = drawableCount;
            this._userDrawableScreenColors.length = drawableCount;
            // カリング設定
            this._userDrawableCullings.length = drawableCount;
            const userCulling = new CullingData(false, false);
            // Part
            {
                for (let i = 0; i < partCount; ++i) {
                    const multiplyColor = new CubismTextureColor(1.0, 1.0, 1.0, 1.0);
                    const screenColor = new CubismTextureColor(0.0, 0.0, 0.0, 1.0);
                    const userMultiplyColor = new PartColorData(false, multiplyColor);
                    const userScreenColor = new PartColorData(false, screenColor);
                    this._userPartMultiplyColors[i] = userMultiplyColor;
                    this._userPartScreenColors[i] = userScreenColor;
                    this._partChildDrawables[i] = new Array();
                    this._partChildDrawables[i].length = drawableCount;
                }
            }
            // Drawables
            {
                for (let i = 0; i < drawableCount; ++i) {
                    const multiplyColor = new CubismTextureColor(1.0, 1.0, 1.0, 1.0);
                    const screenColor = new CubismTextureColor(0.0, 0.0, 0.0, 1.0);
                    const userMultiplyColor = new ColorData(false, multiplyColor);
                    const userScreenColor = new ColorData(false, screenColor);
                    this._drawableIds.push(CubismFramework.getIdManager().getId(drawableIds[i]));
                    this._userDrawableMultiplyColors[i] = userMultiplyColor;
                    this._userDrawableScreenColors[i] = userScreenColor;
                    this._userDrawableCullings[i] = userCulling;
                    const parentIndex = this.getDrawableParentPartIndex(i);
                    if (parentIndex >= 0) {
                        this._partChildDrawables[parentIndex][i] = i;
                    }
                }
            }
            // blendMode
            // オフスクリーンが存在するか、DrawableのブレンドモードでColorBlend、AlphaBlendを使用するのであればブレンドモードを有効にする。
            if (this.getOffscreenCount() > 0) {
                this._isBlendModeEnabled = true;
            }
            else {
                const blendModes = this._model.drawables.blendModes;
                if (blendModes) {
                    for (let i = 0; i < drawableCount; ++i) {
                        const colorBlendType = this.getDrawableColorBlend(i);
                        const alphaBlendType = this.getDrawableAlphaBlend(i);
                        // NormalOver、AddCompatible、MultiplyCompatible以外であればブレンドモードを有効にする。
                        if (!(colorBlendType == CubismColorBlend.ColorBlend_Normal &&
                            alphaBlendType == CubismAlphaBlend.AlphaBlend_Over) &&
                            colorBlendType != CubismColorBlend.ColorBlend_AddCompatible &&
                            colorBlendType != CubismColorBlend.ColorBlend_MultiplyCompatible) {
                            this._isBlendModeEnabled = true;
                            break;
                        }
                    }
                }
            }
            // Offscreen
            {
                // オフスクリーンの初期化
                const offscreenCount = this.getOffscreens().count;
                this._userOffscreenMultiplyColors = new Array();
                this._userOffscreenScreenColors = new Array();
                this._userOffscreenCullings = new Array();
                // 乗算色・スクリーン色・カリング・オフスクリーン情報の配列を用意
                this._userOffscreenMultiplyColors.length = offscreenCount;
                this._userOffscreenScreenColors.length = offscreenCount;
                this._userOffscreenCullings.length = offscreenCount;
                for (let i = 0; i < offscreenCount; ++i) {
                    const multiplyColor = new CubismTextureColor(1.0, 1.0, 1.0, 1.0);
                    const screenColor = new CubismTextureColor(0.0, 0.0, 0.0, 1.0);
                    // 乗算色
                    const userMultiplyColor = new ColorData(false, multiplyColor);
                    // スクリーン色
                    const userScreenColor = new ColorData(false, screenColor);
                    this._userOffscreenMultiplyColors[i] = userMultiplyColor;
                    this._userOffscreenScreenColors[i] = userScreenColor;
                    this._userOffscreenCullings[i] = userCulling;
                }
            }
            this.setupPartsHierarchy();
        }
    }
    /**
     * パーツ階層構造を取得する
     * @return パーツ階層構造の配列
     */
    getPartsHierarchy() {
        return this._partsHierarchy;
    }
    /**
     * パーツ階層構造をセットアップする
     */
    setupPartsHierarchy() {
        this._partsHierarchy.length = 0;
        // すべてのパーツのパーツ情報管理構造体を作成
        const partCount = this.getPartCount();
        this._partsHierarchy.length = partCount;
        for (let i = 0; i < partCount; ++i) {
            const partInfo = new CubismModelPartInfo();
            this._partsHierarchy[i] = partInfo;
        }
        // Partごとに親パーツを取得し、親パーツの子objectリストに追加する
        for (let i = 0; i < partCount; ++i) {
            const parentPartIndex = this.getPartParentPartIndices()[i];
            if (parentPartIndex === NoParentIndex) {
                continue;
            }
            for (let partIndex = 0; partIndex < this._partsHierarchy.length; ++partIndex) {
                if (partIndex === parentPartIndex) {
                    const objectInfo = new CubismModelObjectInfo(i, CubismModelObjectType.CubismModelObjectType_Parts);
                    this._partsHierarchy[partIndex].objects.push(objectInfo);
                    break;
                }
            }
        }
        // Drawableごとに親パーツを取得し、親パーツの子objectリストに追加する
        const drawableCount = this.getDrawableCount();
        for (let i = 0; i < drawableCount; ++i) {
            const parentPartIndex = this.getDrawableParentPartIndex(i);
            if (parentPartIndex === NoParentIndex) {
                continue;
            }
            for (let partIndex = 0; partIndex < this._partsHierarchy.length; ++partIndex) {
                if (partIndex === parentPartIndex) {
                    const objectInfo = new CubismModelObjectInfo(i, CubismModelObjectType.CubismModelObjectType_Drawable);
                    this._partsHierarchy[partIndex].objects.push(objectInfo);
                    break;
                }
            }
        }
        // パーツ子描画オブジェクト情報構造体を作成していく
        for (let i = 0; i < this._partsHierarchy.length; ++i) {
            // パーツ管理構造体を取得
            this.getPartChildDrawObjects(i);
        }
    }
    /**
     * 指定したパーツの子描画オブジェクト情報を取得・構築する
     * @param partInfoIndex パーツ情報のインデックス
     * @return PartChildDrawObjects
     */
    getPartChildDrawObjects(partInfoIndex) {
        if (this._partsHierarchy[partInfoIndex].getChildObjectCount() < 1) {
            // 子オブジェクトがない場合
            return this._partsHierarchy[partInfoIndex].childDrawObjects;
        }
        const childDrawObjects = this._partsHierarchy[partInfoIndex].childDrawObjects;
        // 既にchildDrawObjectsが処理されている場合はスキップ
        if (childDrawObjects.drawableIndices.length !== 0 ||
            childDrawObjects.offscreenIndices.length !== 0) {
            return childDrawObjects;
        }
        const objects = this._partsHierarchy[partInfoIndex].objects;
        for (let i = 0; i < objects.length; ++i) {
            const obj = objects[i];
            if (obj.objectType === CubismModelObjectType.CubismModelObjectType_Parts) {
                // 子のパーツの場合、再帰的に子objectsを取得
                this.getPartChildDrawObjects(obj.objectIndex);
                // 子パーツの子Drawable、Offscreenを取得
                const childToChildDrawObjects = this._partsHierarchy[obj.objectIndex].childDrawObjects;
                childDrawObjects.drawableIndices.push(...childToChildDrawObjects.drawableIndices);
                childDrawObjects.offscreenIndices.push(...childToChildDrawObjects.offscreenIndices);
                // Offscreenの確認
                const offscreenIndices = this.getOffscreenIndices();
                const offscreenIndex = offscreenIndices
                    ? offscreenIndices[obj.objectIndex]
                    : NoOffscreenIndex;
                if (offscreenIndex !== NoOffscreenIndex) {
                    childDrawObjects.offscreenIndices.push(offscreenIndex);
                }
            }
            else if (obj.objectType === CubismModelObjectType.CubismModelObjectType_Drawable) {
                // Drawableの場合、パーツの子Drawableに追加
                childDrawObjects.drawableIndices.push(obj.objectIndex);
            }
        }
        return childDrawObjects;
    }
    /**
     * パーツのオフスクリーンインデックス配列を取得
     * @return Int32Array offscreenIndices
     */
    getOffscreenIndices() {
        // _model.parts.offscreenIndices が存在する場合のみ返す
        return this._model.parts.offscreenIndices;
    }
    /**
     * コンストラクタ
     * @param model モデル
     */
    constructor(model) {
        this._model = model;
        this._parameterValues = null;
        this._parameterMaximumValues = null;
        this._parameterMinimumValues = null;
        this._partOpacities = null;
        this._offscreenOpacities = null;
        this._savedParameters = new Array();
        this._parameterIds = new Array();
        this._drawableIds = new Array();
        this._partIds = new Array();
        this._isOverriddenParameterRepeat = true;
        this._isOverriddenModelMultiplyColors = false;
        this._isOverriddenModelScreenColors = false;
        this._isOverriddenCullings = false;
        this._modelOpacity = 1.0;
        this._isBlendModeEnabled = false;
        this._drawableColorBlends = null;
        this._drawableAlphaBlends = null;
        this._offscreenColorBlends = null;
        this._offscreenAlphaBlends = null;
        this._drawableMultiplyColors = null;
        this._drawableScreenColors = null;
        this._offscreenMultiplyColors = null;
        this._offscreenScreenColors = null;
        this._userParameterRepeatDataList = new Array();
        this._userDrawableMultiplyColors = new Array();
        this._userDrawableScreenColors = new Array();
        this._userDrawableCullings = new Array();
        this._userPartMultiplyColors = new Array();
        this._userPartScreenColors = new Array();
        this._partChildDrawables = new Array();
        this._partsHierarchy = new Array();
        this._notExistPartId = new Map();
        this._notExistParameterId = new Map();
        this._notExistParameterValues = new Map();
        this._notExistPartOpacities = new Map();
        // Drawableのカラーブレンドとアルファブレンドの初期化
        this._drawableColorBlends = new Array(model.drawables.count).fill(CubismColorBlend.ColorBlend_None);
        this._drawableAlphaBlends = new Array(model.drawables.count).fill(CubismAlphaBlend.AlphaBlend_None);
        // Offscreenのカラーブレンドとアルファブレンドの初期化
        const offscreens = this.getOffscreens();
        this._offscreenColorBlends = new Array(offscreens.count).fill(CubismColorBlend.ColorBlend_None);
        this._offscreenAlphaBlends = new Array(offscreens.count).fill(CubismAlphaBlend.AlphaBlend_None);
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
        this._model.release();
        this._model = null;
        this._drawableColorBlends = null;
        this._drawableAlphaBlends = null;
        this._offscreenColorBlends = null;
        this._offscreenAlphaBlends = null;
        this._drawableMultiplyColors = null;
        this._drawableScreenColors = null;
        this._offscreenMultiplyColors = null;
        this._offscreenScreenColors = null;
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismmodel';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismModel = $.CubismModel;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
//# sourceMappingURL=cubismmodel.js.map