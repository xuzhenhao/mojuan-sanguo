/**
 * 灵光一闪弹层（#105）。规则：docs/specs/subpages-v05.md §1；视觉数值：docs/art/specs/spec-105-epiphany.md（UI，PR #171）。
 * - 模态、暂停战斗，不可点遮罩关闭。词条 < 2：三选一必选（「铭刻」选中前 disabled）；词条 = 2（#full）：选新词条 + 替换目标后「替换」，「放弃」始终可点。H5 无刷新。
 * - 层级（规格 §2）：z10 径向遮罩（引擎全屏）+ 卡后光晕 → z11 大牌 / 已有词条 / 候选面板 → z12 标题、次数、文案、按钮、选中 / 替换叠加 → z13 墨聚、金光、飞入、化墨。
 * - 动效（§4，不受倍速影响）：0–600 墨聚（遮罩 0–200 淡入）；600–900 金光 0.6→1.2 淡出、大牌 0.8→1；700 起标题 / 候选入场（候选每条 220ms、错开 60ms，#full 已有行先 60ms）；
 *   900ms 起可点，入场未完成时点击直接跳到终态；选中描边 120ms 淡入；铭刻 300ms 飞入（替换目标同时化墨 250ms）→ 200ms 退场。
 * - prefers-reduced-motion：无墨聚 / 金光，遮罩 + UI 150ms 一起淡入；飞入改 150ms 交叉淡化。
 * - 运行时不用 shadowBlur（render-spec §10）：外发光用半透明描边叠层近似。只用 Brush 字体与 p4-kit 调色板。
 */
import type { CardInst, AffixDef, Rarity } from '../../core/types';
import type { EpiphanyPick } from '../../core/battle';
import type { OverlayStack } from '../../engine/modal';
import type { Rect, Vec2 } from '../../engine/types';
import type { Surface } from '../../engine/surfaces';
import type { Ctx2DLike } from '../../engine/types';
import { AFFIXES } from '../../data/affixes';
import { BRUSH, CARD_H, CARD_W, RARITY_COLOR, T, drawButton, gx, label, paintCard, stroke, vgrad, type Button } from '../scenes/p4-kit';
import { STAMP_ICONS, type IconId } from './icons';
import { inside } from './theme';

export const EPIPHANY_ID = 'epiphany';
/** 触发阻塞时长（§10.1）：900ms 起接受点击 */
export const EPIPHANY_INTRO_MS = 900;
export const INK_MS = 600;
export const UI_IN_AT = 700;
export const PANEL_MS = 220;
export const STAGGER_MS = 60;
export const REDUCED_IN_MS = 150;
export const SEL_MS = 120;
export const FLY_MS = 300;
export const FLY_REDUCED_MS = 150;
export const EXIT_MS = 200;
export const MAX_MODS = 2;

/** 书法文案（规格 §3：须进字表；tests/epiphany-105 核对都在 wenkai 子集里） */
export const EPIPHANY_TEXT = {
  title: '灵光一闪',
  engrave: '铭刻',
  replace: '替换',
  giveUp: '放弃',
  badge: '替',
  fullNote: '已有 2 条词条 · 选择要替换的一条',
  hintDefault: '词条不足 2 条，必须铭刻一条',
  hintFull: '先选新词条，再选替换哪条；或放弃本次灵光',
} as const;

/** 遮罩（规格 §3）：圆心 (195,253) = 视口 50% / 30%，`rgba(60,40,10,.55)` → 半径（对角线 60%）的 45% 处 `rgba(0,0,0,.90)`，外侧保持 .90（UI 复核 v3） */
export const EPIPHANY_SCRIM = {
  color: 'rgba(0,0,0,.90)',
  radial: {
    cx: 0.5,
    cy: 0.3,
    r: 0.6,
    stops: [
      [0, 'rgba(60,40,10,.55)'],
      [0.45, 'rgba(0,0,0,.90)'],
      [1, 'rgba(0,0,0,.90)'],
    ] as [number, string][],
  },
};

export interface EpiphanyInfo {
  card: CardInst;
  options: AffixDef[];
  /** 本场第几次（已计入本次） */
  count: number;
  max: number;
}

export interface EpiphanyLayout {
  card: Rect;
  olds: Rect[];
  opts: Rect[];
  noteY: number;
  hintY: number;
  barY: number;
  ok: Rect;
  giveUp: Rect | null;
}

/** 规格 §1（390×844 设计坐标；引擎按屏宽等比缩放） */
export function epiphanyLayout(w: number, h: number, full: boolean, n: number, safeBottom = 0): EpiphanyLayout {
  const card = { x: (w - CARD_W) / 2, y: 116, w: CARD_W, h: CARD_H };
  const olds = full ? [20, 201].map((x) => ({ x, y: 282, w: 169, h: 48 })) : [];
  const ph = full ? 68 : 76;
  const top = full ? 362 : 310;
  const opts = Array.from({ length: n }, (_, i) => ({ x: 20, y: top + i * (ph + 12), w: 350, h: ph }));
  const by = h - Math.max(14, safeBottom) - 44;
  const barY = by - 16;
  return {
    card,
    olds,
    opts,
    noteY: 275,
    hintY: barY - 30,
    barY,
    ok: { x: 274, y: by, w: 96, h: 44 },
    giveUp: full ? { x: 20, y: by, w: 96, h: 44 } : null,
  };
}

/** UI 入场终态时刻（之后无入场动画） */
export function epiphanyUiEnd(full: boolean, n: number): number {
  const first = UI_IN_AT + (full ? STAGGER_MS : 0);
  return Math.max(UI_IN_AT + 200, first + Math.max(0, n - 1) * STAGGER_MS + PANEL_MS);
}

export interface EpiphanyState {
  sel: number;
  target: string | null;
  /** 入场时钟（ms） */
  t: number;
  dirty?: boolean;
  /** 选中 / 换目标时刻（clock） */
  selAt?: number;
  clock?: number;
  /** 退场：提交后计时 */
  out?: { t: number; pick: EpiphanyPick | null };
}

const affixDef = (id: string) => AFFIXES.find((a) => a.id === id);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const easeBack = (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface EpiphanyOpts {
  width: number;
  height: number;
  reducedMotion?: () => boolean;
  track?(ev: string, data: Record<string, unknown>): void;
  pity?: boolean;
  safeBottom?: number;
}

export function epiphanyCommit(info: EpiphanyInfo, st: EpiphanyState): EpiphanyPick | undefined {
  const a = info.options[st.sel];
  if (!a) return undefined;
  if (info.card.mods.length >= MAX_MODS) return st.target ? { ...a, replace: st.target } : undefined;
  return { ...a };
}

/** 退场总时长：铭刻 / 替换 = 飞入 + 退场；放弃 = 退场 */
export const outMs = (pick: EpiphanyPick | null, reduced: boolean) => (pick ? (reduced ? FLY_REDUCED_MS : FLY_MS) : 0) + EXIT_MS;

/** 打开弹层；resolve 选中词条（含 replace），null = 放弃（仅 #full）。结果在退场动画结束后给出 */
export function openEpiphany(ov: OverlayStack, info: EpiphanyInfo, o: EpiphanyOpts): Promise<EpiphanyPick | null> {
  const full = info.card.mods.length >= MAX_MODS;
  const reduced = o.reducedMotion ?? prefersReducedMotion;
  const rm = reduced();
  const end = rm ? REDUCED_IN_MS : epiphanyUiEnd(full, info.options.length);
  const st: EpiphanyState = { sel: -1, target: null, t: 0, clock: 0 };
  const L = () => epiphanyLayout(o.width, o.height, full, info.options.length, o.safeBottom);
  o.track?.('epiphany_show', { cardId: info.card.id, options: info.options.map((a) => a.id), pity: !!o.pity });
  const h = ov.push<EpiphanyPick | null>({
    id: EPIPHANY_ID,
    kind: 'popup',
    modal: true,
    dismissOnTapOutside: false,
    pausesScene: true,
    scrim: () => ({ ...EPIPHANY_SCRIM, alpha: scrimAlpha(st, rm) }),
    animating: () => st.t < end || !!st.out || !!st.dirty || (st.selAt !== undefined && (st.clock ?? 0) - st.selAt < SEL_MS),
    update: (dt) => {
      st.clock = (st.clock ?? 0) + dt;
      st.t = Math.min(end, st.t + dt);
      if (st.out) {
        st.out.t += dt;
        if (st.out.t >= outMs(st.out.pick, rm)) {
          const r = st.out.pick;
          st.out = undefined;
          h.close(r);
        }
      }
    },
    draw: (s) => {
      drawEpiphany(s, o.width, o.height, info, st, L(), rm);
      st.dirty = false;
    },
    gesture: (e) => {
      if (e.type !== 'tap' || st.out) return true;
      if (!rm && st.t < EPIPHANY_INTRO_MS) return true; // §10.1 触发 900ms 阻塞
      if (st.t < end) st.t = end; // 点击跳过：直接到入场终态
      const lay = L();
      const at: Vec2 = e.at;
      st.dirty = true;
      const i = lay.opts.findIndex((r) => inside(r, at));
      if (i >= 0 && i !== st.sel) {
        st.sel = i;
        st.selAt = st.clock;
      }
      const k = lay.olds.findIndex((r) => inside(r, at));
      if (k >= 0 && info.card.mods[k] !== st.target) {
        st.target = info.card.mods[k] ?? null;
        st.selAt = st.clock;
      }
      if (lay.giveUp && inside(lay.giveUp, at)) {
        o.track?.('epiphany_pick', { affixId: null, replace: null });
        st.out = { t: 0, pick: null };
      } else if (inside(lay.ok, at)) {
        const pick = epiphanyCommit(info, st);
        if (pick) {
          o.track?.('epiphany_pick', { affixId: pick.id, replace: pick.replace ?? null });
          st.out = { t: 0, pick };
        }
      }
      return true;
    },
  });
  return h.result.then((r) => r ?? null);
}

/** 遮罩 α：入场 0–200ms（减少动态 150ms）淡入；退场最后 200ms 淡出 */
export function scrimAlpha(st: EpiphanyState, reduced: boolean): number {
  const a = clamp01(st.t / (reduced ? REDUCED_IN_MS : 200));
  return a * exitAlpha(st, reduced);
}
function exitAlpha(st: EpiphanyState, reduced: boolean): number {
  if (!st.out) return 1;
  const fly = st.out.pick ? (reduced ? FLY_REDUCED_MS : FLY_MS) : 0;
  return 1 - easeOut(clamp01((st.out.t - fly) / EXIT_MS));
}

const CAT_ICON: Record<AffixDef['cat'], IconId> = { sha: 'sha', shan: 'defend', tao: 'ui_hp', jiu: 'sharp', trick: 'flash_mark', equip: 'armor' };

/** 稀有度菱形（§3，形状同时编码）：N 空心 2px、R 实心、E 实心 + 中心 4px 暗点、L 实心 + 外圈 1.2px 描边 */
export function drawRarity(c: Ctx2DLike, r: Rarity, cx: number, cy: number, size: number) {
  const g = gx(c) as ReturnType<typeof gx> & Partial<CanvasRenderingContext2D>;
  const col = RARITY_COLOR[r];
  const dia = (k: number) => {
    g.beginPath?.();
    g.moveTo?.(cx, cy - k);
    g.lineTo?.(cx + k, cy);
    g.lineTo?.(cx, cy + k);
    g.lineTo?.(cx - k, cy);
    g.closePath?.();
  };
  const k = size / 2;
  if (r === 'N') {
    dia(k - 1);
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.stroke?.();
    return;
  }
  dia(k);
  c.fillStyle = col;
  g.fill?.();
  if (r === 'E') {
    dia(2);
    c.fillStyle = T.lac0;
    g.fill?.();
  }
  if (r === 'L') {
    dia(k + 2.5);
    g.strokeStyle = col;
    g.lineWidth = 1.2;
    g.stroke?.();
  }
}

/** 外发光近似（不用 shadowBlur）：向外 3 层递减透明描边 */
function glow(c: Ctx2DLike, r: Rect, color: string, a: number) {
  const ga = c.globalAlpha;
  for (let i = 1; i <= 3; i++) {
    c.globalAlpha = ga * a * (0.5 / i);
    stroke(c, { x: r.x - i * 2.5, y: r.y - i * 2.5, w: r.w + i * 5, h: r.h + i * 5 }, color, 2.5);
  }
  c.globalAlpha = ga;
}

function measure(c: Ctx2DLike, s: string, font: string, px: number): number {
  c.font = font;
  return (gx(c).measureText?.(s).width as number | undefined) ?? s.length * px;
}

/** 词条行：菱形 + 名称（左）+ 图标 + 效果（右对齐到右内边距 20） */
function affixRow(c: Ctx2DLike, r: Rect, a: AffixDef, dia: number, namePx: number, effPx: number, nameAlpha = 1, reserveRight = 20) {
  const cy = r.y + r.h / 2;
  drawRarity(c, a.r, r.x + 14 + dia / 2, cy, dia);
  const nx = r.x + 22 + dia;
  const ga = c.globalAlpha;
  c.globalAlpha = ga * nameAlpha;
  label(c, a.n, nx, cy + namePx * 0.36, BRUSH(namePx), T.paper);
  c.globalAlpha = ga;
  const nw = measure(c, a.n, BRUSH(namePx), namePx);
  const right = r.x + r.w - reserveRight;
  const icon = effPx >= 16 ? 16 : 13;
  let px = effPx;
  const room = right - (nx + nw + 10) - icon - 4;
  while (px > 11 && measure(c, a.d, BRUSH(px), px) > room) px--;
  const ew = measure(c, a.d, BRUSH(px), px);
  if (ew > room) return { nx, nw }; // 已有行 169 宽放不下效果：只显示名称（长按看详情）
  label(c, a.d, right, cy + px * 0.36, BRUSH(px), T.paper, 'right');
  STAMP_ICONS.draw(c, CAT_ICON[a.cat], { x: right - ew - 4 - icon, y: cy - icon / 2, w: icon, h: icon }, T.paper3);
  return { nx, nw };
}

/** 词条块底色不透明度（UI 复核：≥ .95，不透出后面的牌） */
export const EPIPHANY_PANEL_ALPHA = [0.96, 0.98] as const;

/** 「替」角标：块内右上角，右 / 上各内缩 4px，22×22（UI 复核 v3） */
export const BADGE_SIZE = 22;
export const BADGE_INSET = 4;
/** 已有词条效果文字右侧为角标让出的宽度 */
export const BADGE_RESERVE = 26;
export function epiphanyBadgeRect(r: Rect): Rect {
  return { x: r.x + r.w - BADGE_INSET - BADGE_SIZE, y: r.y + BADGE_INSET, w: BADGE_SIZE, h: BADGE_SIZE };
}

function panel(c: Ctx2DLike, r: Rect) {
  vgrad(c, r, `rgba(42,20,16,${EPIPHANY_PANEL_ALPHA[0]})`, `rgba(15,7,5,${EPIPHANY_PANEL_ALPHA[1]})`);
  stroke(c, r, T.goldLo, 1.5);
}

/** 墨聚（0–600ms）：墨团向牌心旋转汇聚 */
function drawInk(c: Ctx2DLike, cx: number, cy: number, t: number) {
  const p = easeInOut(clamp01(t / INK_MS));
  const g = gx(c);
  const ga = c.globalAlpha;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + p * Math.PI * 1.5;
    const r = 220 * (1 - p) + 24;
    c.globalAlpha = ga * 0.6 * (t < INK_MS ? 1 : 0);
    c.fillStyle = T.lac0;
    g.beginPath?.();
    g.arc?.(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 46 * (1 - p * 0.5), 0, Math.PI * 2);
    g.fill?.();
  }
  c.globalAlpha = ga;
}

/** 金光（600–900ms）：缩放 0.6→1.2 后淡出 */
function drawFlash(c: Ctx2DLike, cx: number, cy: number, t: number) {
  const q = clamp01((t - INK_MS) / (EPIPHANY_INTRO_MS - INK_MS));
  if (q <= 0 || q >= 1) return;
  const g = gx(c);
  if (!g.createRadialGradient) return;
  const R = 130 * (0.6 + 0.6 * easeBack(q));
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  rg.addColorStop(0, 'rgba(244,220,154,.85)');
  rg.addColorStop(1, 'rgba(233,200,119,0)');
  const ga = c.globalAlpha;
  c.globalAlpha = ga * (q < 0.5 ? 1 : 1 - (q - 0.5) / 0.5);
  (c as unknown as { fillStyle: unknown }).fillStyle = rg;
  c.fillRect(cx - R, cy - R, R * 2, R * 2);
  c.globalAlpha = ga;
}

export function drawEpiphany(s: Surface, w: number, _h: number, info: EpiphanyInfo, st: EpiphanyState, L: EpiphanyLayout, reduced = false) {
  const c = s.ctx;
  const g = gx(c);
  const full = info.card.mods.length >= MAX_MODS;
  const cx = L.card.x + L.card.w / 2;
  const cy = L.card.y + L.card.h / 2;
  const t = st.t;
  const ga0 = c.globalAlpha;
  const ex = exitAlpha(st, reduced);
  c.globalAlpha = ga0 * ex;
  const inA = (start: number, dur: number) => (reduced ? clamp01(t / REDUCED_IN_MS) : easeOut(clamp01((t - start) / dur)));
  const fly = st.out?.pick ? clamp01(st.out.t / (reduced ? FLY_REDUCED_MS : FLY_MS)) : 0;
  const pending = st.out?.pick;
  const ga = c.globalAlpha;

  // z10 卡后光晕
  const cardA = reduced ? inA(0, 0) : clamp01((t - INK_MS) / 120);
  if (cardA > 0 && g.createRadialGradient) {
    const rg = g.createRadialGradient(195, 191, 0, 195, 191, 150);
    rg.addColorStop(0, 'rgba(233,200,119,.25)');
    rg.addColorStop(1, 'rgba(233,200,119,0)');
    c.globalAlpha = ga * cardA;
    (c as unknown as { fillStyle: unknown }).fillStyle = rg;
    c.fillRect(45, 41, 300, 300);
  }
  // z11 大牌（600–900 缩放 0.8→1）
  if (cardA > 0) {
    const sc = reduced ? 1 : 0.8 + 0.2 * easeBack(clamp01((t - INK_MS) / (EPIPHANY_INTRO_MS - INK_MS)));
    c.globalAlpha = ga * cardA;
    glow(c, L.card, T.gold, 0.9);
    g.save?.();
    g.translate?.(cx, cy);
    g.scale?.(sc, sc);
    g.translate?.(-L.card.w / 2, -L.card.h / 2);
    paintCard(c, info.card);
    g.restore?.();
    stroke(c, L.card, T.goldHi, 1.5);
  }
  // z11 已有词条（#full，先于候选 60ms）
  const rowA = (i: number) => inA(UI_IN_AT + i * STAGGER_MS, PANEL_MS);
  const rise = (a: number) => (reduced ? 0 : (1 - a) * 16);
  L.olds.forEach((r0, k) => {
    const a = rowA(0);
    if (a <= 0) return;
    const id = info.card.mods[k];
    const def = id ? affixDef(id) : undefined;
    const r = { ...r0, y: r0.y + rise(a) };
    const ink = pending?.replace === id ? 1 - easeOut(clamp01(st.out!.t / 250)) : 1; // 被替换词条化墨 250ms
    c.globalAlpha = ga * a * ink;
    panel(c, r);
    if (def) {
      const { nx, nw } = affixRow(c, r, def, 11, 22, 15, 1, 20 + BADGE_RESERVE);
      if (st.target === id) {
        c.fillStyle = T.cinnHi;
        c.fillRect(nx - 2, r.y + r.h / 2 - 1, nw + 4, 2); // 删除线 2px
      }
    }
  });
  // z11 候选面板（自下 16px 上移 + 淡入，每条 220ms、错开 60ms）
  const off = full ? 1 : 0;
  info.options.forEach((a, i) => {
    const r0 = L.opts[i];
    const al = rowA(i + off);
    if (al <= 0) return;
    const r = { ...r0, y: r0.y + rise(al) };
    c.globalAlpha = ga * al;
    const flying = pending && st.sel === i;
    affixRowPanel(c, r, a, full, flying ? 1 - fly : 1);
  });
  // z12 标题 / 次数 / 文案 / 按钮 / 选中叠加
  const uiA = inA(UI_IN_AT, 200);
  if (uiA > 0) {
    c.globalAlpha = ga * uiA;
    label(c, EPIPHANY_TEXT.title, w / 2, 56 + 12 + 2, BRUSH(34), 'rgba(0,0,0,.7)', 'center'); // 阴影 0 2 6 #000 近似（不用 shadowBlur）
    label(c, EPIPHANY_TEXT.title, w / 2, 56 + 12, BRUSH(34), T.gold, 'center');
    label(c, `${info.count} / ${info.max}`, 366, 56 + 6, BRUSH(16), T.gold, 'right');
    if (full) label(c, EPIPHANY_TEXT.fullNote, w / 2, L.noteY + 4, BRUSH(12), T.paper3, 'center');
    label(c, full ? EPIPHANY_TEXT.hintFull : EPIPHANY_TEXT.hintDefault, w / 2, L.hintY + 5, BRUSH(13), T.paper3, 'center');
    const pick = epiphanyCommit(info, st);
    if (L.giveUp) drawButton(c, { id: 'giveup', rect: L.giveUp, text: EPIPHANY_TEXT.giveUp, kind: 'secondary', font: BRUSH(22) });
    const ok: Button = { id: 'ok', rect: L.ok, text: full ? EPIPHANY_TEXT.replace : EPIPHANY_TEXT.engrave, kind: 'confirm', disabled: !pick, font: BRUSH(22) };
    drawButton(c, ok);
  }
  const selA = st.selAt === undefined ? 1 : easeOut(clamp01(((st.clock ?? 0) - st.selAt) / SEL_MS));
  if (st.sel >= 0 && L.opts[st.sel] && !pending) {
    const r = L.opts[st.sel];
    c.globalAlpha = ga * selA;
    glow(c, r, T.gold, 1);
    stroke(c, r, T.goldHi, 2);
  }
  const ti = st.target ? info.card.mods.indexOf(st.target) : -1;
  if (ti >= 0 && L.olds[ti]) {
    const r = L.olds[ti];
    c.globalAlpha = ga * (pending ? 1 - easeOut(clamp01(st.out!.t / 250)) : selA);
    stroke(c, r, T.cinnHi, 2);
    const b = epiphanyBadgeRect(r);
    c.fillStyle = T.cinnabar;
    c.fillRect(b.x, b.y, b.w, b.h);
    label(c, EPIPHANY_TEXT.badge, b.x + 11, b.y + 16, BRUSH(14), T.paper, 'center');
  }
  // z13 墨聚 / 金光 / 飞入
  c.globalAlpha = ga;
  if (!reduced && t < EPIPHANY_INTRO_MS) {
    if (t < INK_MS) drawInk(c, cx, cy, t);
    drawFlash(c, cx, cy, t);
  }
  if (pending && st.sel >= 0) {
    const r = L.opts[st.sel];
    const a = info.options[st.sel];
    const p = easeInOut(fly);
    const fx = reduced ? cx : r.x + 44 + (cx - r.x - 44) * p;
    const fy = reduced ? L.card.y + L.card.h - 16 : r.y + r.h / 2 + (L.card.y + L.card.h - 16 - r.y - r.h / 2) * p;
    const px = Math.round((full ? 24 : 26) + (12 - (full ? 24 : 26)) * (reduced ? 1 : p));
    c.globalAlpha = ga * (reduced ? fly : 1);
    label(c, a.n, fx, fy + px * 0.36, BRUSH(px), T.goldHi, reduced ? 'center' : p > 0.5 ? 'center' : 'left');
  }
  c.globalAlpha = ga0;
}

function affixRowPanel(c: Ctx2DLike, r: Rect, a: AffixDef, full: boolean, nameAlpha: number) {
  panel(c, r);
  affixRow(c, r, a, 14, full ? 24 : 26, full ? 16 : 17, nameAlpha);
}
