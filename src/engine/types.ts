/** 引擎基础类型：不依赖 DOM 类型，便于在 node 测试和微信环境下复用。 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Vec2 {
  x: number;
  y: number;
}
export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

/** 2D 上下文里引擎用到的最小子集 */
export interface Ctx2DLike {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(img: unknown, dx: number, dy: number, dw?: number, dh?: number): void;
  fillText?(text: string, x: number, y: number): void;
  globalAlpha: number;
  fillStyle: unknown;
  font?: string;
}
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: string, opts?: unknown): unknown;
}
export interface Canvas2DLike extends CanvasLike {
  getContext(type: '2d'): Ctx2DLike | null;
  getContext(type: string, opts?: unknown): unknown;
}
