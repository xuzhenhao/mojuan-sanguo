/**
 * 虎符军令表现（#231；docs/ui/render-spec.md §3.5 / ui-specs/231-ling-cycle-ui.md）。
 * 数值字段以 #230 `LingSlotSnapshot` / `Game.lingSlot()` 为准。
 *
 * 「满」小字：仅 snapshot.full（current >= hardCap）；maxGainPerTurn 截断静默，不出「满」。
 */
import type { Ctx2DLike, Rect } from '../../../engine/types';
import type { CardInst } from '../../../core/types';
import type { LingSlotSnapshot } from '../../../core/juling';
import { def } from '../../../core/rules';
import { C, FONT, circle, frame, rect, text } from './paint';
import { prefersReducedMotion } from '../../motion';

/** UI 视图 = 引擎快照 + 保留预告（槽底 ink 短横；引擎未单独字段，由 current/carryMax 推导） */
export type LingView = LingSlotSnapshot & {
  /** 将带入下回合的令数预告（≤carryMax） */
  carryPreview: number;
};

/** 从 Game.lingSlot() 建视图；carryPreview 默认可带出的量 */
export function lingViewFromSlot(slot: LingSlotSnapshot, carryPreview?: number): LingView {
  return {
    ...slot,
    carryPreview: Math.min(carryPreview ?? Math.min(slot.current, slot.carryMax), slot.carryMax),
  };
}

/** @deprecated 仅测试/截图无 Game 时用；正式路径走 lingViewFromSlot(g.lingSlot()) */
export function lingViewFromPlayer(p: { ling: number; maxLing: number }, o: Partial<LingSlotSnapshot> & { carryPreview?: number } = {}): LingView {
  const hardCap = o.hardCap ?? 6;
  const carryMax = o.carryMax ?? 2;
  const current = o.current ?? p.ling;
  const cap = o.cap ?? p.maxLing;
  const slot: LingSlotSnapshot = {
    current,
    cap,
    hardCap,
    overflow: o.overflow ?? current > cap,
    carryMax,
    delta: o.delta ?? 0,
    full: o.full ?? current >= hardCap,
  };
  return lingViewFromSlot(slot, o.carryPreview);
}

/** 牌面费用：原值 vs 减后值（减费表现） */
export function costDisplay(c: CardInst, displayCost: number): { base: number; display: number; reduced: boolean } {
  const base = c.asSha ? 1 : def(c).cost;
  return { base, display: displayCost, reduced: displayCost < base };
}

export type TallySlotKind = 'empty' | 'full' | 'overflow' | 'carry';

/** 自上而下第 i 格（0=顶）；点亮自下而上 = 底部先 lit */
export function slotKind(v: LingView, i: number, slotCount: number): TallySlotKind {
  const litCount = Math.min(slotCount, v.current);
  const litFromTop = slotCount - litCount;
  if (i < litFromTop) return 'empty';
  if (v.overflow) return 'overflow';
  const fromBottom = slotCount - 1 - i;
  if (v.carryPreview > 0 && fromBottom < v.carryPreview) return 'carry';
  return 'full';
}

export function slotCountOf(v: LingView) {
  return Math.min(5, Math.max(v.cap, Math.min(v.current, 5), 1));
}

export const FULL_BADGE_MS = 800;
export const LING_FLOAT_MS = 400;
export const TALLY_SHAKE_MS = 300;

export interface LingFx {
  fullMs: number;
  float?: { text: string; t0: number; x: number; y: number };
  shakeMs: number;
  flashMs: number;
}

export function createLingFx(): LingFx {
  return { fullMs: 0, shakeMs: 0, flashMs: 0 };
}

/** 根据 ling 差分推进表现；`full` 仅来自快照（hardCap），maxGain 截断不会 true */
export function onLingDelta(fx: LingFx, v: LingView, delta: number, tally: Rect, now: number, reduced: boolean) {
  if (delta > 0) {
    const cx = tally.x + tally.w / 2;
    const cy = tally.y + tally.h / 2;
    fx.float = { text: `+${delta}`, t0: now, x: cx, y: cy };
    if (v.full) {
      fx.fullMs = FULL_BADGE_MS;
      if (!reduced) fx.shakeMs = TALLY_SHAKE_MS;
    }
  }
}

export function tickLingFx(fx: LingFx, dt: number) {
  if (fx.fullMs > 0) fx.fullMs = Math.max(0, fx.fullMs - dt);
  if (fx.shakeMs > 0) fx.shakeMs = Math.max(0, fx.shakeMs - dt);
  if (fx.flashMs > 0) fx.flashMs = Math.max(0, fx.flashMs - dt);
}

export function drawTallyEnergy(ctx: Ctx2DLike, tally: Rect, v: LingView, fx: LingFx, now: number, reduced = prefersReducedMotion()) {
  const n = slotCountOf(v);
  const k = n > 3 ? 32 : 46;
  const shake = fx.shakeMs > 0 && !reduced ? Math.sin(((TALLY_SHAKE_MS - fx.shakeMs) / TALLY_SHAKE_MS) * Math.PI * 4) * 2 : 0;
  const flash = fx.flashMs > 0 && Math.floor(fx.flashMs / 60) % 2 === 0;
  const ox = tally.x + shake;

  for (let i = 0; i < n; i++) {
    const y = tally.y + i * k;
    const kind = slotKind(v, i, n);
    const lit = kind !== 'empty';
    const r = { x: ox, y, w: 30, h: k - 4 };
    rect(ctx, r, lit ? C.goldMid : '#3A3027');
    const stroke = flash ? C.cinnabar : kind === 'overflow' ? C.goldHi : lit ? C.goldHi : C.goldDk;
    frame(ctx, r, stroke, 1);
    if (kind === 'overflow') frame(ctx, { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, C.goldHi, 1);
    text(ctx, '令', ox + 15, y + (k - 4) / 2, {
      size: 16,
      color: lit ? C.lac1 : '#5a4a3a',
      font: FONT.brush,
      align: 'center',
    });
    if (kind === 'carry' || (kind === 'overflow' && v.carryPreview > 0 && n - 1 - i < v.carryPreview)) {
      rect(ctx, { x: ox + 6, y: y + k - 8, w: 18, h: 1 }, C.ink);
    }
  }

  const cur = String(v.current);
  const cap = String(v.cap);
  const mid = ox + 15;
  if (v.overflow) {
    text(ctx, cur, mid - 8, tally.y - 14, { size: 15, color: C.goldHi, font: FONT.num, align: 'right', bold: true });
    text(ctx, `/${cap}`, mid - 6, tally.y - 14, { size: 15, color: C.paper, font: FONT.num, align: 'left', bold: true });
  } else {
    text(ctx, `${cur}/${cap}`, mid, tally.y - 14, { size: 15, color: C.paper, font: FONT.num, align: 'center', bold: true });
  }

  if (fx.fullMs > 0 && v.full) {
    const alpha = fx.fullMs < 200 ? fx.fullMs / 200 : 1;
    ctx.globalAlpha = alpha;
    text(ctx, '满', ox + 15 + 28, tally.y - 14, { size: 12, color: C.ink, font: FONT.body, align: 'left' });
    ctx.globalAlpha = 1;
  }

  if (fx.float) {
    const elapsed = now - fx.float.t0;
    if (elapsed >= 0 && elapsed < LING_FLOAT_MS) {
      const p = elapsed / LING_FLOAT_MS;
      const up = reduced ? 0 : 24 * p;
      const scale = reduced ? 1 : 1 + 0.1 * (1 - p);
      ctx.globalAlpha = 1 - p * p;
      text(ctx, fx.float.text, fx.float.x, fx.float.y - up, {
        size: 18 * scale,
        color: C.goldHi,
        font: FONT.body,
        align: 'center',
        bold: true,
      });
      ctx.globalAlpha = 1;
    } else if (elapsed >= LING_FLOAT_MS) {
      fx.float = undefined;
    }
  }
}

/** 费用角标：减费时显示减后值 + 原值删除线；0 费用金色 */
export function drawCostBadge(ctx: Ctx2DLike, x: number, y: number, info: { base: number; display: number; reduced: boolean }, unaffordable: boolean) {
  const zero = info.display === 0;
  const fill = unaffordable ? C.cinnabar : zero ? C.gold : C.jade;
  const cx = x + 11;
  const cy = y + 11;
  circle(ctx, cx, cy, 10, fill);
  text(ctx, String(info.display), cx, cy + 1, {
    size: 14,
    color: zero ? C.lac1 : C.paper,
    font: FONT.num,
    align: 'center',
    bold: true,
  });
  if (info.reduced) {
    const ox = cx - 14;
    const oy = cy - 14;
    text(ctx, String(info.base), ox, oy, { size: 9, color: 'rgba(243,235,216,.55)', font: FONT.num, align: 'center' });
    rect(ctx, { x: ox - 4, y: oy - 1, w: 8, h: 1 }, C.ink);
  }
}
