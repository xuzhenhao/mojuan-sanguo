/**
 * 战斗页背景：金漆屏风（#130，render-spec §8.8.1「屏风背景」，参考 docs/ui/battle-mockups-v2/b.html）。
 * 纯代码绘制，不依赖美术资源。几何（screenLayout）是纯函数，便于测试；绘制对可选的
 * Canvas 能力（渐变 / 路径 / clip）做降级，测试用的极简 ctx 只走 fillRect。
 */
import type { Ctx2DLike, Rect } from '../../../engine/types';

export const PANELS = 6;
/** 奇偶扇横向渐变（左→中→右） */
export const PANEL_ODD = ['#3a160f', '#4a1d14', '#2a100a'] as const;
export const PANEL_EVEN = ['#2c120c', '#3c1810', '#22100b'] as const;
export const GOLD = '#E9C877';
export const GOLD_LO = '#8A6A2A';
export const LAC0 = '#070302';
/** 描金山影纵向范围（设计坐标，顶部对齐，和 layout 一致不随高度缩放） */
export const MOUNT_TOP = 140;
export const MOUNT_BOTTOM = 420;

export interface ScreenLayout {
  frame: Rect;
  panels: { r: Rect; colors: readonly string[] }[];
  /** 折痕 x（扇与扇之间，共 PANELS-1 条） */
  creases: number[];
  /** 山影折线（闭合多边形，底边在 MOUNT_BOTTOM） */
  mountain: { x: number; y: number }[];
  borders: { r: Rect; alpha: number }[];
}

/** b.html 山脊（390 宽设计稿）：x 归一化，y 原值；两端收在内容框内 */
const RIDGE: [number, number][] = [
  [0, 318],
  [40, 240],
  [90, 290],
  [150, 200],
  [220, 300],
  [280, 240],
  [340, 300],
  [390, 236],
];

export function screenLayout(w: number, h: number): ScreenLayout {
  const frame = { x: 0, y: 0, w, h };
  const pw = w / PANELS;
  const panels = Array.from({ length: PANELS }, (_, i) => ({ r: { x: i * pw, y: 0, w: pw, h }, colors: i % 2 === 0 ? PANEL_ODD : PANEL_EVEN }));
  const creases = Array.from({ length: PANELS - 1 }, (_, i) => Math.round((i + 1) * pw));
  const bottom = Math.min(MOUNT_BOTTOM, h);
  const sx = w / 390;
  const mountain = [...RIDGE.map(([x, y]) => ({ x: x * sx, y: Math.max(MOUNT_TOP, Math.min(bottom, y)) })), { x: w, y: bottom }, { x: 0, y: bottom }];
  const borders = [
    { r: { x: 6, y: 6, w: w - 12, h: h - 12 }, alpha: 0.6 },
    { r: { x: 9, y: 9, w: w - 18, h: h - 18 }, alpha: 0.35 },
  ];
  return { frame, panels, creases, mountain, borders };
}

type Grad = { addColorStop(o: number, c: string): void };
type FullCtx = Ctx2DLike & {
  save?(): void;
  restore?(): void;
  beginPath?(): void;
  rect?(x: number, y: number, w: number, h: number): void;
  clip?(): void;
  moveTo?(x: number, y: number): void;
  lineTo?(x: number, y: number): void;
  closePath?(): void;
  fill?(): void;
  stroke?(): void;
  strokeStyle?: unknown;
  lineWidth?: number;
  createLinearGradient?(x0: number, y0: number, x1: number, y1: number): Grad;
  createRadialGradient?(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Grad;
};

/** 纸纹：确定性的稀疏噪点（同尺寸每次一致） */
export function paperDots(w: number, h: number, n = 260): { x: number; y: number; light: boolean }[] {
  let s = 0x9e3779b9 ^ (w * 7919 + h);
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  return Array.from({ length: n }, () => ({ x: Math.floor(r() * w), y: Math.floor(r() * h), light: r() < 0.5 }));
}

export function drawScreenBg(c: Ctx2DLike, w: number, h: number) {
  const ctx = c as FullCtx;
  const L = screenLayout(w, h);
  const a0 = ctx.globalAlpha;
  const canPath = !!(ctx.beginPath && ctx.moveTo && ctx.lineTo && ctx.fill);
  ctx.save?.();
  // 全部先 clip 到内容框（#118）：框外只留引擎底纹
  if (ctx.beginPath && ctx.rect && ctx.clip) {
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
  }
  ctx.fillStyle = LAC0;
  ctx.fillRect(0, 0, w, h);
  // 6 扇漆面
  for (const p of L.panels) {
    const { x, y, w: pw, h: ph } = p.r;
    if (ctx.createLinearGradient) {
      const g = ctx.createLinearGradient(x, 0, x + pw, 0);
      p.colors.forEach((col, i) => g.addColorStop(i / (p.colors.length - 1), col));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, pw, ph);
    } else {
      const sw = pw / p.colors.length;
      p.colors.forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.fillRect(x + i * sw, y, sw + (i < p.colors.length - 1 ? 0.5 : 0), ph);
      });
    }
  }
  // 金线折痕：1px gold α.38 + 右侧 1px lac0 α.7
  for (const x of L.creases) {
    ctx.globalAlpha = a0 * 0.38;
    ctx.fillStyle = GOLD;
    ctx.fillRect(x - 1, 0, 1, h);
    ctx.globalAlpha = a0 * 0.7;
    ctx.fillStyle = LAC0;
    ctx.fillRect(x, 0, 1, h);
  }
  ctx.globalAlpha = a0;
  // 描金山影：y 140–420，gold α.30→0 填充 + 1px 描金轮廓 α.45
  if (canPath && h > MOUNT_TOP) {
    const trace = () => {
      ctx.beginPath!();
      L.mountain.forEach((p, i) => (i ? ctx.lineTo!(p.x, p.y) : ctx.moveTo!(p.x, p.y)));
      ctx.closePath?.();
    };
    const bottom = Math.min(MOUNT_BOTTOM, h);
    if (ctx.createLinearGradient) {
      const g = ctx.createLinearGradient(0, MOUNT_TOP, 0, bottom);
      g.addColorStop(0, 'rgba(233,200,119,0.30)');
      g.addColorStop(1, 'rgba(233,200,119,0)');
      ctx.fillStyle = g;
    } else {
      ctx.globalAlpha = a0 * 0.15;
      ctx.fillStyle = GOLD;
    }
    trace();
    ctx.fill!();
    ctx.globalAlpha = a0;
    if (ctx.stroke) {
      // 轮廓只描山脊，不描底边
      ctx.beginPath!();
      L.mountain.slice(0, -2).forEach((p, i) => (i ? ctx.lineTo!(p.x, p.y) : ctx.moveTo!(p.x, p.y)));
      ctx.globalAlpha = a0 * 0.45;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = a0;
    }
  }
  // 暗角
  if (ctx.createRadialGradient) {
    const g = ctx.createRadialGradient(w / 2, h * 0.38, Math.min(w, h) * 0.2, w / 2, h * 0.45, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(7,3,2,0)');
    g.addColorStop(1, 'rgba(7,3,2,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.globalAlpha = a0 * 0.35;
    ctx.fillStyle = LAC0;
    ctx.fillRect(0, 0, w, 24);
    ctx.fillRect(0, h - 24, w, 24);
    ctx.globalAlpha = a0;
  }
  // 纸纹
  for (const d of paperDots(w, h)) {
    ctx.globalAlpha = a0 * (d.light ? 0.05 : 0.08);
    ctx.fillStyle = d.light ? '#F3EBD8' : '#000000';
    ctx.fillRect(d.x, d.y, 1, 1);
  }
  // 双描边（6 / 9 内缩）
  for (const b of L.borders) {
    ctx.globalAlpha = a0 * b.alpha;
    ctx.fillStyle = GOLD_LO;
    const { x, y, w: bw, h: bh } = b.r;
    ctx.fillRect(x, y, bw, 1);
    ctx.fillRect(x, y + bh - 1, bw, 1);
    ctx.fillRect(x, y, 1, bh);
    ctx.fillRect(x + bw - 1, y, 1, bh);
  }
  ctx.globalAlpha = a0;
  ctx.restore?.();
}
