/**
 * 平台适配层接口（engine-design §4.1）。业务和引擎只通过它访问平台能力，
 * 不得直接使用 window / document / wx。web 与 wechat 各实现一份。
 */
import type { Canvas2DLike, CanvasLike, Rect, TouchPoint } from '../engine/types';

export interface SystemInfo {
  /** 逻辑像素（CSS px / dp） */
  width: number;
  height: number;
  dpr: number;
  safeArea: Rect;
  /** 微信胶囊禁区；H5 为 null */
  capsule: Rect | null;
  platform: 'ios' | 'android' | 'devtools' | 'pc' | 'web';
}

export interface TouchHandlers {
  start(t: TouchPoint[]): void;
  move(t: TouchPoint[]): void;
  end(t: TouchPoint[]): void;
  cancel(t: TouchPoint[]): void;
}

export interface AudioAdapter {
  playBgm(key: string, opt?: { loop?: boolean; volume?: number; fadeMs?: number }): void;
  playSfx(key: string, opt?: { volume?: number }): void;
  stopBgm(fadeMs?: number): void;
  setMuted(m: boolean): void;
}
export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, v: string): void;
  remove(key: string): void;
}
export interface AdsAdapter {
  /** H5：每局免费 1 次（engine-design §4.1，已决定） */
  rewarded(placement: string): Promise<'completed' | 'skipped' | 'unavailable'>;
  /** 新一局开始时重置每局次数 */
  resetRun(): void;
}
export interface ShareAdapter {
  share(p: { title: string; imageUrl?: string; query?: string }): Promise<boolean>;
  query(): Record<string, string>;
}
export interface SubpackageLoader {
  load(name: string, onProgress?: (p: number) => void): Promise<void>;
}
export interface ErrorReport {
  message: string;
  stack?: string;
  version?: string;
  configVersion?: string;
  seed?: string;
}

export interface Platform {
  readonly name: 'web' | 'wechat';
  systemInfo(): SystemInfo;
  /** 上屏 2D 画布（2D 合成目标） */
  mainCanvas(): Canvas2DLike;
  /** 可选的 WebGL 叠加画布（叠在上屏画布之上，透明、不接收输入）；不支持时返回 null */
  createOverlayCanvas(): CanvasLike | null;
  createOffscreen(w: number, h: number): Canvas2DLike;
  onTouch(h: TouchHandlers): void;
  onShow(cb: () => void): void;
  onHide(cb: () => void): void;
  raf(cb: (t: number) => void): number;
  now(): number;
  /** 启动参数（H5 为 URL query） */
  launchQuery(): Record<string, string>;
  audio: AudioAdapter;
  storage: StorageAdapter;
  ads: AdsAdapter;
  share: ShareAdapter;
  loader: SubpackageLoader;
  reportError(e: ErrorReport): void;
  warn(msg: string, data?: unknown): void;
}
