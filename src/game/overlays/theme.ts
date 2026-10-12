/**
 * 战斗弹层的共用绘制工具（render-spec §1 令牌色）。只用 Ctx2DLike 必备方法；
 * 弧线、描边等可选方法存在时才使用（测试替身里没有也不报错）。
 */
import type { Ctx2DLike, Rect, Vec2 } from '../../engine/types';

export const C = {
  lacquer: '#2a0f0c',
  lacquerDeep: '#1a0806',
  gold: '#d9b46a',
  goldDeep: '#8c6a2e',
  paper: '#f3ebd8',
  ink: '#1a1a1a',
  cinnabar: '#c0392b',
  jade: '#2f6b4f',
  mask: 'rgba(5,2,1,.72)',
  dim: 'rgba(5,2,1,.55)',
} as const;

/** Canvas 2D 的可选扩展方法 */
export type Ctx2DExt = Ctx2DLike &
  Partial<{
    beginPath(): void;
    closePath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
    arc(x: number, y: number, r: number, a0: number, a1: number): void;
    stroke(): void;
    fill(): void;
    strokeRect(x: number, y: number, w: number, h: number): void;
    measureText(t: string): { width: number };
    save(): void;
    restore(): void;
    strokeStyle: unknown;
    lineWidth: number;
    textAlign: string;
    textBaseline: string;
  }>;

export const ext = (c: Ctx2DLike) => c as Ctx2DExt;
export const inside = (r: Rect, p: Vec2) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** 金描边框（strokeRect 不可用时退化为 4 条细矩形） */
export function frame(c: Ctx2DLike, r: Rect, color: string = C.gold, w = 1.5) {
  const x = ext(c);
  if (x.strokeRect) {
    x.strokeStyle = color;
    x.lineWidth = w;
    x.strokeRect(r.x, r.y, r.w, r.h);
    return;
  }
  c.fillStyle = color;
  c.fillRect(r.x, r.y, r.w, w);
  c.fillRect(r.x, r.y + r.h - w, r.w, w);
  c.fillRect(r.x, r.y, w, r.h);
  c.fillRect(r.x + r.w - w, r.y, w, r.h);
}

export function text(c: Ctx2DLike, s: string, x: number, y: number, font: string, color: string) {
  c.font = font;
  c.fillStyle = color;
  c.fillText?.(s, x, y);
}

/** 估算文字宽度（无 measureText 时：CJK 按字号、ASCII 按半字号） */
export function textWidth(c: Ctx2DLike, s: string, px: number) {
  const m = ext(c).measureText;
  if (m) return m.call(c, s).width;
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? px : px * 0.55;
  return w;
}

/** 按宽度折行（逐字，中文无空格） */
export function wrap(c: Ctx2DLike, s: string, maxW: number, px: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of s) {
    if (cur && textWidth(c, cur + ch, px) > maxW) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
