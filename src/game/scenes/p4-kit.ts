/**
 * P4（奖励 / 集市 / 宝箱）共用绘制件：B 金漆屏风背景、顶签、大牌、宝物/丹药圆章、按钮、胶囊、底栏、确认与 toast 弹层。
 * render-spec §1 色板、§3.8 按钮、§3.9 面板；运行时不用 shadowBlur/filter（§10），发光用半透明叠色近似。
 * 大牌和圆章经 BakeCache 烘焙成位图（§12.2），每帧 1 次 drawImage。
 */
import { markHit } from '../../engine/hit';
import { def, RANK_CH } from '../../core/rules';
import { drawSuit } from '../overlays/icons';
import type { Rarity } from '../../core/types';
import { CONFIG } from '../../data/config';
import type { GestureEvent } from '../../engine/input';
import type { BakeCache, BakeClass } from '../../engine/memory';
import type { OverlayHandle, OverlayStack } from '../../engine/modal';
import type { Surface } from '../../engine/surfaces';
import type { Canvas2DLike, Ctx2DLike, Rect, Vec2 } from '../../engine/types';
import { ext, inside, wrap } from '../overlays/theme';
import { brushFont, sansFont } from '../fonts';

export const T = {
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
  dmg: '#FF8A73',
  jade: '#4F9A7C',
  jadeDk: '#1D4A3A',
  jadeHi: '#9AD4B8',
  azureHi: '#86AAB8',
} as const;
export const RARITY_COLOR: Record<Rarity | 'Boss', string> = { N: '#C49A6A', R: '#DFE5E8', E: '#E9C877', L: '#9AD4B8', Boss: '#D4604C' };
/** 书法 / 正文字体（#228：族名统一由 game/fonts 从 rules.fonts 读取） */
export const BRUSH = (px: number) => brushFont(px);
export const SANS = (px: number, bold = false) => sansFont(px, bold);

type G = ReturnType<typeof ext> &
  Partial<{
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop(o: number, c: string): void };
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): { addColorStop(o: number, c: string): void };
    translate(x: number, y: number): void;
    rotate(a: number): void;
    scale(x: number, y: number): void;
  }>;
export const gx = (c: Ctx2DLike) => c as G;

/** 竖向渐变填充（无渐变 API 时用首色） */
export function vgrad(c: Ctx2DLike, r: Rect, a: string, b: string) {
  const g = gx(c);
  if (g.createLinearGradient) {
    const lg = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    lg.addColorStop(0, a);
    lg.addColorStop(1, b);
    c.fillStyle = lg as unknown as string;
  } else c.fillStyle = a;
  c.fillRect(r.x, r.y, r.w, r.h);
}

export function stroke(c: Ctx2DLike, r: Rect, color: string, w = 1.5) {
  const g = gx(c);
  if (g.strokeRect) {
    g.strokeStyle = color;
    g.lineWidth = w;
    g.strokeRect(r.x + w / 2, r.y + w / 2, r.w - w, r.h - w);
  } else {
    c.fillStyle = color;
    c.fillRect(r.x, r.y, r.w, w);
    c.fillRect(r.x, r.y + r.h - w, r.w, w);
    c.fillRect(r.x, r.y, w, r.h);
    c.fillRect(r.x + r.w - w, r.y, w, r.h);
  }
}
/** 3 层描边：1.5 gold、间隔 lac-3、外 gold-lo（§3.8） */
export function frame3(c: Ctx2DLike, r: Rect, inner: string = T.gold) {
  stroke(c, r, T.goldLo, 1);
  stroke(c, { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 }, inner, 1.5);
}

export function circle(c: Ctx2DLike, x: number, y: number, r: number, fill?: string, line?: string, lw = 1.5) {
  const g = gx(c);
  if (!g.arc || !g.beginPath) {
    if (fill) {
      c.fillStyle = fill;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return;
  }
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    c.fillStyle = fill;
    g.fill?.();
  }
  if (line) {
    g.strokeStyle = line;
    g.lineWidth = lw;
    g.stroke?.();
  }
}

export function diamond(c: Ctx2DLike, x: number, y: number, r: number, fill: string, line = T.lac1) {
  const g = gx(c);
  if (!g.beginPath || !g.moveTo || !g.lineTo) {
    c.fillStyle = fill;
    c.fillRect(x - r / 2, y - r / 2, r, r);
    return;
  }
  g.beginPath();
  g.moveTo(x, y - r);
  g.lineTo(x + r, y);
  g.lineTo(x, y + r);
  g.lineTo(x - r, y);
  g.closePath?.();
  c.fillStyle = fill;
  g.fill?.();
  g.strokeStyle = line;
  g.lineWidth = 1;
  g.stroke?.();
}

export function label(c: Ctx2DLike, s: string, x: number, y: number, font: string, color: string, align: 'left' | 'center' | 'right' = 'left') {
  const g = gx(c);
  c.font = font;
  c.fillStyle = color;
  if (g.textAlign !== undefined || 'textAlign' in g) g.textAlign = align;
  c.fillText?.(s, x, y);
  if ('textAlign' in g) g.textAlign = 'left';
}

/** B 金漆屏风背景：中心光 + 外框（全页共享，画在 bg 层，只画一次） */
export function drawBackdrop(c: Ctx2DLike, w: number, h: number) {
  const g = gx(c);
  c.fillStyle = T.lac2;
  c.fillRect(0, 0, w, h);
  if (g.createRadialGradient) {
    const rg = g.createRadialGradient(w / 2, h * 0.28, 10, w / 2, h * 0.28, h * 0.7);
    rg.addColorStop(0, T.lac4);
    rg.addColorStop(0.55, T.lac2);
    rg.addColorStop(1, T.lac0);
    c.fillStyle = rg as unknown as string;
    c.fillRect(0, 0, w, h);
  }
  stroke(c, { x: 5, y: 5, w: w - 10, h: h - 10 }, 'rgba(138,106,42,.55)', 1);
}

/** 左上页签（第一章·黄巾 / 集市 / 宝箱） */
export function drawTag(c: Ctx2DLike, s: string) {
  const w = 22 + s.length * 14;
  c.fillStyle = 'rgba(21,10,8,.85)';
  c.fillRect(12, 13, w, 26);
  stroke(c, { x: 12, y: 13, w, h: 26 }, T.goldLo, 1);
  label(c, s, 12 + w / 2, 31, BRUSH(15), T.gold, 'center');
}

/** 底栏：深漆条 + 牌组图标 + 张数（右侧按钮由页面画） */
export const BAR_H = 74;
export function drawBottomBar(c: Ctx2DLike, w: number, h: number, deckCount: number) {
  vgrad(c, { x: 0, y: h - BAR_H, w, h: BAR_H }, T.lac3, T.lac0);
  c.fillStyle = T.goldLo;
  c.fillRect(0, h - BAR_H, w, 1);
  circle(c, 27, h - BAR_H + 30, 14, T.lac1, T.goldLo);
  c.fillStyle = T.gold;
  c.fillRect(22, h - BAR_H + 22, 10, 15);
  label(c, String(deckCount), 48, h - BAR_H + 35, SANS(14, true), T.paper);
}

export type BtnKind = 'primary' | 'confirm' | 'secondary';
const BTN: Record<BtnKind, [string, string]> = { primary: ['#C4513E', '#7D2418'], confirm: ['#5FAE8C', '#1D4A3A'], secondary: ['#5A4A3A', '#2A1F16'] };
export interface Button {
  id: string;
  rect: Rect;
  text: string;
  kind: BtnKind;
  disabled?: boolean;
  font?: string;
}
export function drawButton(c: Ctx2DLike, b: Button) {
  markHit(b.rect);
  const ga = c.globalAlpha;
  if (b.disabled) c.globalAlpha = ga * 0.45;
  c.fillStyle = T.lac1;
  c.fillRect(b.rect.x, b.rect.y, b.rect.w, b.rect.h);
  const [a, z] = b.disabled ? ['#4a4440', '#2a2522'] : BTN[b.kind];
  vgrad(c, { x: b.rect.x + 4, y: b.rect.y + 4, w: b.rect.w - 8, h: b.rect.h - 8 }, a, z);
  frame3(c, b.rect, b.disabled ? T.goldLo : T.gold);
  label(c, b.text, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2 + 6, b.font ?? BRUSH(18), b.kind === 'secondary' ? T.paper : T.paper, 'center');
  c.globalAlpha = ga;
}
export const hitButton = (bs: Button[], p: Vec2) => bs.find((b) => !b.disabled && inside(b.rect, p)) ?? null;
export const hitAnyButton = (bs: Button[], p: Vec2) => bs.find((b) => inside(b.rect, p)) ?? null;

/** 铜钱图标 */
export function coin(c: Ctx2DLike, x: number, y: number, r = 9) {
  circle(c, x, y, r, T.gold, T.goldDk, 1);
  c.fillStyle = T.lac2;
  c.fillRect(x - r * 0.32, y - r * 0.32, r * 0.64, r * 0.64);
}
/** 葫芦（丹药）图标 */
export function gourd(c: Ctx2DLike, x: number, y: number, s = 1, color: string = T.jadeHi) {
  circle(c, x, y + 4 * s, 6 * s, color);
  circle(c, x, y - 4 * s, 4 * s, color);
  c.fillStyle = color;
  c.fillRect(x - 1.2 * s, y - 11 * s, 2.4 * s, 4 * s);
}

/** 胶囊（战利品 +22 / +1 3/3） */
export function pill(c: Ctx2DLike, r: Rect, icon: (cx: number, cy: number) => void, txt: string, extra?: string, extraColor: string = T.cinnHi) {
  c.fillStyle = 'rgba(21,10,8,.9)';
  c.fillRect(r.x, r.y, r.w, r.h);
  frame3(c, r, T.goldMid);
  icon(r.x + 26, r.y + r.h / 2);
  label(c, txt, r.x + 46, r.y + r.h / 2 + 6, SANS(17), T.paper);
  if (extra) label(c, extra, r.x + r.w - 12, r.y + r.h / 2 + 5, SANS(12), extraColor, 'right');
}

// ---------- 大牌 ----------
export const CARD_W = 104;
export const CARD_H = 150;
/** 牌面底色：杀/攻击类朱砂、防御类青、锦囊褐、装备灰 */
function artColor(id: string) {
  const d = CONFIG.cards[id];
  const tags = d.tags ?? [];
  if (tags.includes('sha') || tags.includes('fire')) return ['#C24A3A', '#7A1E14'];
  if (tags.includes('shan') || d.type === '装备') return ['#5B8496', '#2D4C5A'];
  if (tags.includes('tao') || tags.includes('jiu')) return ['#6FA884', '#2F5E45'];
  return ['#6A5A40', '#3A2E1E'];
}

export interface CardFace {
  id: string;
  suit: 'S' | 'H' | 'C' | 'D';
  rank: number;
}
/** 画一张大牌（104×150 逻辑像素，左上角 0,0）——烘焙用 */
export function paintCard(c: Ctx2DLike, f: CardFace) {
  const cfg = CONFIG.cards[f.id];
  const d = def({ uid: 0, id: f.id, suit: f.suit, rank: f.rank, mods: [] });
  const rar = (cfg.rarity as Rarity) ?? 'N';
  const W = CARD_W;
  const H = CARD_H;
  vgrad(c, { x: 0, y: 0, w: W, h: H }, T.paper2, T.paper3);
  stroke(c, { x: 0, y: 0, w: W, h: H }, RARITY_COLOR[rar], rar === 'L' ? 3 : 2);
  stroke(c, { x: 4, y: 4, w: W - 8, h: H - 8 }, T.goldDk, 1);
  const [a, z] = artColor(f.id);
  vgrad(c, { x: 8, y: 8, w: W - 16, h: 92 }, a, z);
  // 插画占位：大号书法首字（正式美术进 cards_art 图集后替换）
  label(c, d.name.slice(0, 1), W / 2, 72, BRUSH(44), 'rgba(243,235,216,.85)', 'center');
  label(c, d.name.length > 3 ? d.name.slice(0, 4) : d.name, W / 2, H - 18, BRUSH(d.name.length > 3 ? 18 : 24), T.ink, 'center');
  const red = f.suit === 'H' || f.suit === 'D';
  drawSuit(c, f.suit, 14, 35, 12, red ? T.cinnabar : T.ink);
  label(c, RANK_CH[f.rank] ?? String(f.rank), 8, 54, SANS(12, true), red ? T.cinnabar : T.ink);
  diamond(c, W - 10, 10, 7, RARITY_COLOR[rar]);
}
/** 费用珠（画在牌外左上，压边） */
export function costBead(c: Ctx2DLike, x: number, y: number, cost: number) {
  circle(c, x, y, 14, T.jade, T.paper, 1.5);
  label(c, String(cost), x, y + 6, SANS(16, true), T.paper, 'center');
}

/** 宝物圆章（直径 d，中心 x,y）——烘焙用 */
export function paintMedal(c: Ctx2DLike, x: number, y: number, d: number, glyph: string, rarity: Rarity | 'Boss', glyphColor: string = T.gold) {
  circle(c, x, y, d / 2, T.lac1, T.goldMid, 2);
  circle(c, x, y, d / 2 - 5, undefined, 'rgba(138,106,42,.6)', 1);
  label(c, glyph, x, y + d * 0.16, BRUSH(Math.round(d * 0.42)), glyphColor, 'center');
  diamond(c, x + d * 0.34, y - d * 0.34, 7, RARITY_COLOR[rarity]);
}

// ---------- 烘焙 ----------
export interface BakeEnv {
  bakes?: BakeCache;
  offscreen?(w: number, h: number): Canvas2DLike;
  scale?: number;
}
/**
 * 取烘焙位图并绘制；没有烘焙环境（单测/降级）时直接画。
 * paint 以 (0,0) 为左上、逻辑像素坐标作画；size 为烘焙尺寸（默认等于 r），r 可缩放（翻牌）。
 */
export function blit(
  s: Surface,
  env: BakeEnv,
  scene: string,
  key: string,
  cls: BakeClass,
  r: Rect,
  paint: (c: Ctx2DLike) => void,
  size: { w: number; h: number } = r,
) {
  const { bakes, offscreen } = env;
  if (!bakes || !offscreen) {
    // 无烘焙环境（单测）：直接画；有 translate 时平移到目标位置
    const g = gx(s.ctx);
    g.save?.();
    g.translate?.(r.x, r.y);
    g.scale?.(r.w / size.w, r.h / size.h);
    paint(s.ctx);
    g.restore?.();
    return;
  }
  const k = env.scale ?? 2;
  const pw = Math.ceil(size.w * k);
  const ph = Math.ceil(size.h * k);
  const img = bakes.get(`${scene}:${key}`, cls, scene, pw, ph, () => {
    const cv = offscreen(pw, ph);
    const c = cv.getContext('2d') as Ctx2DLike;
    c.setTransform(k, 0, 0, k, 0, 0);
    paint(c);
    return cv;
  });
  s.ctx.drawImage(img, r.x, r.y, r.w, r.h);
}

// ---------- 弹层 ----------
export interface Env extends BakeEnv {
  overlays: OverlayStack;
  safe(): Rect;
  measure(): Surface['ctx'];
}

/** toast（非模态，1.6s 自动消失）。now 由调用方传入以便测试 */
export function toast(stack: OverlayStack, msg: string, w: number, y = 120, ms = 1600): OverlayHandle {
  stack.closeAll('toast');
  let t = 0;
  const tw = Math.max(120, msg.length * 15 + 40);
  const rect = { x: (w - tw) / 2, y, w: tw, h: 38 };
  const h: OverlayHandle = stack.push({
    id: `toast:${msg}`,
    kind: 'toast',
    modal: false,
    rect,
    draw: (s, dt) => {
      t += dt;
      const a = t > ms - 300 ? Math.max(0, (ms - t) / 300) : 1;
      const ga = s.ctx.globalAlpha;
      s.ctx.globalAlpha = a;
      s.ctx.fillStyle = 'rgba(21,10,8,.94)';
      s.ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      stroke(s.ctx, rect, T.goldMid, 1);
      label(s.ctx, msg, rect.x + rect.w / 2, rect.y + 25, SANS(14), T.paper, 'center');
      s.ctx.globalAlpha = ga;
      if (t >= ms) queueMicrotask(() => h.close());
    },
    animating: () => t < ms,
  });
  return h;
}

export interface ConfirmSpec {
  title: string;
  lines: string[];
  ok: string;
  cancel?: string;
  okKind?: BtnKind;
  okDisabled?: boolean;
  /** 自定义内容区（大图等），返回占用高度 */
  body?: (c: Ctx2DLike, r: Rect) => void;
  bodyH?: number;
}
/** 确认浮层（模态，遮罩）：结果 true = 确定，false/undefined = 取消 */
export function confirm(stack: OverlayStack, w: number, h: number, spec: ConfirmSpec): OverlayHandle<boolean> {
  const bodyH = spec.bodyH ?? 0;
  const pw = 300;
  const ph = 70 + bodyH + spec.lines.length * 20 + 84;
  const r = { x: (w - pw) / 2, y: Math.max(60, (h - ph) / 2 - 20), w: pw, h: ph };
  const by = r.y + r.h - 64;
  const ok: Button = {
    id: 'ok',
    rect: { x: r.x + pw - 24 - 112, y: by, w: 112, h: 44 },
    text: spec.ok,
    kind: spec.okKind ?? 'confirm',
    disabled: spec.okDisabled,
  };
  const cancel: Button = { id: 'cancel', rect: { x: r.x + 24, y: by, w: 112, h: 44 }, text: spec.cancel ?? '取消', kind: 'secondary' };
  return stack.push<boolean>({
    id: `confirm:${spec.title}`,
    kind: 'popup',
    rect: r,
    scrim: { color: 'rgba(5,2,1,.72)' },
    draw: (s) => {
      const c = s.ctx;
      vgrad(c, r, 'rgba(42,20,16,.98)', 'rgba(15,7,5,.98)');
      frame3(c, r);
      label(c, spec.title, r.x + pw / 2, r.y + 40, BRUSH(24), T.gold, 'center');
      if (spec.body) spec.body(c, { x: r.x + 20, y: r.y + 56, w: pw - 40, h: bodyH });
      let y = r.y + 64 + bodyH + 14;
      for (const l of spec.lines) {
        for (const ln of wrap(c, l, pw - 48, 14)) {
          label(c, ln, r.x + 24, y, SANS(14), T.paper);
          y += 20;
        }
      }
      drawButton(c, cancel);
      drawButton(c, ok);
    },
    gesture: (e: GestureEvent, hd) => {
      if (e.type !== 'tap') return true;
      if (inside(ok.rect, e.at) && !ok.disabled) hd.close(true);
      else if (inside(cancel.rect, e.at) || !inside(r, e.at)) hd.close(false);
      return true;
    },
  });
}

/** 宝箱：箱体 + 箱盖（open 0→1 掀开） */
export function drawChest(c: Surface['ctx'], cx: number, cy: number, open: number) {
  const g = gx(c);
  const body = { x: cx - 62, y: cy, w: 124, h: 72 };
  // 光
  if (open > 0.3) {
    c.fillStyle = `rgba(244,220,154,${0.35 * open})`;
    c.fillRect(body.x + 6, cy - 10, body.w - 12, 14);
  }
  vgrad(c, body, '#B0392B', '#6A1A12');
  stroke(c, body, T.gold, 3);
  c.fillStyle = T.gold;
  c.fillRect(cx - 6, cy, 12, body.h);
  c.fillStyle = T.lac0;
  c.fillRect(cx - 13, cy + 12, 26, 20);
  stroke(c, { x: cx - 13, y: cy + 12, w: 26, h: 20 }, T.gold, 1.5);
  // 箱盖：铰链在后上沿，open=1 时向后翻起约 −20°
  const lid = { x: -62, y: -30, w: 124, h: 30 };
  if (g.save && g.translate && g.rotate) {
    g.save();
    g.translate(cx, cy);
    g.translate(0, -open * 50);
    g.rotate(-open * 0.35);
    vgrad(c, lid, '#B0392B', '#7A2016');
    stroke(c, lid, T.gold, 3);
    g.restore?.();
  } else {
    vgrad(c, { x: cx + lid.x, y: cy + lid.y - open * 50, w: lid.w, h: lid.h }, '#B0392B', '#7A2016');
  }
}
