/**
 * 灵光一闪弹层（#105；docs/specs/subpages-v05.md §1，render-spec §8.6，mockups-v3/epiphany.html）。
 * - 模态、暂停战斗（响应倒计时随场景暂停冻结），不可点遮罩关闭、不可跳过。
 * - 词条 < 2：三选一必须选，「铭刻」在选中前 disabled，无取消。
 * - 词条 = 2（#full）：先选新词条，再选替换哪条（朱砂描边 +「替」角标 + 删除线）；「替换」两者都选后可点；「放弃」始终可点。
 * - H5 无刷新（不画广告刷新按钮）。
 * - 触发墨聚 900ms（墨旋 → 金光）；prefers-reduced-motion 时跳过，直接出内容。期间不接受点击。
 * - 只用 Brush 字体与 p4-kit 调色板。
 */
import type { CardInst, AffixDef } from '../../core/types';
import type { EpiphanyPick } from '../../core/battle';
import type { OverlayStack } from '../../engine/modal';
import type { Rect, Vec2 } from '../../engine/types';
import type { Surface } from '../../engine/surfaces';
import { AFFIXES } from '../../data/affixes';
import { BAR_H, BRUSH, CARD_H, CARD_W, RARITY_COLOR, SANS, T, drawButton, frame3, gx, label, paintCard, stroke, vgrad, type Button } from '../scenes/p4-kit';
import { inside } from './theme';

export const EPIPHANY_ID = 'epiphany';
/** 触发墨聚时长（render-spec §7 动效表：900ms） */
export const EPIPHANY_INTRO_MS = 900;
export const MAX_MODS = 2;

export interface EpiphanyInfo {
  card: CardInst;
  options: AffixDef[];
  /** 本场第几次（已计入本次） */
  count: number;
  /** 本场上限 */
  max: number;
}

export interface EpiphanyLayout {
  card: Rect;
  /** 已有词条（仅 #full，两列） */
  olds: Rect[];
  opts: Rect[];
  hintY: number;
  ok: Rect;
  giveUp: Rect | null;
}

/** render-spec §8.6 布局（390×844 设计坐标） */
export function epiphanyLayout(w: number, h: number, full: boolean, n: number): EpiphanyLayout {
  const card = { x: (w - CARD_W) / 2, y: 116, w: CARD_W, h: CARD_H };
  const x = 24;
  const ow = w - 48;
  const olds = full ? [0, 1].map((i) => ({ x: x + i * ((ow + 12) / 2), y: 282, w: (ow - 12) / 2, h: 48 })) : [];
  const step = full ? 68 + 10 : 76 + 12;
  const top = full ? 362 : 310;
  const opts = Array.from({ length: n }, (_, i) => ({ x, y: top + i * step, w: ow, h: full ? 68 : 76 }));
  const by = h - BAR_H + 15;
  const ok = { x: w - 126, y: by, w: 116, h: 44 };
  return { card, olds, opts, hintY: h - BAR_H - 16, ok, giveUp: full ? { x: w - 232, y: by, w: 96, h: 44 } : null };
}

export interface EpiphanyState {
  sel: number;
  /** 替换目标（#full） */
  target: string | null;
  t: number;
  /** 选中状态变了，下一帧重绘（弹层栈不因手势自动重绘） */
  dirty?: boolean;
}

const affixDef = (id: string) => AFFIXES.find((a) => a.id === id);

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface EpiphanyOpts {
  width: number;
  height: number;
  reducedMotion?: () => boolean;
  track?(ev: string, data: Record<string, unknown>): void;
  /** 是否保底触发（埋点） */
  pity?: boolean;
}

/** 当前状态下可提交的结果；undefined = 还不能提交 */
export function epiphanyCommit(info: EpiphanyInfo, st: EpiphanyState): EpiphanyPick | undefined {
  const a = info.options[st.sel];
  if (!a) return undefined;
  if (info.card.mods.length >= MAX_MODS) return st.target ? { ...a, replace: st.target } : undefined;
  return { ...a };
}

/** 打开弹层；resolve 选中词条（含 replace），null = 放弃（仅 #full） */
export function openEpiphany(ov: OverlayStack, info: EpiphanyInfo, o: EpiphanyOpts): Promise<EpiphanyPick | null> {
  const full = info.card.mods.length >= MAX_MODS;
  const reduced = o.reducedMotion ?? prefersReducedMotion;
  const st: EpiphanyState = { sel: -1, target: null, t: reduced() ? EPIPHANY_INTRO_MS : 0 };
  const L = () => epiphanyLayout(o.width, o.height, full, info.options.length);
  o.track?.('epiphany_show', { cardId: info.card.id, options: info.options.map((a) => a.id), pity: !!o.pity });
  const h = ov.push<EpiphanyPick | null>({
    id: EPIPHANY_ID,
    kind: 'popup',
    modal: true,
    dismissOnTapOutside: false,
    pausesScene: true,
    scrim: { color: 'rgba(5,2,1,.92)' }, // render-spec §8.7 全屏层近不透明
    animating: () => st.t < EPIPHANY_INTRO_MS || !!st.dirty,
    update: (dt) => {
      st.t = Math.min(EPIPHANY_INTRO_MS, st.t + dt);
    },
    draw: (s) => {
      drawEpiphany(s, o.width, o.height, info, st, L());
      st.dirty = false;
    },
    gesture: (e, hd) => {
      if (e.type !== 'tap' || st.t < EPIPHANY_INTRO_MS) return true; // 模态；墨聚期间不接受输入
      const lay = L();
      const at: Vec2 = e.at;
      const i = lay.opts.findIndex((r) => inside(r, at));
      if (i >= 0) st.sel = i;
      st.dirty = true;
      const k = lay.olds.findIndex((r) => inside(r, at));
      if (k >= 0) st.target = info.card.mods[k] ?? null;
      if (lay.giveUp && inside(lay.giveUp, at)) {
        o.track?.('epiphany_pick', { affixId: null, replace: null });
        hd.close(null);
      } else if (inside(lay.ok, at)) {
        const pick = epiphanyCommit(info, st);
        if (pick) {
          o.track?.('epiphany_pick', { affixId: pick.id, replace: pick.replace ?? null });
          hd.close(pick);
        }
      }
      return true;
    },
  });
  return h.result.then((r) => r ?? null);
}

/** 墨聚：墨旋向牌心收拢（0–70%），金光炸开（70–100%） */
function drawIntro(c: Surface['ctx'], cx: number, cy: number, t: number) {
  const p = t / EPIPHANY_INTRO_MS;
  const g = gx(c);
  const ga = c.globalAlpha;
  const swirl = Math.min(1, p / 0.7);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + swirl * Math.PI * 1.5;
    const r = 220 * (1 - swirl) + 30;
    c.globalAlpha = ga * 0.55 * (1 - Math.max(0, p - 0.7) / 0.3);
    c.fillStyle = T.lac0;
    g.beginPath?.();
    g.arc?.(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 46 * (1 - swirl * 0.5), 0, Math.PI * 2);
    g.fill?.();
  }
  if (p > 0.7 && g.createRadialGradient) {
    const q = (p - 0.7) / 0.3;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 60 + q * 200);
    rg.addColorStop(0, 'rgba(244,220,154,.85)');
    rg.addColorStop(1, 'rgba(233,200,119,0)');
    c.globalAlpha = ga * (1 - q * 0.6);
    (c as unknown as { fillStyle: unknown }).fillStyle = rg;
    c.fillRect(cx - 300, cy - 300, 600, 600);
  }
  c.globalAlpha = ga;
}

export function drawEpiphany(s: Surface, w: number, h: number, info: EpiphanyInfo, st: EpiphanyState, L: EpiphanyLayout) {
  const c = s.ctx;
  const full = info.card.mods.length >= MAX_MODS;
  const cx = L.card.x + L.card.w / 2;
  const cy = L.card.y + L.card.h / 2;
  if (st.t < EPIPHANY_INTRO_MS) {
    drawIntro(c, cx, cy, st.t);
    return;
  }
  label(c, '灵光一闪', w / 2, 56, BRUSH(30), T.goldHi, 'center');
  label(c, `${info.count}/${info.max}`, w - 24, 56, BRUSH(16), T.gold, 'right');
  const g = gx(c);
  g.save?.();
  g.translate?.(L.card.x, L.card.y);
  paintCard(c, info.card);
  g.restore?.();
  stroke(c, L.card, T.goldHi, 2);
  // 已有词条（#full）
  L.olds.forEach((r, k) => {
    const id = info.card.mods[k];
    const a = id ? affixDef(id) : undefined;
    const tgt = st.target === id;
    vgrad(c, r, 'rgba(42,20,16,.95)', 'rgba(15,7,5,.95)');
    frame3(c, r, tgt ? T.cinnabar : T.goldLo);
    if (tgt) stroke(c, r, T.cinnHi, 2);
    const name = a?.n ?? id ?? '';
    label(c, name, r.x + r.w / 2, r.y + 30, BRUSH(17), tgt ? T.paper3 : T.paper, 'center');
    if (tgt) {
      c.font = BRUSH(17);
      const tw = (g.measureText?.(name).width as number | undefined) ?? name.length * 17;
      c.fillStyle = T.cinnHi;
      c.fillRect(r.x + r.w / 2 - tw / 2, r.y + 24, tw, 2);
      c.fillStyle = T.cinnabar;
      c.fillRect(r.x + r.w - 22, r.y, 22, 22);
      label(c, '替', r.x + r.w - 11, r.y + 17, BRUSH(14), T.paper, 'center');
    }
  });
  // 候选词条
  info.options.forEach((a, i) => {
    const r = L.opts[i];
    const sel = st.sel === i;
    vgrad(c, r, 'rgba(42,20,16,.95)', 'rgba(15,7,5,.95)');
    frame3(c, r, sel ? T.goldHi : T.goldMid);
    if (sel) stroke(c, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, T.goldHi, 2);
    const col = RARITY_COLOR[a.r];
    label(c, a.r, r.x + 16, r.y + (full ? 28 : 32), BRUSH(14), col);
    label(c, a.n, r.x + 36, r.y + (full ? 28 : 32), BRUSH(20), T.gold);
    label(c, a.d, r.x + 16, r.y + (full ? 52 : 58), SANS(13), T.paper, 'left');
  });
  label(c, full ? '先选新词条，再选替换哪条；或放弃本次灵光' : '词条不足 2 条，必须铭刻一条', w / 2, L.hintY, SANS(13), T.paper3, 'center');
  // 底栏
  vgrad(c, { x: 0, y: h - BAR_H, w, h: BAR_H }, T.lac3, T.lac0);
  c.fillStyle = T.goldLo;
  c.fillRect(0, h - BAR_H, w, 1);
  const pick = epiphanyCommit(info, st);
  const ok: Button = { id: 'ok', rect: L.ok, text: full ? '替换' : '铭刻', kind: 'confirm', disabled: !pick, font: BRUSH(18) };
  if (L.giveUp) drawButton(c, { id: 'giveup', rect: L.giveUp, text: '放弃', kind: 'secondary', font: BRUSH(18) });
  drawButton(c, ok);
}
