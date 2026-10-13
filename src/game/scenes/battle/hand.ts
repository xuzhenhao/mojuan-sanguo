/**
 * B 风格手牌：平铺叠放（不扇形）。张数多时自动压缩间距，保证整手牌都在可用宽度内、不被裁切（#57）；
 * 只有压缩到最小间距 HAND_MIN_STEP（左侧费用 + 花色点数列仍可见）还放不下时，才改为横向滚动（>7 张的 B 方案滚动兜底）。
 * 拖拽方向锁定（render-spec §7.2）：起始位移以水平为主且可滚动 → 滚动；否则 → 拖牌出牌。
 */
import type { Rect, Vec2 } from '../../../engine/types';

export const CARD_W = 72;
export const CARD_H = 104;
export const HAND_MAX_VISIBLE = 7;
export const SELECT_LIFT = 22;
/** 叠放最小间距：保证每张牌左侧 22dp 的费用 / 花色 / 点数列露出 */
export const HAND_MIN_STEP = 24;

export interface HandLayout {
  rects: Rect[];
  /** 可滚动的最大偏移（≥0） */
  maxScroll: number;
  step: number;
}

/** area：手牌区（逻辑像素）；scroll：当前滚动偏移 */
export function layoutHand(n: number, area: Rect, scroll = 0, selected = -1): HandLayout {
  if (n <= 0) return { rects: [], maxScroll: 0, step: 0 };
  const gap = 4;
  const step = n <= 1 ? CARD_W + gap : Math.max(HAND_MIN_STEP, Math.min(CARD_W + gap, (area.w - CARD_W) / (n - 1)));
  const total = CARD_W + step * (n - 1);
  const maxScroll = Math.max(0, total - area.w);
  const off = clamp(scroll, 0, maxScroll);
  const x0 = maxScroll > 0 ? area.x - off : area.x + (area.w - total) / 2;
  const rects = Array.from({ length: n }, (_, i) => ({ x: x0 + i * step, y: area.y + (i === selected ? -SELECT_LIFT : 0), w: CARD_W, h: CARD_H }));
  return { rects, maxScroll, step };
}

/** 叠放时后面的牌在上：从后往前命中 */
export function hitHand(l: HandLayout, p: Vec2): number {
  for (let i = l.rects.length - 1; i >= 0; i--) {
    const r = l.rects[i];
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i;
  }
  return -1;
}

export type DragMode = 'scroll' | 'card' | 'none';
/** 方向锁定：水平为主且可滚动 → scroll；起点在牌上 → card */
export function lockDirection(start: Vec2, at: Vec2, scrollable: boolean, onCard: boolean): DragMode {
  const dx = Math.abs(at.x - start.x);
  const dy = Math.abs(at.y - start.y);
  if (scrollable && dx > dy) return 'scroll';
  return onCard ? 'card' : 'none';
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
