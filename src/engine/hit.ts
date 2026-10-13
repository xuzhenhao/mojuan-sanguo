/**
 * 命中框（#118 / acceptance.md §1 触控）：所有可点区域的热区至少 44×44 dp。
 * 视觉尺寸不变，只把命中框以原中心向外补足到 MIN_HIT。
 * 调试 `?debug=hit`（只在开发构建：import.meta.env.DEV）：描边画出最近用过的命中框，正式构建被摇树去掉。
 */
import type { Rect, Vec2 } from './types';

export const MIN_HIT = 44;

/** 把 r 补足到 ≥ MIN_HIT（居中扩展，不缩小） */
export function hitBox(r: Rect, min = MIN_HIT): Rect {
  const w = Math.max(r.w, min);
  const h = Math.max(r.h, min);
  return { x: r.x - (w - r.w) / 2, y: r.y - (h - r.h) / 2, w, h };
}

/** 命中判断：按补足后的命中框 */
export function hitInside(r: Rect, p: Vec2, pad = 0): boolean {
  const b = hitBox(r);
  if (import.meta.env.DEV && hitDebug.on) markHit(r);
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
}

// ───────── 调试描边（仅 DEV） ─────────
export const hitDebug = { on: false, rects: new Map<string, Rect>() };
/** 登记一个可点区域（绘制按钮时调用；正式构建为空操作） */
export function markHit(r: Rect) {
  if (!import.meta.env.DEV || !hitDebug.on) return;
  const b = hitBox(r);
  hitDebug.rects.set(`${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`, b);
}
