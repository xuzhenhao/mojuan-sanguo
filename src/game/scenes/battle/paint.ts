/**
 * 战斗页绘制原语（B 金漆屏风令牌，render-spec §1–§3）。只依赖 Ctx2DLike 的最小子集；
 * 浏览器上下文额外提供的 arc / textAlign 等按需探测使用，测试替身没有也能跑通。
 */
import { markHit } from '../../../engine/hit';
import type { Ctx2DLike, Rect } from '../../../engine/types';

export const C = {
  lac0: '#070302',
  lac1: '#150A08',
  lac2: '#22100B',
  lac3: '#2A1410',
  lac4: '#4A1D14',
  goldHi: '#F4DC9A',
  gold: '#E9C877',
  goldMid: '#B98A3C',
  goldLo: '#8A6A2A',
  goldDk: '#6E4A18',
  paper: '#F3EBD8',
  paper2: '#EFE3C6',
  paper3: '#BFAE88',
  ink: '#1A1A1A',
  cinnabar: '#A63D2F',
  cinnHi: '#D4604C',
  cinnGlow: '#FF6B55',
  dmg: '#FF8A73',
  jade: '#4F9A7C',
  jadeDk: '#1D4A3A',
  jadeHi: '#9AD4B8',
  azure: '#5B7C8A',
  azureHi: '#86AAB8',
  defIntent: '#9CC3D1',
  silver: '#CFD6D9',
  /** 立绘上竖排名字的墨带（#177） */
  inkBand: 'rgba(15,7,5,.72)',
  /** 立绘上竖排名字的 1px 描边（#177） */
  nameStroke: 'rgba(0,0,0,.6)',
} as const;

export const FONT = {
  /** 霞鹜文楷（FontFace 族名 Brush）；正文、数字、书法字同一族名，不回退任何系统字体（#129 / #142） */
  brush: '"Brush"',
  num: '"Brush"',
  body: '"Brush"',
};

type Ext = Ctx2DLike & {
  textAlign?: string;
  textBaseline?: string;
  beginPath?(): void;
  arc?(x: number, y: number, r: number, a: number, b: number): void;
  fill?(): void;
  stroke?(): void;
  moveTo?(x: number, y: number): void;
  lineTo?(x: number, y: number): void;
  quadraticCurveTo?(cx: number, cy: number, x: number, y: number): void;
  lineWidth?: number;
  strokeStyle?: unknown;
  save?(): void;
  restore?(): void;
  measureText?(t: string): { width: number };
  strokeText?(t: string, x: number, y: number): void;
  lineJoin?: string;
};

export function rect(ctx: Ctx2DLike, r: Rect, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}
/** 描边（用 4 条 fillRect，兼容所有上下文） */
export function frame(ctx: Ctx2DLike, r: Rect, color: string, w = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.w, w);
  ctx.fillRect(r.x, r.y + r.h - w, r.w, w);
  ctx.fillRect(r.x, r.y, w, r.h);
  ctx.fillRect(r.x + r.w - w, r.y, w, r.h);
}
export const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d });

/** 金框外壳（3.1）：外框材质 + 内窗 */
export function goldFrame(ctx: Ctx2DLike, r: Rect, variant: 'gold' | 'silver' | 'bronze' | 'jade' = 'gold', pad = 4) {
  const base = { gold: C.goldMid, silver: '#9AA3A7', bronze: '#9A7046', jade: C.jade }[variant];
  const hi = { gold: C.goldHi, silver: C.silver, bronze: '#C49A6A', jade: C.jadeHi }[variant];
  rect(ctx, { x: r.x + 2, y: r.y + 4, w: r.w, h: r.h }, 'rgba(0,0,0,0.55)');
  rect(ctx, r, base);
  frame(ctx, r, hi, 1);
  frame(ctx, inset(r, pad - 1), C.goldDk, 1);
  rect(ctx, inset(r, pad), C.paper2);
}

export function text(
  ctx: Ctx2DLike,
  s: string,
  x: number,
  y: number,
  o: { size?: number; color?: string; font?: string; align?: 'left' | 'center' | 'right'; bold?: boolean; outline?: string } = {},
) {
  const e = ctx as Ext;
  ctx.fillStyle = o.color ?? C.paper;
  ctx.font = `${o.bold ? 'bold ' : ''}${o.size ?? 14}px ${o.font ?? FONT.body}`;
  if ('textAlign' in e || e.measureText) e.textAlign = o.align ?? 'left';
  if ('textBaseline' in e || e.measureText) e.textBaseline = 'middle';
  if (o.outline && e.strokeText) {
    // 1px 外描边：2px 线宽描边后再填字，盖掉内侧一半
    e.strokeStyle = o.outline;
    e.lineWidth = 2;
    e.lineJoin = 'round';
    e.strokeText(s, x, y);
  }
  ctx.fillText?.(s, x, y);
  if (e.measureText) e.textAlign = 'left';
}

/** 竖排文字（武将/敌人名） */
export function vtext(ctx: Ctx2DLike, s: string, x: number, y: number, size: number, color: string = C.ink, outline?: string) {
  [...s].forEach((ch, i) => text(ctx, ch, x, y + i * (size + 1), { size, color, font: FONT.brush, align: 'center', outline }));
}

export function circle(ctx: Ctx2DLike, x: number, y: number, r: number, color: string) {
  const e = ctx as Ext;
  ctx.fillStyle = color;
  if (e.beginPath && e.arc && e.fill) {
    e.beginPath();
    e.arc(x, y, r, 0, Math.PI * 2);
    e.fill();
  } else ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
export function ring(ctx: Ctx2DLike, x: number, y: number, r: number, color: string, w: number, from = 0, to = Math.PI * 2) {
  const e = ctx as Ext;
  if (!(e.beginPath && e.arc && e.stroke)) return;
  e.strokeStyle = color;
  e.lineWidth = w;
  e.beginPath();
  e.arc(x, y, r, from, to);
  e.stroke();
}
/** 墨线贝塞尔箭头（拖拽出牌 / 选目标） */
export function arrow(ctx: Ctx2DLike, ax: number, ay: number, bx: number, by: number, color: string = C.cinnGlow) {
  const e = ctx as Ext;
  if (!(e.beginPath && e.moveTo && e.quadraticCurveTo && e.stroke)) return;
  e.strokeStyle = color;
  e.lineWidth = 4;
  e.beginPath();
  e.moveTo(ax, ay);
  e.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 60, bx, by);
  e.stroke();
  circle(ctx, bx, by, 6, color);
}

/** 按钮（3.8）：primary/confirm/secondary，含 disabled */
export function button(ctx: Ctx2DLike, r: Rect, label: string, kind: 'primary' | 'confirm' | 'secondary' = 'primary', disabled = false, size = 20) {
  markHit(r);
  const base = { primary: '#9C3A2B', confirm: '#3E7A62', secondary: '#4A3B2D' }[kind];
  const a = ctx.globalAlpha;
  if (disabled) ctx.globalAlpha = a * 0.45;
  rect(ctx, r, disabled ? '#4a4040' : base);
  frame(ctx, r, C.goldLo, 2);
  frame(ctx, inset(r, 2), C.lac3, 1);
  frame(ctx, inset(r, 3), C.gold, 1);
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size, color: '#FFF3DC', font: FONT.brush, align: 'center' });
  ctx.globalAlpha = a;
}

export function panel(ctx: Ctx2DLike, r: Rect) {
  rect(ctx, r, 'rgba(30,14,10,0.93)');
  frame(ctx, r, C.goldLo, 1);
  frame(ctx, inset(r, 2), C.gold, 1);
}
