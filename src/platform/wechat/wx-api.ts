/**
 * 微信小游戏运行时 API 子集（#204）：平台实现只依赖这个接口，便于单测注入 mock。
 * 不采集 openid / 用户信息；不引入 weapp-adapter。
 */
import type { Canvas2DLike } from '../../engine/types';

/** 触摸点（逻辑像素；与 engine TouchPoint 字段对应） */
export interface WxTouch {
  identifier: number;
  clientX: number;
  clientY: number;
  x?: number;
  y?: number;
}
export interface WxTouchEvent {
  touches: WxTouch[];
  changedTouches: WxTouch[];
}
export interface WxSafeArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}
export interface WxWindowInfo {
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
  safeArea?: WxSafeArea;
  /** 部分基础库把平台写在 windowInfo；没有则再读 getSystemInfoSync / getDeviceInfo */
  platform?: string;
}
export interface WxMenuButtonRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}
export interface WxLaunchOptions {
  query: Record<string, string | undefined>;
}
export interface WxRealtimeLog {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /** 基础库 ≥2.7.3：设置过滤关键字（不可含空格），便于后台检索 */
  setFilterMsg?(msg: string): void;
  /** 追加过滤关键字（不可含空格） */
  addFilterMsg?(msg: string): void;
}
/** 上屏 / 离屏画布：与 Canvas2DLike 兼容；首个 createCanvas 为上屏 */
export type WxCanvas = Canvas2DLike;

export interface WxApi {
  createCanvas(): WxCanvas;
  getWindowInfo(): WxWindowInfo;
  /** 旧基础库回退；可缺 */
  getSystemInfoSync?(): { platform?: string; windowWidth?: number; windowHeight?: number; pixelRatio?: number; safeArea?: WxSafeArea };
  getMenuButtonBoundingClientRect(): WxMenuButtonRect;
  onTouchStart(cb: (e: WxTouchEvent) => void): void;
  onTouchMove(cb: (e: WxTouchEvent) => void): void;
  onTouchEnd(cb: (e: WxTouchEvent) => void): void;
  onTouchCancel(cb: (e: WxTouchEvent) => void): void;
  onShow(cb: () => void): void;
  onHide(cb: () => void): void;
  /** 竖屏锁定时可选；有则挂到 Platform.onResize */
  onWindowResize?(cb: (res: { windowWidth: number; windowHeight: number }) => void): void;
  getLaunchOptionsSync(): WxLaunchOptions;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, data: unknown): void;
  removeStorageSync(key: string): void;
  loadFont?(path: string): string | null | undefined;
  getRealtimeLogManager?(): WxRealtimeLog;
  getPerformance?(): { now(): number };
  /** 小游戏基础库提供；注入便于单测 */
  requestAnimationFrame?(cb: (t: number) => void): number;
}
