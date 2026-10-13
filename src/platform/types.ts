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
  /** 微信 `getDeviceBenchmarkInfo.benchmarkLevel`；H5 / 未知为 undefined（#206） */
  benchmarkLevel?: number;
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
/** 字体加载（#202）：永不抛错，失败返回 false。url 为包内相对路径，各端自行解析（H5 拼 BASE_URL，微信端映射包内文件） */
export interface PlatformFonts {
  load(family: string, url: string): Promise<boolean>;
}
/** 埋点事件（#202；字段由 game/telemetry.ts 维护） */
export interface TelemetryEvent {
  ev: string;
  data: Record<string, unknown>;
  t: number;
}
/** 埋点传输（#202）：telemetry.ts 只缓冲，批量交给平台发送（H5 暂为开发控制台；微信端实时日志，见 #208） */
export interface TelemetryTransport {
  send(batch: TelemetryEvent[]): void;
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
  /** 视口尺寸变化（resize / visualViewport resize / 横竖屏切换） */
  onResize?(cb: () => void): void;
  raf(cb: (t: number) => void): number;
  now(): number;
  /** 启动参数（H5 为 URL query） */
  launchQuery(): Record<string, string>;
  audio: AudioAdapter;
  storage: StorageAdapter;
  ads: AdsAdapter;
  share: ShareAdapter;
  loader: SubpackageLoader;
  fonts: PlatformFonts;
  telemetry: TelemetryTransport;
  /** 是否减少动态（#202）：H5 读 prefers-reduced-motion；微信端为 false */
  prefersReducedMotion(): boolean;
  reportError(e: ErrorReport): void;
  warn(msg: string, data?: unknown): void;
}
