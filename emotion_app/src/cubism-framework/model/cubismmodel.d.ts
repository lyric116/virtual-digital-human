/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { CubismIdHandle } from '../id/cubismid';
import { CubismBlendMode, CubismTextureColor } from '../rendering/cubismrenderer';
export declare const NoParentIndex = -1;
export declare const NoOffscreenIndex = -1;
/**
 * カラーブレンドのタイプ
 */
export declare enum CubismColorBlend {
    ColorBlend_None = -1,
    ColorBlend_Normal,
    ColorBlend_AddGlow,
    ColorBlend_Add,
    ColorBlend_Darken,
    ColorBlend_Multiply,
    ColorBlend_ColorBurn,
    ColorBlend_LinearBurn,
    ColorBlend_Lighten,
    ColorBlend_Screen,
    ColorBlend_ColorDodge,
    ColorBlend_Overlay,
    ColorBlend_SoftLight,
    ColorBlend_HardLight,
    ColorBlend_LinearLight,
    ColorBlend_Hue,
    ColorBlend_Color,
    ColorBlend_AddCompatible,
    ColorBlend_MultiplyCompatible
}
/**
 * アルファブレンドのタイプ
 */
export declare enum CubismAlphaBlend {
    AlphaBlend_None = -1,
    AlphaBlend_Over = 0,
    AlphaBlend_Atop = 1,
    AlphaBlend_Out = 2,
    AlphaBlend_ConjointOver = 3,
    AlphaBlend_DisjointOver = 4
}
/**
 * オブジェクトのタイプ
 */
export declare enum CubismModelObjectType {
    CubismModelObjectType_Drawable = 0,
    CubismModelObjectType_Parts = 1
}
/**
 * Structure for managing the override of parameter repetition settings
 */
export declare class ParameterRepeatData {
    /**
     * Constructor
     *
     * @param isOverridden whether to be overriden
     * @param isParameterRepeated override flag for settings
     */
    constructor(isOverridden?: boolean, isParameterRepeated?: boolean);
    /**
     * Whether to be overridden
     */
    isOverridden: boolean;
    /**
     * Override flag for settings
     */
    isParameterRepeated: boolean;
}
/**
 * (deprecated) SDK側から与えられたDrawableの乗算色・スクリーン色上書きフラグと
 * その色を保持する構造体
 */
export declare class DrawableColorData {
    constructor(isOverridden?: boolean, color?: CubismTextureColor);
    isOverridden: boolean;
    color: CubismTextureColor;
    get isOverwritten(): boolean;
}
/**
 * (deprecated) テクスチャの色をRGBAで扱うための構造体
 */
export declare class PartColorData {
    constructor(isOverridden?: boolean, color?: CubismTextureColor);
    isOverridden: boolean;
    color: CubismTextureColor;
    get isOverwritten(): boolean;
}
/**
 * SDK側から与えられた描画オブジェクトの乗算色・スクリーン色上書きフラグと
 * その色を保持する構造体
 */
export declare class ColorData {
    constructor(isOverridden?: boolean, color?: CubismTextureColor);
    isOverridden: boolean;
    color: CubismTextureColor;
}
/**
 * (deprecated) テクスチャのカリング設定を管理するための構造体
 */
export declare class DrawableCullingData {
    /**
     * コンストラクタ
     *
     * @param isOverridden
     * @param isCulling
     */
    constructor(isOverridden?: boolean, isCulling?: boolean);
    isOverridden: boolean;
    isCulling: boolean;
    get isOverwritten(): boolean;
}
/**
 * テクスチャのカリング設定を管理するための構造体
 */
export declare class CullingData {
    /**
     * コンストラクタ
     *
     * @param isOverridden
     * @param isCulling
     */
    constructor(isOverridden?: boolean, isCulling?: boolean);
    isOverridden: boolean;
    isCulling: boolean;
}
/**
 * パーツ子描画オブジェクト情報構造体
 */
export declare class PartChildDrawObjects {
    drawableIndices: Array<number>;
    offscreenIndices: Array<number>;
    constructor(drawableIndices?: Array<number>, offscreenIndices?: Array<number>);
}
/**
 * オブジェクト情報構造体
 */
export declare class CubismModelObjectInfo {
    objectType: CubismModelObjectType;
    objectIndex: number;
    constructor(objectIndex: number, objectType: CubismModelObjectType);
}
/**
 * パーツ情報管理構造体
 */
export declare class CubismModelPartInfo {
    objects: Array<CubismModelObjectInfo>;
    childDrawObjects: PartChildDrawObjects;
    constructor(objects?: Array<CubismModelObjectInfo>, childDrawObjects?: PartChildDrawObjects);
    getChildObjectCount(): number;
}
/**
 * モデル
 *
 * Mocデータから生成されるモデルのクラス。
 */
export declare class CubismModel {
    /**
     * モデルのパラメータの更新
     */
    update(): void;
    /**
     * PixelsPerUnitを取得する
     * @return PixelsPerUnit
     */
    getPixelsPerUnit(): number;
    /**
     * キャンバスの幅を取得する
     */
    getCanvasWidth(): number;
    /**
     * キャンバスの高さを取得する
     */
    getCanvasHeight(): number;
    /**
     * パラメータを保存する
     */
    saveParameters(): void;
    /**
     * Drawableの乗算色を取得する
     *
     * @param drawableIndex Drawableのインデックス
     *
     * @return 指定した描画オブジェクトの乗算色(RGBA)
     */
    getMultiplyColor(drawableIndex: number): CubismTextureColor;
    /**
     * Drawableのスクリーン色を取得する
     *
     * @param drawableIndex Drawableのインデックス
     *
     * @return 指定した描画オブジェクトのスクリーン色(RGBA)
     */
    getScreenColor(drawableIndex: number): CubismTextureColor;
    /**
     * Drawableの乗算色をセットする
     *
     * @param drawableIndex Drawableのインデックス
     * @param color 設定する乗算色(CubismTextureColor)
     */
    setMultiplyColorByTextureColor(drawableIndex: number, color: CubismTextureColor): void;
    /**
     * Drawableの乗算色をセットする
     *
     * @param drawableIndex Drawableのインデックス
     * @param r 設定する乗算色のR値
     * @param g 設定する乗算色のG値
     * @param b 設定する乗算色のB値
     * @param a 設定する乗算色のA値
     */
    setMultiplyColorByRGBA(drawableIndex: number, r: number, g: number, b: number, a?: number): void;
    /**
     * Drawableのスクリーン色をセットする
     *
     * @param drawableIndex Drawableのインデックス
     * @param color 設定するスクリーン色(CubismTextureColor)
     */
    setScreenColorByTextureColor(drawableIndex: number, color: CubismTextureColor): void;
    /**
     * Drawableのスクリーン色をセットする
     *
     * @param drawableIndex Drawableのインデックス
     * @param r 設定するスクリーン色のR値
     * @param g 設定するスクリーン色のG値
     * @param b 設定するスクリーン色のB値
     * @param a 設定するスクリーン色のA値
     */
    setScreenColorByRGBA(drawableIndex: number, r: number, g: number, b: number, a?: number): void;
    /**
     * partの乗算色を取得する
     *
     * @param partIndex partのインデックス
     * @return 指定したpartの乗算色
     */
    getPartMultiplyColor(partIndex: number): CubismTextureColor;
    /**
     * partのスクリーン色を取得する
     *
     * @param partIndex partのインデックス
     * @return 指定したpartのスクリーン色
     */
    getPartScreenColor(partIndex: number): CubismTextureColor;
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
    setPartColor(partIndex: number, r: number, g: number, b: number, a: number, partColors: Array<ColorData>, drawableColors: Array<ColorData>): void;
    /**
     * 乗算色をセットする
     *
     * @param partIndex partのインデックス
     * @param color 設定する乗算色(CubismTextureColor)
     */
    setPartMultiplyColorByTextureColor(partIndex: number, color: CubismTextureColor): void;
    /**
     * 乗算色をセットする
     *
     * @param partIndex partのインデックス
     * @param r 設定する乗算色のR値
     * @param g 設定する乗算色のG値
     * @param b 設定する乗算色のB値
     * @param a 設定する乗算色のA値
     */
    setPartMultiplyColorByRGBA(partIndex: number, r: number, g: number, b: number, a: number): void;
    /**
     * スクリーン色をセットする
     *
     * @param partIndex partのインデックス
     * @param color 設定するスクリーン色(CubismTextureColor)
     */
    setPartScreenColorByTextureColor(partIndex: number, color: CubismTextureColor): void;
    /**
     * スクリーン色をセットする
     *
     * @param partIndex partのインデックス
     * @param r 設定するスクリーン色のR値
     * @param g 設定するスクリーン色のG値
     * @param b 設定するスクリーン色のB値
     * @param a 設定するスクリーン色のA値
     */
    setPartScreenColorByRGBA(partIndex: number, r: number, g: number, b: number, a: number): void;
    /**
     * Offscreenの乗算色を取得する
     *
     * @param offscreenIndex Offscreenのインデックス
     *
     * @return 指定した描画オブジェクトの乗算色(RGBA)
     */
    getMultiplyColorOffscreen(offscreenIndex: number): CubismTextureColor;
    /**
     * Offscreenのスクリーン色を取得する
     *
     * @param offscreenIndex Offscreenのインデックス
     *
     * @return 指定した描画オブジェクトのスクリーン色(RGBA)
     */
    getScreenColorOffscreen(offscreenIndex: number): CubismTextureColor;
    /**
     * Offscreenの乗算色をセットする
     *
     * @param offscreenIndex Offscreenのインデックス
     * @param color 設定する乗算色(CubismTextureColor)
     */
    setMultiplyColorByTextureColorOffscreen(offscreenIndex: number, color: CubismTextureColor): void;
    /**
     * Offscreenの乗算色をセットする
     *
     * @param offscreenIndex Offscreenのインデックス
     * @param r 設定する乗算色のR値
     * @param g 設定する乗算色のG値
     * @param b 設定する乗算色のB値
     * @param a 設定する乗算色のA値
     */
    setMultiplyColorByRGBAOffscreen(offscreenIndex: number, r: number, g: number, b: number, a?: number): void;
    /**
     * Offscreenのスクリーン色をセットする
     *
     * @param offscreenIndex Offscreenのインデックス
     * @param color 設定するスクリーン色(CubismTextureColor)
     */
    setScreenColorByTextureColorOffscreen(offscreenIndex: number, color: CubismTextureColor): void;
    /**
     * Offscreenのスクリーン色をセットする
     *
     * @param offscreenIndex Offscreenのインデックス
     * @param r 設定するスクリーン色のR値
     * @param g 設定するスクリーン色のG値
     * @param b 設定するスクリーン色のB値
     * @param a 設定するスクリーン色のA値
     */
    setScreenColorByRGBAOffscreen(offscreenIndex: number, r: number, g: number, b: number, a?: number): void;
    /**
     * Checks whether parameter repetition is performed for the entire model.
     *
     * @return true if parameter repetition is performed for the entire model; otherwise returns false.
     */
    getOverrideFlagForModelParameterRepeat(): boolean;
    /**
     * Sets whether parameter repetition is performed for the entire model.
     * Use true to perform parameter repetition for the entire model, or false to not perform it.
     */
    setOverrideFlagForModelParameterRepeat(isRepeat: boolean): void;
    /**
     * Returns the flag indicating whether to override the parameter repeat.
     *
     * @param parameterIndex Parameter index
     *
     * @return true if the parameter repeat is overridden, false otherwise.
     */
    getOverrideFlagForParameterRepeat(parameterIndex: number): boolean;
    /**
     * Sets the flag indicating whether to override the parameter repeat.
     *
     * @param parameterIndex Parameter index
     * @param value true if it is to be overridden; otherwise, false.
     */
    setOverrideFlagForParameterRepeat(parameterIndex: number, value: boolean): void;
    /**
     * Returns the repeat flag.
     *
     * @param parameterIndex Parameter index
     *
     * @return true if repeating, false otherwise.
     */
    getRepeatFlagForParameterRepeat(parameterIndex: number): boolean;
    /**
     * Sets the repeat flag.
     *
     * @param parameterIndex Parameter index
     * @param value true to enable repeating, false otherwise.
     */
    setRepeatFlagForParameterRepeat(parameterIndex: number, value: boolean): void;
    /**
     * SDKから指定したモデルの乗算色を上書きするか
     *
     * @deprecated 名称変更のため非推奨 getOverrideFlagForModelMultiplyColors() に置き換え
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverwriteFlagForModelMultiplyColors(): boolean;
    /**
     * SDKから指定したモデルの乗算色を上書きするか
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverrideFlagForModelMultiplyColors(): boolean;
    /**
     * SDKから指定したモデルのスクリーン色を上書きするか
     *
     * @deprecated 名称変更のため非推奨 getOverrideFlagForModelScreenColors() に置き換え
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverwriteFlagForModelScreenColors(): boolean;
    /**
     * SDKから指定したモデルのスクリーン色を上書きするか
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverrideFlagForModelScreenColors(): boolean;
    /**
     * SDKから指定したモデルの乗算色を上書きするかセットする
     *
     * @deprecated 名称変更のため非推奨 setOverrideFlagForModelMultiplyColors(value: boolean) に置き換え
     *
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteFlagForModelMultiplyColors(value: boolean): void;
    /**
     * SDKから指定したモデルの乗算色を上書きするかセットする
     *
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideFlagForModelMultiplyColors(value: boolean): void;
    /**
     * SDKから指定したモデルのスクリーン色を上書きするかセットする
     *
     * @deprecated 名称変更のため非推奨 setOverrideFlagForModelScreenColors(value: boolean) に置き換え
     *
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteFlagForModelScreenColors(value: boolean): void;
    /**
     * SDKから指定したモデルのスクリーン色を上書きするかセットする
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideFlagForModelScreenColors(value: boolean): void;
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
    getOverwriteFlagForDrawableMultiplyColors(drawableIndex: number): boolean;
    /**
     * SDKから指定したDrawableIndexの乗算色を上書きするか
     *
     * @param drawableIndex drawableのインデックス
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverrideFlagForDrawableMultiplyColors(drawableIndex: number): boolean;
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
    getOverwriteFlagForDrawableScreenColors(drawableIndex: number): boolean;
    /**
     * SDKから指定したDrawableIndexのスクリーン色を上書きするか
     *
     * @param drawableIndex drawableのインデックス
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverrideFlagForDrawableScreenColors(drawableIndex: number): boolean;
    /**
     * SDKから指定したDrawableIndexの乗算色を上書きするかセットする
     *
     * @deprecated 名称変更のため非推奨 setOverrideFlagForDrawableMultiplyColors(drawableIndex: number, value: boolean) に置き換え
     *
     * @param drawableIndex drawableのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteFlagForDrawableMultiplyColors(drawableIndex: number, value: boolean): void;
    /**
     * SDKから指定したDrawableIndexの乗算色を上書きするかセットする
     *
     * @param drawableIndex drawableのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideFlagForDrawableMultiplyColors(drawableIndex: number, value: boolean): void;
    /**
     * SDKから指定したDrawableIndexのスクリーン色を上書きするかセットする
     *
     * @deprecated 名称変更のため非推奨 setOverrideFlagForDrawableScreenColors(drawableIndex: number, value: boolean) に置き換え
     *
     * @param drawableIndex drawableのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteFlagForDrawableScreenColors(drawableIndex: number, value: boolean): void;
    /**
     * SDKから指定したDrawableIndexのスクリーン色を上書きするかセットする
     *
     * @param drawableIndex drawableのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideFlagForDrawableScreenColors(drawableIndex: number, value: boolean): void;
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
    getOverwriteColorForPartMultiplyColors(partIndex: number): boolean;
    /**
     * SDKからpartの乗算色を上書きするか
     *
     * @param partIndex partのインデックス
     *
     * @return true    ->  SDKからの情報を優先する
     *          false   ->  モデルに設定されている色情報を使用
     */
    getOverrideColorForPartMultiplyColors(partIndex: number): boolean;
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
    getOverwriteColorForPartScreenColors(partIndex: number): boolean;
    /**
     * SDKからpartのスクリーン色を上書きするか
     *
     * @param partIndex partのインデックス
     *
     * @return true    ->  SDKからの情報を優先する
     *          false   ->  モデルに設定されている色情報を使用
     */
    getOverrideColorForPartScreenColors(partIndex: number): boolean;
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
    setOverwriteColorForPartColors(partIndex: number, value: boolean, partColors: Array<PartColorData>, drawableColors: Array<DrawableColorData>): void;
    /**
     * partのOverrideFlag setter関数
     *
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     * @param partColors 設定するpartのカラーデータ配列
     * @param drawableColors partに関連するDrawableのカラーデータ配列
     */
    setOverrideColorForPartColors(partIndex: number, value: boolean, partColors: Array<ColorData>, drawableColors: Array<ColorData>): void;
    /**
     * SDKからpartのスクリーン色を上書きするかをセットする
     *
     * @deprecated 名称変更のため非推奨 setOverrideColorForPartMultiplyColors(partIndex: number, value: boolean) に置き換え
     *
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteColorForPartMultiplyColors(partIndex: number, value: boolean): void;
    /**
     * SDKからpartのスクリーン色を上書きするかをセットする
     *
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideColorForPartMultiplyColors(partIndex: number, value: boolean): void;
    /**
     * SDKからpartのスクリーン色を上書きするかをセットする
     *
     * @deprecated 名称変更のため非推奨 setOverrideColorForPartScreenColors(partIndex: number, value: boolean) に置き換え
     *
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteColorForPartScreenColors(partIndex: number, value: boolean): void;
    /**
     * SDKからpartのスクリーン色を上書きするかをセットする
     *
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideColorForPartScreenColors(partIndex: number, value: boolean): void;
    /**
     * SDKから指定したOffscreenIndexの乗算色を上書きするか
     *
     * @param offscreenIndex offscreenのインデックス
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverrideFlagForOffscreenMultiplyColors(offscreenIndex: number): boolean;
    /**
     * SDKから指定したOffscreenIndexのスクリーン色を上書きするか
     *
     * @param offscreenIndex offscreenのインデックス
     *
     * @return true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverrideFlagForOffscreenScreenColors(offscreemIndex: number): boolean;
    /**
     * SDKから指定したDrawableIndexの乗算色を上書きするかセットする
     *
     * @param offscreenIndex offscreenのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideFlagForOffscreenMultiplyColors(offscreenIndex: number, value: boolean): void;
    /**
     * SDKから指定したOffscreenIndexのスクリーン色を上書きするかセットする
     *
     * @param offscreenIndex offscreenのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverrideFlagForOffscreenScreenColors(offscreenIndex: number, value: boolean): void;
    /**
     * Drawableのカリング情報を取得する。
     *
     * @param   drawableIndex   Drawableのインデックス
     *
     * @return  Drawableのカリング情報
     */
    getDrawableCulling(drawableIndex: number): boolean;
    /**
     * Drawableのカリング情報を設定する。
     *
     * @param drawableIndex Drawableのインデックス
     * @param isCulling カリング情報
     */
    setDrawableCulling(drawableIndex: number, isCulling: boolean): void;
    /**
     * Offscreenのカリング情報を取得する。
     *
     * @param   offscreenIndex   Offscreenのインデックス
     *
     * @return  Offscreenのカリング情報
     */
    getOffscreenCulling(offscreenIndex: number): boolean;
    /**
     * Offscreenのカリング設定を設定する。
     *
     * @param offscreenIndex Offscreenのインデックス
     * @param isCulling カリング情報
     */
    setOffscreenCulling(offscreenIndex: number, isCulling: boolean): void;
    /**
     * SDKからモデル全体のカリング設定を上書きするか。
     *
     * @deprecated 名称変更のため非推奨 getOverrideFlagForModelCullings() に置き換え
     *
     * @return  true    ->  SDK上のカリング設定を使用
     *          false   ->  モデルのカリング設定を使用
     */
    getOverwriteFlagForModelCullings(): boolean;
    /**
     * SDKからモデル全体のカリング設定を上書きするか。
     *
     * @return  true    ->  SDK上のカリング設定を使用
     *          false   ->  モデルのカリング設定を使用
     */
    getOverrideFlagForModelCullings(): boolean;
    /**
     * SDKからモデル全体のカリング設定を上書きするかを設定する。
     *
     * @deprecated 名称変更のため非推奨 setOverrideFlagForModelCullings(isOverriddenCullings: boolean) に置き換え
     *
     * @param isOveriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
     */
    setOverwriteFlagForModelCullings(isOverriddenCullings: boolean): void;
    /**
     * SDKからモデル全体のカリング設定を上書きするかを設定する。
     *
     * @param isOverriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
     */
    setOverrideFlagForModelCullings(isOverriddenCullings: boolean): void;
    /**
     *
     * @deprecated 名称変更のため非推奨 getOverrideFlagForDrawableCullings(drawableIndex: number) に置き換え
     *
     * @param drawableIndex Drawableのインデックス
     * @return  true    ->  SDK上のカリング設定を使用
     *          false   ->  モデルのカリング設定を使用
     */
    getOverwriteFlagForDrawableCullings(drawableIndex: number): boolean;
    /**
     *
     * @param drawableIndex Drawableのインデックス
     * @return  true    ->  SDK上のカリング設定を使用
     *          false   ->  モデルのカリング設定を使用
     */
    getOverrideFlagForDrawableCullings(drawableIndex: number): boolean;
    /**
     * @param offscreenIndex Offscreenのインデックス
     * @return  true    ->  SDK上のカリング設定を使用
     *          false   ->  モデルのカリング設定を使用
     */
    getOverrideFlagForOffscreenCullings(offscreenIndex: number): boolean;
    /**
     *
     * @deprecated 名称変更のため非推奨 setOverrideFlagForDrawableCullings(drawableIndex: number, isOverriddenCullings: bolean) に置き換え
     *
     * @param drawableIndex Drawableのインデックス
     * @param isOverriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
     */
    setOverwriteFlagForDrawableCullings(drawableIndex: number, isOverriddenCullings: boolean): void;
    /**
     *
     * @param drawableIndex Drawableのインデックス
     * @param isOverriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
     */
    setOverrideFlagForDrawableCullings(drawableIndex: number, isOverriddenCullings: boolean): void;
    /**
     * モデルの不透明度を取得する
     *
     * @return 不透明度の値
     */
    getModelOapcity(): number;
    /**
     * モデルの不透明度を設定する
     *
     * @param value 不透明度の値
     */
    setModelOapcity(value: number): void;
    /**
     * モデルを取得
     */
    getModel(): Live2DCubismCore.Model;
    /**
     * パーツのインデックスを取得
     * @param partId パーツのID
     * @return パーツのインデックス
     */
    getPartIndex(partId: CubismIdHandle): number;
    /**
     * パーツのIDを取得する。
     *
     * @param partIndex 取得するパーツのインデックス
     * @return パーツのID
     */
    getPartId(partIndex: number): CubismIdHandle;
    /**
     * パーツの個数の取得
     * @return パーツの個数
     */
    getPartCount(): number;
    /**
     * パーツの親パーツインデックスのリストを取得
     *
     * @return パーツの親パーツインデックスのリスト
     */
    getPartParentPartIndices(): Int32Array;
    /**
     * パーツの不透明度の設定(Index)
     * @param partIndex パーツのインデックス
     * @param opacity 不透明度
     */
    setPartOpacityByIndex(partIndex: number, opacity: number): void;
    /**
     * パーツの不透明度の設定(Id)
     * @param partId パーツのID
     * @param opacity パーツの不透明度
     */
    setPartOpacityById(partId: CubismIdHandle, opacity: number): void;
    /**
     * パーツの不透明度の取得(index)
     * @param partIndex パーツのインデックス
     * @return パーツの不透明度
     */
    getPartOpacityByIndex(partIndex: number): number;
    /**
     * パーツの不透明度の取得(id)
     * @param partId パーツのＩｄ
     * @return パーツの不透明度
     */
    getPartOpacityById(partId: CubismIdHandle): number;
    /**
     * パラメータのインデックスの取得
     * @param パラメータID
     * @return パラメータのインデックス
     */
    getParameterIndex(parameterId: CubismIdHandle): number;
    /**
     * パラメータの個数の取得
     * @return パラメータの個数
     */
    getParameterCount(): number;
    /**
     * パラメータの種類の取得
     * @param parameterIndex パラメータのインデックス
     * @return csmParameterType_Normal -> 通常のパラメータ
     *          csmParameterType_BlendShape -> ブレンドシェイプパラメータ
     */
    getParameterType(parameterIndex: number): Live2DCubismCore.csmParameterType;
    /**
     * パラメータの最大値の取得
     * @param parameterIndex パラメータのインデックス
     * @return パラメータの最大値
     */
    getParameterMaximumValue(parameterIndex: number): number;
    /**
     * パラメータの最小値の取得
     * @param parameterIndex パラメータのインデックス
     * @return パラメータの最小値
     */
    getParameterMinimumValue(parameterIndex: number): number;
    /**
     * パラメータのデフォルト値の取得
     * @param parameterIndex パラメータのインデックス
     * @return パラメータのデフォルト値
     */
    getParameterDefaultValue(parameterIndex: number): number;
    /**
     * 指定したパラメータindexのIDを取得
     *
     * @param parameterIndex パラメータのインデックス
     * @return パラメータID
     */
    getParameterId(parameterIndex: number): CubismIdHandle;
    /**
     * パラメータの値の取得
     * @param parameterIndex    パラメータのインデックス
     * @return パラメータの値
     */
    getParameterValueByIndex(parameterIndex: number): number;
    /**
     * パラメータの値の取得
     * @param parameterId    パラメータのID
     * @return パラメータの値
     */
    getParameterValueById(parameterId: CubismIdHandle): number;
    /**
     * パラメータの値の設定
     * @param parameterIndex パラメータのインデックス
     * @param value パラメータの値
     * @param weight 重み
     */
    setParameterValueByIndex(parameterIndex: number, value: number, weight?: number): void;
    /**
     * パラメータの値の設定
     * @param parameterId パラメータのID
     * @param value パラメータの値
     * @param weight 重み
     */
    setParameterValueById(parameterId: CubismIdHandle, value: number, weight?: number): void;
    /**
     * パラメータの値の加算(index)
     * @param parameterIndex パラメータインデックス
     * @param value 加算する値
     * @param weight 重み
     */
    addParameterValueByIndex(parameterIndex: number, value: number, weight?: number): void;
    /**
     * パラメータの値の加算(id)
     * @param parameterId パラメータＩＤ
     * @param value 加算する値
     * @param weight 重み
     */
    addParameterValueById(parameterId: any, value: number, weight?: number): void;
    /**
     * Gets whether the parameter has the repeat setting.
     *
     * @param parameterIndex Parameter index
     *
     * @return true if it is set, otherwise returns false.
     */
    isRepeat(parameterIndex: number): boolean;
    /**
     * Returns the calculated result ensuring the value falls within the parameter's range.
     *
     * @param parameterIndex Parameter index
     * @param value Parameter value
     *
     * @return a value that falls within the parameter’s range. If the parameter does not exist, returns it as is.
     */
    getParameterRepeatValue(parameterIndex: number, value: number): number;
    /**
     * Returns the result of clamping the value to ensure it falls within the parameter's range.
     *
     * @param parameterIndex Parameter index
     * @param value Parameter value
     *
     * @return the clamped value. If the parameter does not exist, returns it as is.
     */
    getParameterClampValue(parameterIndex: number, value: number): number;
    /**
     * Returns the repeat of the parameter.
     *
     * @param parameterIndex Parameter index
     *
     * @return the raw data parameter repeat from the Cubism Core.
     */
    getParameterRepeats(parameterIndex: number): boolean;
    /**
     * パラメータの値の乗算
     * @param parameterId パラメータのID
     * @param value 乗算する値
     * @param weight 重み
     */
    multiplyParameterValueById(parameterId: CubismIdHandle, value: number, weight?: number): void;
    /**
     * パラメータの値の乗算
     * @param parameterIndex パラメータのインデックス
     * @param value 乗算する値
     * @param weight 重み
     */
    multiplyParameterValueByIndex(parameterIndex: number, value: number, weight?: number): void;
    /**
     * Drawableのインデックスの取得
     * @param drawableId DrawableのID
     * @return Drawableのインデックス
     */
    getDrawableIndex(drawableId: CubismIdHandle): number;
    /**
     * Drawableの個数の取得
     * @return drawableの個数
     */
    getDrawableCount(): number;
    /**
     * DrawableのIDを取得する
     * @param drawableIndex Drawableのインデックス
     * @return drawableのID
     */
    getDrawableId(drawableIndex: number): CubismIdHandle;
    /**
     * Drawableの描画順リストの取得
     * @return Drawableの描画順リスト
     */
    getRenderOrders(): Int32Array;
    /**
     * @deprecated
     * 関数名が誤っていたため、代替となる getDrawableTextureIndex を追加し、この関数は非推奨となりました。
     *
     * Drawableのテクスチャインデックスリストの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableのテクスチャインデックスリスト
     */
    getDrawableTextureIndices(drawableIndex: number): number;
    /**
     * Drawableのテクスチャインデックスの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableのテクスチャインデックス
     */
    getDrawableTextureIndex(drawableIndex: number): number;
    /**
     * DrawableのVertexPositionsの変化情報の取得
     *
     * 直近のCubismModel.update関数でDrawableの頂点情報が変化したかを取得する。
     *
     * @param   drawableIndex   Drawableのインデックス
     * @return  true    Drawableの頂点情報が直近のCubismModel.update関数で変化した
     *          false   Drawableの頂点情報が直近のCubismModel.update関数で変化していない
     */
    getDrawableDynamicFlagVertexPositionsDidChange(drawableIndex: number): boolean;
    /**
     * Drawableの頂点インデックスの個数の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点インデックスの個数
     */
    getDrawableVertexIndexCount(drawableIndex: number): number;
    /**
     * Drawableの頂点の個数の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点の個数
     */
    getDrawableVertexCount(drawableIndex: number): number;
    /**
     * Drawableの頂点リストの取得
     * @param drawableIndex drawableのインデックス
     * @return drawableの頂点リスト
     */
    getDrawableVertices(drawableIndex: number): Float32Array;
    /**
     * Drawableの頂点インデックスリストの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点インデックスリスト
     */
    getDrawableVertexIndices(drawableIndex: number): Uint16Array;
    /**
     * Drawableの頂点リストの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点リスト
     */
    getDrawableVertexPositions(drawableIndex: number): Float32Array;
    /**
     * Drawableの頂点のUVリストの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点UVリスト
     */
    getDrawableVertexUvs(drawableIndex: number): Float32Array;
    /**
     * Drawableの不透明度の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの不透明度
     */
    getDrawableOpacity(drawableIndex: number): number;
    /**
     * Drawableの乗算色の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの乗算色(RGBA)
     * スクリーン色はRGBAで取得されるが、Aは必ず0
     */
    getDrawableMultiplyColor(drawableIndex: number): CubismTextureColor;
    /**
     * Drawableのスクリーン色の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableのスクリーン色(RGBA)
     * スクリーン色はRGBAで取得されるが、Aは必ず0
     */
    getDrawableScreenColor(drawableIndex: number): CubismTextureColor;
    /**
     * Offscreenの乗算色の取得
     * @param offscreenIndex Offscreenのインデックス
     * @return Offscreenの乗算色(RGBA)
     * スクリーン色はRGBAで取得されるが、Aは必ず0
     */
    getOffscreenMultiplyColor(offscreenIndex: number): CubismTextureColor;
    /**
     * Offscreenのスクリーン色の取得
     * @param offscreenIndex Offscreenのインデックス
     * @return Offscreenのスクリーン色(RGBA)
     * スクリーン色はRGBAで取得されるが、Aは必ず0
     */
    getOffscreenScreenColor(offscreenIndex: number): CubismTextureColor;
    /**
     * Drawableの親パーツのインデックスの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの親パーツのインデックス
     */
    getDrawableParentPartIndex(drawableIndex: number): number;
    /**
     * Drawableのブレンドモードを取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableのブレンドモード
     */
    getDrawableBlendMode(drawableIndex: number): CubismBlendMode;
    /**
     * Drawableのカラーブレンドの取得(Cubism 5.3 以降)
     *
     * @param drawableIndex Drawableのインデックス
     * @return Drawableのカラーブレンド
     */
    getDrawableColorBlend(drawableIndex: number): CubismColorBlend;
    /**
     * Drawableのアルファブレンドの取得(Cubism 5.3 以降)
     *
     * @param drawableIndex Drawableのインデックス
     * @return Drawableのアルファブレンド
     */
    getDrawableAlphaBlend(drawableIndex: number): CubismAlphaBlend;
    /**
     * Drawableのマスクの反転使用の取得
     *
     * Drawableのマスク使用時の反転設定を取得する。
     * マスクを使用しない場合は無視される。
     *
     * @param drawableIndex Drawableのインデックス
     * @return Drawableの反転設定
     */
    getDrawableInvertedMaskBit(drawableIndex: number): boolean;
    /**
     * Drawableのクリッピングマスクリストの取得
     * @return Drawableのクリッピングマスクリスト
     */
    getDrawableMasks(): Int32Array[];
    /**
     * Drawableのクリッピングマスクの個数リストの取得
     * @return Drawableのクリッピングマスクの個数リスト
     */
    getDrawableMaskCounts(): Int32Array;
    /**
     * クリッピングマスクの使用状態
     *
     * @return true クリッピングマスクを使用している
     * @return false クリッピングマスクを使用していない
     */
    isUsingMasking(): boolean;
    /**
     * Offscreenでクリッピングマスクを使用しているかどうかを取得
     *
     * @return true クリッピングマスクをオフスクリーンで使用している
     */
    isUsingMaskingForOffscreen(): boolean;
    /**
     * Drawableの表示情報を取得する
     *
     * @param drawableIndex Drawableのインデックス
     * @return true Drawableが表示
     * @return false Drawableが非表示
     */
    getDrawableDynamicFlagIsVisible(drawableIndex: number): boolean;
    /**
     * DrawableのDrawOrderの変化情報の取得
     *
     * 直近のCubismModel.update関数でdrawableのdrawOrderが変化したかを取得する。
     * drawOrderはartMesh上で指定する0から1000の情報
     * @param drawableIndex drawableのインデックス
     * @return true drawableの不透明度が直近のCubismModel.update関数で変化した
     * @return false drawableの不透明度が直近のCubismModel.update関数で変化している
     */
    getDrawableDynamicFlagVisibilityDidChange(drawableIndex: number): boolean;
    /**
     * Drawableの不透明度の変化情報の取得
     *
     * 直近のCubismModel.update関数でdrawableの不透明度が変化したかを取得する。
     *
     * @param drawableIndex drawableのインデックス
     * @return true Drawableの不透明度が直近のCubismModel.update関数で変化した
     * @return false Drawableの不透明度が直近のCubismModel.update関数で変化してない
     */
    getDrawableDynamicFlagOpacityDidChange(drawableIndex: number): boolean;
    /**
     * Drawableの描画順序の変化情報の取得
     *
     * 直近のCubismModel.update関数でDrawableの描画の順序が変化したかを取得する。
     *
     * @param drawableIndex Drawableのインデックス
     * @return true Drawableの描画の順序が直近のCubismModel.update関数で変化した
     * @return false Drawableの描画の順序が直近のCubismModel.update関数で変化してない
     */
    getDrawableDynamicFlagRenderOrderDidChange(drawableIndex: number): boolean;
    /**
     * Drawableの乗算色・スクリーン色の変化情報の取得
     *
     * 直近のCubismModel.update関数でDrawableの乗算色・スクリーン色が変化したかを取得する。
     *
     * @param drawableIndex Drawableのインデックス
     * @return true Drawableの乗算色・スクリーン色が直近のCubismModel.update関数で変化した
     * @return false Drawableの乗算色・スクリーン色が直近のCubismModel.update関数で変化してない
     */
    getDrawableDynamicFlagBlendColorDidChange(drawableIndex: number): boolean;
    /**
     * オフスクリーンの個数を取得する
     * @return オフスクリーンの個数
     */
    getOffscreenCount(): number;
    /**
     * Offscreenのカラーブレンドの取得(Cubism 5.3 以降)
     *
     * @param offscreenIndex Offscreenのインデックス
     * @return Offscreenのカラーブレンド
     */
    getOffscreenColorBlend(offscreenIndex: number): CubismColorBlend;
    /**
     * Offscreenのアルファブレンドの取得(Cubism 5.3 以降)
     *
     * @param offscreenIndex Offscreenのインデックス
     * @return Offscreenのアルファブレンド
     */
    getOffscreenAlphaBlend(offscreenIndex: number): CubismAlphaBlend;
    /**
     * オフスクリーンのオーナーインデックス配列を取得する
     * @return オフスクリーンのオーナーインデックス配列
     */
    getOffscreenOwnerIndices(): Int32Array;
    /**
     * オフスクリーンの不透明度を取得
     * @param offscreenIndex オフスクリーンのインデックス
     * @return 不透明度
     */
    getOffscreenOpacity(offscreenIndex: number): number;
    /**
     * オフスクリーンのクリッピングマスクリストの取得
     * @return オフスクリーンのクリッピングマスクリスト
     */
    getOffscreenMasks(): Int32Array[];
    /**
     * オフスクリーンのクリッピングマスクの個数リストの取得
     * @return オフスクリーンのクリッピングマスクの個数リスト
     */
    getOffscreenMaskCounts(): Int32Array;
    /**
     * オフスクリーンのマスク反転設定を取得する
     * @param offscreenIndex オフスクリーンのインデックス
     * @return オフスクリーンのマスク反転設定
     */
    getOffscreenInvertedMask(offscreenIndex: number): boolean;
    /**
     * ブレンドモード使用判定
     * @return ブレンドモードを使用しているか
     */
    isBlendModeEnabled(): boolean;
    /**
     * 保存されたパラメータの読み込み
     */
    loadParameters(): void;
    /**
     * 初期化する
     */
    initialize(): void;
    /**
     * パーツ階層構造を取得する
     * @return パーツ階層構造の配列
     */
    getPartsHierarchy(): Array<CubismModelPartInfo>;
    /**
     * パーツ階層構造をセットアップする
     */
    setupPartsHierarchy(): void;
    /**
     * 指定したパーツの子描画オブジェクト情報を取得・構築する
     * @param partInfoIndex パーツ情報のインデックス
     * @return PartChildDrawObjects
     */
    getPartChildDrawObjects(partInfoIndex: number): PartChildDrawObjects;
    /**
     * パーツのオフスクリーンインデックス配列を取得
     * @return Int32Array offscreenIndices
     */
    private getOffscreenIndices;
    /**
     * コンストラクタ
     * @param model モデル
     */
    constructor(model: Live2DCubismCore.Model);
    /**
     * デストラクタ相当の処理
     */
    release(): void;
    private _notExistPartOpacities;
    private _notExistPartId;
    private _notExistParameterValues;
    private _notExistParameterId;
    private _savedParameters;
    /**
     * Flag to determine whether to override model-wide parameter repeats on the SDK
     */
    private _isOverriddenParameterRepeat;
    private _isOverriddenModelMultiplyColors;
    private _isOverriddenModelScreenColors;
    /**
     * List to manage ParameterRepeat and Override flag to be set for each Parameter
     */
    private _userParameterRepeatDataList;
    private _userDrawableMultiplyColors;
    private _userDrawableScreenColors;
    private _userPartScreenColors;
    private _userPartMultiplyColors;
    private _userOffscreenMultiplyColors;
    private _userOffscreenScreenColors;
    private _partChildDrawables;
    private _partsHierarchy;
    private _model;
    private _parameterValues;
    private _parameterMaximumValues;
    private _parameterMinimumValues;
    private _partOpacities;
    private _offscreenOpacities;
    private _modelOpacity;
    private _parameterIds;
    private _partIds;
    private _drawableIds;
    private _isOverriddenCullings;
    private _userDrawableCullings;
    private _userOffscreenCullings;
    private _isBlendModeEnabled;
    private _drawableColorBlends;
    private _drawableAlphaBlends;
    private _offscreenColorBlends;
    private _offscreenAlphaBlends;
    private _drawableMultiplyColors;
    private _drawableScreenColors;
    private _offscreenMultiplyColors;
    private _offscreenScreenColors;
}
import * as $ from './cubismmodel';
export declare namespace Live2DCubismFramework {
    const CubismModel: typeof $.CubismModel;
    type CubismModel = $.CubismModel;
}
//# sourceMappingURL=cubismmodel.d.ts.map