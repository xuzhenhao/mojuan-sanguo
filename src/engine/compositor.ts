/**
 * 合成（engine-design §4.12.1）。
 * - Canvas2DCompositor：始终存在。把 bg → ambient → main 三块 2D 离屏画布直接 drawImage 到上屏画布。
 *   WebGL 关闭时这是唯一路径，画面完整可玩，只是没有水墨特效。
 * - WebGLOverlay：可选。独立透明画布叠在上屏画布之上，只画水墨特效；不回读、不接收输入。
 */
import type { Surface, SurfaceName } from './surfaces';
import { SURFACE_ORDER } from './surfaces';
import type { Canvas2DLike, CanvasLike, Ctx2DLike, Rect, Vec2 } from './types';

export class Canvas2DCompositor {
  readonly ctx: Ctx2DLike;
  composites = 0;
  constructor(readonly target: Canvas2DLike) {
    const ctx = target.getContext('2d');
    if (!ctx) throw new Error('无法获取上屏 2D 上下文');
    this.ctx = ctx;
  }
  /** 只要任一层脏就整屏重新合成（每层是一张贴图，代价很小） */
  compose(surfaces: Record<SurfaceName, Surface>, force = false): boolean {
    if (!force && !SURFACE_ORDER.some((n) => surfaces[n].dirty)) return false;
    const { ctx, target } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, target.width, target.height);
    for (const n of SURFACE_ORDER) {
      ctx.drawImage(surfaces[n].canvas, 0, 0, target.width, target.height);
      surfaces[n].dirty = false;
    }
    this.composites++;
    return true;
  }
}

export type InkFxId =
  | 'ink_bloom'
  | 'bleed'
  | 'paper_grain'
  | 'ink_transition'
  | 'ink_dissolve'
  | 'cinnabar_splash'
  | 'gold_shimmer'
  | 'epiphany_gather'
  | 'brush_stroke'
  | 'ripple'
  | 'scroll_reveal'
  | 'vignette_light'
  | 'hurt_edge';
export interface InkFx {
  id: InkFxId;
  rect?: Rect;
  at?: Vec2;
  progress: number;
  loop?: boolean;
}

/** WebGL1 最小子集（便于测试替身） */
export interface GLLike {
  COLOR_BUFFER_BIT: number;
  viewport(x: number, y: number, w: number, h: number): void;
  clearColor(r: number, g: number, b: number, a: number): void;
  clear(mask: number): void;
  isContextLost?(): boolean;
}

/** WebGL 叠加层骨架：P0 只负责建上下文、清屏、计数；13 项特效在 P3 实现 */
export class WebGLOverlay {
  readonly gl: GLLike;
  frames = 0;
  lost = false;
  constructor(readonly canvas: CanvasLike) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false }) as GLLike | null;
    if (!gl) throw new Error('WebGL 不可用');
    this.gl = gl;
  }
  frame(fx: readonly InkFx[]) {
    if (this.lost || this.gl.isContextLost?.()) return;
    const { gl, canvas } = this;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    void fx; // P3：按 fx 列表执行特效 pass
    this.frames++;
  }
  /** 有特效实例时才需要继续出帧 */
  static needsFrame(fx: readonly InkFx[]) {
    return fx.length > 0;
  }
}
