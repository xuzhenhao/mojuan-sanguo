/**
 * 视口等比缩放（render-spec §4.0，#111）。
 * 设计坐标固定 390×844；s = min(safeW/390, safeH/844)，内容层在安全区内居中。
 * 场景只看到设计坐标；底纹层用真实 W×H 单独绘制。
 */
import type { Rect, Vec2 } from './types';

export const DESIGN_W = 390;
export const DESIGN_H = 844;
export const DESIGN_RECT: Rect = { x: 0, y: 0, w: DESIGN_W, h: DESIGN_H };

export interface Viewport {
  /** 真实视口（CSS px） */
  width: number;
  height: number;
  /** 设计坐标 → CSS px 的缩放 */
  s: number;
  /** 设计框左上角在视口中的位置（CSS px） */
  offsetX: number;
  offsetY: number;
}

/** safe 为视口内的安全区（CSS px）；缺省为整个视口 */
export function computeViewport(width: number, height: number, safe?: Rect): Viewport {
  const sa = safe && safe.w > 0 && safe.h > 0 ? safe : { x: 0, y: 0, w: width, h: height };
  const s = Math.min(sa.w / DESIGN_W, sa.h / DESIGN_H);
  return {
    width,
    height,
    s,
    offsetX: sa.x + (sa.w - DESIGN_W * s) / 2,
    offsetY: sa.y + (sa.h - DESIGN_H * s) / 2,
  };
}

/** 屏幕（CSS px）→ 设计坐标 */
export function toDesign(vp: Viewport, p: Vec2): Vec2 {
  return { x: (p.x - vp.offsetX) / vp.s, y: (p.y - vp.offsetY) / vp.s };
}
/** 设计坐标 → 屏幕（CSS px） */
export function toScreen(vp: Viewport, p: Vec2): Vec2 {
  return { x: p.x * vp.s + vp.offsetX, y: p.y * vp.s + vp.offsetY };
}
/** 某层绘制矩阵：k = dpr × 层缩放；返回 setTransform 参数 */
export function layerTransform(vp: Viewport, k: number): [number, number, number, number, number, number] {
  const m = k * vp.s;
  return [m, 0, 0, m, k * vp.offsetX, k * vp.offsetY];
}
