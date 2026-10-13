/**
 * 首领登场演出（#107，docs/art/specs/spec-107-boss.md §B）：
 * - first：首次 2000ms（遮罩 → 墨带横扫 → 名字擦出 → 台词上移淡入 → 停留 → 淡出）；
 * - repeat：同一首领第 2 次起 800ms（遮罩 100 → 墨带 150 → 名与台词 150 → 停留 250 → 淡出 150）；
 * - phase：阶段 2 切换约 1000ms（遮罩 .5 闪入 100 → 阶段台词淡入 200 → 停留 500 → 淡出 200），不重开墨带。
 * 时长走表现队列，自动按倍速缩放；任意点击跳过 → 150ms 淡出。
 * 减少动态：不扫不擦，200ms 淡入、停留、200ms 淡出，总时长不变。
 * 只用 Brush 字体与色板色；发光用半透明描边叠层，不用 shadowBlur（render-spec §10）。
 */
import type { Ctx2DLike } from '../../../engine/types';
import { C, FONT } from './paint';

export type IntroKind = 'first' | 'repeat' | 'phase';
export const INTRO_MS: Record<IntroKind, number> = { first: 2000, repeat: 800, phase: 1000 };
export const SKIP_FADE_MS = 150;
/** 台词超过此宽度（设计 px）就在破折号后折行（高级UI设计 口径） */
export const LINE_MAX_W = 330;
export const LINE_SIZE = 20;
export const LINE_HEIGHT = 26;
export const NAME_SIZE = 56;
export const NAME_MIN = 40;
const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export interface IntroData {
  kind: IntroKind;
  name: string;
  chapter: number;
  line?: string;
}

export interface IntroFrame {
  scrim: number;
  /** 墨带不透明度与横扫进度（0..1） */
  band: number;
  bandWipe: number;
  name: number;
  nameWipe: number;
  line: number;
  /** 台词上移量（px，8 → 0） */
  lineDy: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const out = (p: number) => 1 - (1 - p) * (1 - p);
const inOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const ZERO: IntroFrame = { scrim: 0, band: 0, bandWipe: 0, name: 0, nameWipe: 0, line: 0, lineDy: 0 };

function scale(f: IntroFrame, k: number): IntroFrame {
  return { ...f, scrim: f.scrim * k, band: f.band * k, name: f.name * k, line: f.line * k };
}

/** t 时刻（ms，已按倍速换算）的绘制参数；skipAt = 点击跳过的时刻（之后 150ms 淡出） */
export function introFrame(kind: IntroKind, t: number, reduced: boolean, skipAt?: number): IntroFrame {
  if (skipAt != null && t >= skipAt) return scale(introFrame(kind, skipAt, reduced), 1 - seg(t, skipAt, skipAt + SKIP_FADE_MS));
  const dur = INTRO_MS[kind];
  if (t < 0 || t >= dur) return ZERO;
  const phase = kind === 'phase';
  const maxScrim = phase ? 0.5 : 0.72;
  if (reduced) {
    const k = Math.min(seg(t, 0, 200), 1 - seg(t, dur - 200, dur));
    return { scrim: maxScrim * k, band: phase ? 0 : k, bandWipe: 1, name: phase ? 0 : k, nameWipe: 1, line: k, lineDy: 0 };
  }
  if (kind === 'first') {
    const f = 1 - inOut(seg(t, 1700, 2000));
    return {
      scrim: 0.72 * out(seg(t, 0, 200)) * f,
      band: (t >= 150 ? 1 : 0) * f,
      bandWipe: inOut(seg(t, 150, 450)),
      name: (t >= 400 ? 1 : 0) * f,
      nameWipe: out(seg(t, 400, 1000)),
      line: out(seg(t, 900, 1200)) * f,
      lineDy: 8 * (1 - out(seg(t, 900, 1200))),
    };
  }
  if (kind === 'repeat') {
    const f = 1 - seg(t, 650, 800);
    const nl = seg(t, 250, 400);
    return { scrim: 0.72 * seg(t, 0, 100) * f, band: seg(t, 100, 250) * f, bandWipe: 1, name: nl * f, nameWipe: 1, line: nl * f, lineDy: 0 };
  }
  const f = 1 - seg(t, 800, 1000);
  return { scrim: 0.5 * seg(t, 0, 100) * f, band: 0, bandWipe: 1, name: 0, nameWipe: 1, line: seg(t, 100, 300) * f, lineDy: 0 };
}

/** 台词折行：宽度 > maxW 时在「——」后断成两行；没有破折号则按宽度对半断。字号不缩 */
export function wrapIntroLine(s: string, measure: (t: string) => number, maxW = LINE_MAX_W): string[] {
  if (measure(s) <= maxW) return [s];
  const i = s.indexOf('——');
  if (i > 0 && i + 2 < s.length) return [s.slice(0, i + 2), s.slice(i + 2)];
  const chars = [...s];
  const mid = Math.ceil(chars.length / 2);
  return [chars.slice(0, mid).join(''), chars.slice(mid).join('')];
}

/** Boss 名字号：≤ 6 字 56；更长按比例缩，最小 40（card-name 口径） */
export function nameSize(name: string): number {
  const n = [...name].length;
  return n <= 6 ? NAME_SIZE : Math.max(NAME_MIN, Math.floor((NAME_SIZE * 6) / n));
}

export const chapterLabel = (ch: number) => `第${CN[ch] ?? ch}章 · 首领`;

type X = Ctx2DLike & {
  textAlign?: string;
  textBaseline?: string;
  save?(): void;
  restore?(): void;
  beginPath?(): void;
  rect?(x: number, y: number, w: number, h: number): void;
  clip?(): void;
  strokeText?(t: string, x: number, y: number): void;
  lineWidth?: number;
  lineJoin?: string;
  strokeStyle?: unknown;
  measureText?(t: string): { width: number };
  createLinearGradient?(x0: number, y0: number, x1: number, y1: number): { addColorStop(o: number, c: string): void };
};

/** 设计坐标（390×844）中的演出布局 */
export const INTRO_LAYOUT = { bandY: 320, bandH: 140, chapterY: 342, nameY: 392, lineY: 438, skipY: 800, phaseY: 392 } as const;

function txt(c: X, s: string, x: number, y: number, size: number, color: string) {
  c.font = `${size}px ${FONT.brush}`;
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText?.(s, x, y);
}

/** 画一帧演出（W×H 为设计尺寸；遮罩外扩铺满真实视口） */
export function drawBossIntro(ctx: Ctx2DLike, d: IntroData, f: IntroFrame, W: number, H: number, showSkip: boolean) {
  const c = ctx as X;
  const a0 = c.globalAlpha;
  const L = INTRO_LAYOUT;
  const cx = W / 2;
  if (f.scrim > 0) {
    c.globalAlpha = a0 * f.scrim;
    c.fillStyle = 'rgba(5,2,1,1)';
    c.fillRect(-W, -H, W * 3, H * 3);
  }
  // 墨带：T.lac1 α .96，两端 18% 渐隐；横扫 = 从左向右露出
  if (f.band > 0 && f.bandWipe > 0) {
    const ww = W * f.bandWipe;
    c.globalAlpha = a0 * f.band * 0.96;
    if (c.createLinearGradient) {
      const g = c.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(21,10,8,0)');
      g.addColorStop(0.18, C.lac1);
      g.addColorStop(0.82, C.lac1);
      g.addColorStop(1, 'rgba(21,10,8,0)');
      c.fillStyle = g;
    } else c.fillStyle = C.lac1;
    c.fillRect(0, L.bandY, ww, L.bandH);
    c.globalAlpha = a0 * f.band;
    c.fillStyle = C.goldLo;
    const lx = Math.min(350, ww);
    if (lx > 40) {
      c.fillRect(40, L.bandY, lx - 40, 1);
      c.fillRect(40, L.bandY + L.bandH - 1, lx - 40, 1);
    }
    c.globalAlpha = a0 * f.band;
    txt(c, chapterLabel(d.chapter), cx, L.chapterY, 14, C.paper3);
  }
  // 名字：goldHi + 朱砂外发光（描边叠层近似 blur 24）；逐笔回退为左→右擦出
  if (f.name > 0 && f.nameWipe > 0) {
    const size = nameSize(d.name);
    c.save?.();
    if (f.nameWipe < 1 && c.beginPath && c.rect && c.clip) {
      const nw = (c.measureText ? ((c.font = `${size}px ${FONT.brush}`), c.measureText(d.name).width) : size * [...d.name].length) + 24;
      c.beginPath();
      c.rect(cx - nw / 2, L.nameY - size, nw * f.nameWipe, size * 2);
      c.clip();
    }
    if (c.strokeText) {
      c.font = `${size}px ${FONT.brush}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.strokeStyle = C.cinnHi;
      for (const [w, a] of [
        [18, 0.14],
        [10, 0.24],
        [5, 0.4],
      ] as const) {
        c.globalAlpha = a0 * f.name * a;
        c.lineWidth = w;
        c.strokeText(d.name, cx, L.nameY);
      }
    }
    c.globalAlpha = a0 * f.name;
    txt(c, d.name, cx, L.nameY, size, C.goldHi);
    c.restore?.();
  }
  // 台词（登场：paper 20 于 y=438；阶段：cinnHi 20 于名牌位置），超宽在「——」后折两行，行距 26
  if (f.line > 0 && d.line) {
    const phase = d.kind === 'phase';
    c.font = `${LINE_SIZE}px ${FONT.brush}`;
    const m = (s: string) => (c.measureText ? c.measureText(s).width : [...s].length * LINE_SIZE);
    const lines = wrapIntroLine(d.line, m);
    const y0 = (phase ? L.phaseY : L.lineY) + f.lineDy - ((lines.length - 1) * LINE_HEIGHT) / 2;
    c.globalAlpha = a0 * f.line;
    lines.forEach((s, i) => txt(c, s, cx, y0 + i * LINE_HEIGHT, LINE_SIZE, phase ? C.cinnHi : C.paper));
  }
  if (showSkip && f.scrim > 0) {
    c.globalAlpha = a0 * Math.min(1, f.scrim / 0.72);
    txt(c, '点击跳过', cx, L.skipY, 13, 'rgba(191,174,136,.6)');
  }
  c.globalAlpha = a0;
}
