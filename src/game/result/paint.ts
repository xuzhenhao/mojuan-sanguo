/** 结算页与续玩弹窗共用的 B 金漆屏风绘制件（render-spec §1 色板、§3.8 按钮、§3.9 面板） */
import { markHit } from '../../engine/hit';
import type { Ctx2DLike, Rect } from '../../engine/types';
import { ext, frame, textWidth } from '../overlays/theme';

export const B = {
  lac0: '#070302',
  lac1: '#150A08',
  lac2: '#22100B',
  lac3: '#2A1410',
  lac4: '#4A1D14',
  goldHi: '#F4DC9A',
  gold: '#E9C877',
  goldMid: '#B98A3C',
  goldLo: '#8A6A2A',
  paper: '#F3EBD8',
  paper3: '#BFAE88',
  ink: '#1A1A1A',
  cinnabar: '#A63D2F',
  cinnHi: '#D4604C',
  jade: '#4F9A7C',
  btnText: '#FFF3DC',
  mask: 'rgba(5,2,1,.72)',
} as const;

/** 书法字（霞鹜文楷，FontFace 族名 Brush）；禁止系统楷体回退 */
export const brush = (px: number) => `${px}px Brush, serif`;
export const body = (px: number, bold = false) => `${bold ? 'bold ' : ''}${px}px "PingFang SC", "Noto Sans SC", sans-serif`;
export const num = (px: number) => `bold ${px}px Georgia, serif`;

export type BtnKind = 'primary' | 'confirm' | 'secondary';
const BTN_FILL: Record<BtnKind, string> = { primary: '#9C3A28', confirm: '#3E7D63', secondary: '#43362A' };

/** 面板：深漆底 + 3 层描边（1.5 gold / 间隔 / gold-lo） */
export function panel(c: Ctx2DLike, r: Rect, alpha = 0.94) {
  c.globalAlpha = alpha;
  c.fillStyle = B.lac3;
  c.fillRect(r.x, r.y, r.w, r.h);
  c.fillStyle = B.lac1;
  c.fillRect(r.x + 3, r.y + r.h * 0.45, r.w - 6, r.h * 0.55 - 3);
  c.globalAlpha = 1;
  frame(c, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, B.goldLo, 1);
  frame(c, r, B.gold, 1.5);
}

/** 按钮（render-spec §3.8：高 44，热区 ≥44） */
export function button(c: Ctx2DLike, r: Rect, label: string, kind: BtnKind, disabled = false) {
  markHit(r);
  c.globalAlpha = disabled ? 0.45 : 1;
  c.fillStyle = BTN_FILL[kind];
  c.fillRect(r.x, r.y, r.w, r.h);
  c.fillStyle = 'rgba(255,255,255,.08)';
  c.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h / 2 - 2);
  frame(c, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }, B.goldLo, 1);
  frame(c, r, B.gold, 1.5);
  center(c, label, r.x + r.w / 2, r.y + r.h / 2 + 7, brush(20), disabled ? B.paper3 : B.btnText, 20);
  c.globalAlpha = 1;
}

/** 水平居中文字（有 textAlign 用 textAlign，否则按估算宽度） */
export function center(c: Ctx2DLike, s: string, cx: number, y: number, font: string, color: string, px: number) {
  c.font = font;
  c.fillStyle = color;
  const x = ext(c);
  if (x.textAlign !== undefined) {
    x.textAlign = 'center';
    c.fillText?.(s, cx, y);
    x.textAlign = 'left';
  } else c.fillText?.(s, cx - textWidth(c, s, px) / 2, y);
}

export function right(c: Ctx2DLike, s: string, rx: number, y: number, font: string, color: string, px: number) {
  c.font = font;
  c.fillStyle = color;
  c.fillText?.(s, rx - textWidth(c, s, px), y);
}

/** 竖排书法字 */
export function vertical(c: Ctx2DLike, s: string, cx: number, y: number, px: number, color: string, gap = 1.08) {
  let yy = y;
  for (const ch of s) {
    center(c, ch, cx, yy, brush(px), color, px);
    yy += px * gap;
  }
}

/** 删除线（败北页折半前的将魂） */
export function strike(c: Ctx2DLike, x: number, y: number, w: number, color: string) {
  c.fillStyle = color;
  c.fillRect(x, y, w, 1.5);
}

/** 剪影立绘占位（正式美术未到：墨色头盔 + 披风） */
export function silhouette(c: Ctx2DLike, r: Rect, color: string) {
  const x = ext(c);
  c.fillStyle = color;
  const cx = r.x + r.w / 2;
  if (x.beginPath && x.arc && x.fill && x.moveTo && x.lineTo) {
    x.beginPath();
    x.arc(cx, r.y + r.h * 0.3, r.w * 0.16, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.moveTo(cx - r.w * 0.12, r.y + r.h * 0.42);
    x.lineTo(cx + r.w * 0.12, r.y + r.h * 0.42);
    x.lineTo(r.x + r.w * 0.95, r.y + r.h);
    x.lineTo(r.x + r.w * 0.05, r.y + r.h);
    x.fill();
  } else {
    c.fillRect(cx - r.w * 0.14, r.y + r.h * 0.16, r.w * 0.28, r.h * 0.26);
    c.fillRect(r.x + r.w * 0.1, r.y + r.h * 0.42, r.w * 0.8, r.h * 0.58);
  }
}
