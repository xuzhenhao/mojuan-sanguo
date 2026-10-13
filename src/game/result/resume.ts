/**
 * 启动续玩弹窗与「放弃本局」二次确认（flow.md §1、PRD 5.13 V0.5.4，UI #62/#73，mockup v3/resume.html、v3/abandon.html）。
 * 只用 OverlayStack.push（kind 'popup'，模态，不允许点外部关闭），不改弹层栈和手势接口。
 * 设置浮层（P2/P3 暂停）的「放弃本局」可直接复用 confirmAbandon。
 */
import type { GestureEvent } from '../../engine/input';
import type { OverlayStack } from '../../engine/modal';
import type { Ctx2DLike, Rect } from '../../engine/types';
import { inside, wrap } from '../overlays/theme';
import { B, body, brush, button, center, panel } from './paint';
import type { ResumeSummary } from './store';

/** 文案必须一字不差（flow.md §1 / acceptance.md） */
export const ABANDON_TEXT = '放弃后本局按失败结算，将魂减半，存档将被删除。确定放弃？';
export const RESUME_TITLE = '继续本局？';

export interface DialogFrame {
  width: number;
  height: number;
}

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function box(f: DialogFrame, h: number): { k: number; r: Rect } {
  // 引擎已统一等比缩放（render-spec §4.0），场景坐标即 dp
  const k = 1;
  const w = 350 * k;
  return { k, r: { x: (f.width - w) / 2, y: (f.height - h * k) / 2, w, h: h * k } };
}

/** 两个按钮的位置（左「次」右「主」） */
export function dialogButtons(f: DialogFrame, h: number) {
  const { k, r } = box(f, h);
  const bw = 150 * k;
  const by = r.y + r.h - 70 * k;
  return { left: { x: r.x + 20 * k, y: by, w: bw, h: 48 * k }, right: { x: r.x + r.w - 20 * k - bw, y: by, w: bw, h: 48 * k } };
}

function mask(c: Ctx2DLike, f: DialogFrame) {
  c.fillStyle = B.mask;
  c.fillRect(0, 0, f.width, f.height);
}

export const RESUME_H = 420;
export const ABANDON_H = 300;

/** 启动时有存档：弹「继续本局 / 放弃本局」 */
export function showResume(ov: OverlayStack, f: DialogFrame, s: ResumeSummary, names: (id: string) => string = (x) => x) {
  const btn = () => dialogButtons(f, RESUME_H);
  return ov.push<'continue' | 'abandon'>({
    id: 'resume',
    kind: 'popup',
    modal: true,
    draw: (sf) => {
      const c = sf.ctx;
      const { k, r } = box(f, RESUME_H);
      mask(c, f);
      panel(c, r, 0.97);
      center(c, RESUME_TITLE, r.x + r.w / 2, r.y + 56 * k, brush(30 * k), B.gold, 30 * k);
      // 主将（金框）/ 副将（银框）
      const main = { x: r.x + 90 * k, y: r.y + 80 * k, w: 100 * k, h: 140 * k };
      const sub = { x: r.x + 205 * k, y: r.y + 120 * k, w: 72 * k, h: 100 * k };
      for (const [card, id, col] of [
        [main, s.heroMain, B.gold],
        [sub, s.heroSub, '#CFD6D9'],
      ] as const) {
        c.fillStyle = B.paper;
        c.fillRect(card.x, card.y, card.w, card.h);
        c.fillStyle = col;
        c.fillRect(card.x, card.y, card.w, 3 * k);
        c.fillRect(card.x, card.y + card.h - 3 * k, card.w, 3 * k);
        c.fillRect(card.x, card.y, 3 * k, card.h);
        c.fillRect(card.x + card.w - 3 * k, card.y, 3 * k, card.h);
        const px = card === main ? 22 : 17;
        let yy = card.y + (px + 8) * k;
        for (const ch of names(id).slice(0, 3)) {
          center(c, ch, card.x + (px / 2 + 10) * k, yy, brush(px * k), B.ink, px * k);
          yy += px * k * 1.05;
        }
      }
      const layer = s.layer >= 9 ? 'Boss' : s.layer > 0 ? `第 ${s.layer} 层` : '出发前';
      center(c, `第${CN[s.chapter] ?? s.chapter}章 · ${layer}`, r.x + r.w / 2, r.y + 256 * k, brush(20 * k), B.goldMid, 20 * k);
      center(
        c,
        `体力 ${s.hp}/${s.maxHp} · 铜钱 ${s.gold} · 牌组 ${s.deckSize} · 天命 ${s.tianming}`,
        r.x + r.w / 2,
        r.y + 290 * k,
        body(13 * k),
        B.paper,
        13 * k,
      );
      const b = btn();
      button(c, b.left, '放弃本局', 'secondary');
      button(c, b.right, '继续本局', 'confirm');
    },
    gesture: (e: GestureEvent, h) => {
      if (e.type !== 'tap') return true;
      const b = btn();
      if (inside(b.left, e.at)) h.close('abandon');
      else if (inside(b.right, e.at)) h.close('continue');
      return true;
    },
  });
}

/** 放弃本局二次确认：确定放弃 → true，返回 → false */
export function confirmAbandon(ov: OverlayStack, f: DialogFrame) {
  const btn = () => dialogButtons(f, ABANDON_H);
  return ov.push<boolean>({
    id: 'abandon',
    kind: 'popup',
    modal: true,
    draw: (sf) => {
      const c = sf.ctx;
      const { k, r } = box(f, ABANDON_H);
      mask(c, f);
      panel(c, r, 0.98);
      // 「弃」字印章
      const seal = { x: r.x + r.w / 2 - 28 * k, y: r.y + 18 * k, w: 56 * k, h: 56 * k };
      c.fillStyle = B.cinnabar;
      c.fillRect(seal.x, seal.y, seal.w, seal.h);
      center(c, '弃', seal.x + seal.w / 2, seal.y + 40 * k, brush(34 * k), B.paper, 34 * k);
      center(c, '放弃本局', r.x + r.w / 2, r.y + 112 * k, brush(26 * k), B.gold, 26 * k);
      c.font = body(15 * k);
      c.fillStyle = B.paper;
      wrap(c, ABANDON_TEXT, r.w - 40 * k, 15 * k).forEach((l, i) => c.fillText?.(l, r.x + 20 * k, r.y + (148 + i * 24) * k));
      const b = btn();
      button(c, b.left, '返回', 'secondary');
      button(c, b.right, '确定放弃', 'primary');
    },
    gesture: (e: GestureEvent, h) => {
      if (e.type !== 'tap') return true;
      const b = btn();
      if (inside(b.left, e.at)) h.close(false);
      else if (inside(b.right, e.at)) h.close(true);
      return true;
    },
  });
}

/**
 * 启动流程：有存档 → 续玩弹窗；放弃 → 二次确认（返回则回到续玩弹窗）；确定放弃 → 'abandon'。
 * 存档在这里**不删除**：离开结算页时才删（flow.md §1：结算页展示前进程被杀，下次仍弹续玩）。
 */
export async function resumeFlow(ov: OverlayStack, f: DialogFrame, s: ResumeSummary, names?: (id: string) => string): Promise<'continue' | 'abandon'> {
  for (;;) {
    const r = await showResume(ov, f, s, names).result;
    if (r !== 'abandon') return 'continue';
    if (await confirmAbandon(ov, f).result) return 'abandon';
  }
}
