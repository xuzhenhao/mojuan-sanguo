/** 点将页布局（390 基准 dp，对照 public/mockups/v3/select.html 与 acceptance.md §3「选将」） */
import type { Rect } from '../../engine/types';

export const SELECT_LAYOUT = {
  soul: { x: 12, y: 10, w: 84, h: 26 } as Rect,
  title: { cx: 195, y: 52, h: 40 },
  /** 主槽 176×240 */
  main: { x: 22, y: 112, w: 176, h: 240 } as Rect,
  /** 副槽 122×166 */
  sub: { x: 214, y: 170, w: 122, h: 166 } as Rect,
  swap: { x: 338, y: 230, w: 34, h: 34 } as Rect,
  /** 技能印 46⌀ */
  skillY: 362,
  skillD: 46,
  combo: { x: 22, y: 414, w: 346, h: 20 } as Rect,
  grid: { x: 14, y: 440, w: 362, cols: 4, gapX: 8, gapY: 10, cellH: 116 },
  book: { y: 690 },
  bar: { y: 772, h: 72 },
  start: { x: 226, y: 779, w: 150, h: 44 } as Rect,
} as const;

export function gridCell(i: number): Rect {
  const g = SELECT_LAYOUT.grid;
  const w = (g.w - g.gapX * (g.cols - 1)) / g.cols;
  const col = i % g.cols;
  const row = Math.floor(i / g.cols);
  return { x: g.x + col * (w + g.gapX), y: g.y + row * (g.cellH + g.gapY), w, h: g.cellH };
}

/** 技能印位置：主将技（金）在左，分隔线，副将技（银）在后 */
export function skillSeals(mainCount: number, hasSub: boolean): { kind: 'main' | 'sub'; index: number; rect: Rect }[] {
  const d = SELECT_LAYOUT.skillD;
  const out: { kind: 'main' | 'sub'; index: number; rect: Rect }[] = [];
  let x = 22;
  for (let i = 0; i < mainCount; i++) {
    out.push({ kind: 'main', index: i, rect: { x, y: SELECT_LAYOUT.skillY, w: d, h: d } });
    x += d + 8;
  }
  x += 13; // 分隔线 1px + 两侧 6
  if (hasSub) out.push({ kind: 'sub', index: 0, rect: { x, y: SELECT_LAYOUT.skillY, w: d, h: d } });
  return out;
}

export function inside(r: Rect, p: { x: number; y: number }, pad = 0) {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

/** 热区至少 44×44（acceptance.md §1 触控） */
export function hitPad(r: Rect) {
  return Math.max(0, (44 - Math.min(r.w, r.h)) / 2);
}
