/**
 * 启动续玩弹窗与「放弃本局」二次确认（flow.md §1、PRD 5.13 V0.5.4，UI #62/#73，mockup v3/resume.html、v3/abandon.html）。
 * 只用 OverlayStack.push（kind 'popup'，模态，不允许点外部关闭），不改弹层栈和手势接口。
 * 设置浮层（P2/P3 暂停）的「放弃本局」可直接复用 confirmAbandon。
 */
import type { GestureEvent } from '../../engine/input';
import type { OverlayStack } from '../../engine/modal';
import type { Rect } from '../../engine/types';
import { inside, wrap } from '../overlays/theme';
import { B, body, brush, button, center, panel } from './paint';
import { frame } from '../overlays/theme';
import { markHit } from '../../engine/hit';
import type { ResumeSummary } from './store';
import { brushFont } from '../fonts';

/** 文案必须一字不差（#108 UI 复审：去掉「将魂减半」，结算口径同战败） */
export const ABANDON_TEXT = '放弃后本局按战败结算，存档将被删除。确定放弃？';
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

export const RESUME_H = 420;
export const ABANDON_H = 300;

/** 启动时有存档：弹「继续本局 / 放弃本局」 */
export function showResume(ov: OverlayStack, f: DialogFrame, s: ResumeSummary, names: (id: string) => string = (x) => x) {
  const btn = () => dialogButtons(f, RESUME_H);
  return ov.push<'continue' | 'abandon'>({
    id: 'resume',
    kind: 'popup',
    modal: true,
    scrim: { color: B.maskDeep },
    draw: (sf) => {
      const c = sf.ctx;
      const { k, r } = box(f, RESUME_H);
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
    scrim: { color: B.maskDeep },
    draw: (sf) => {
      const c = sf.ctx;
      const { k, r } = box(f, ABANDON_H);
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
      dangerButton(c, b.right, '确定放弃');
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

// ───────── PRD §21.4 配置版本不一致（#122 PR3，flow.md:75，mockup v3/version.html） ─────────
/** 文案必须一字不差（flow.md:75 / PRD §21.4） */
export const VERSION_TEXT = '为保证规则一致，本场战斗将从头开始；进入本场战斗前的进度（体力、牌组、铜钱、地图路线）均已保留。';
export const VERSION_H = 300;
/** 霞鹜文楷，不回退系统字体 */
const wk = (px: number) => brushFont(px);

/** 只有一个「继续」按钮（居中） */
export function versionButton(f: DialogFrame): Rect {
  const { r } = box(f, VERSION_H);
  return { x: r.x + (r.w - 180) / 2, y: r.y + r.h - 70, w: 180, h: 48 };
}
export function showVersionDialog(ov: OverlayStack, f: DialogFrame) {
  return ov.push<'continue'>({
    id: 'version',
    kind: 'popup',
    modal: true,
    scrim: { color: B.mask },
    draw: (sf) => {
      const c = sf.ctx;
      const { r } = box(f, VERSION_H);
      panel(c, r, 0.98);
      center(c, '游戏已更新', r.x + r.w / 2, r.y + 52, wk(26), B.gold, 26);
      c.font = wk(15);
      c.fillStyle = B.paper;
      wrap(c, VERSION_TEXT, r.w - 40, 15).forEach((l, i) => c.fillText?.(l, r.x + 20, r.y + 96 + i * 26));
      button(c, versionButton(f), '继续', 'confirm');
    },
    gesture: (e: GestureEvent, h) => {
      if (e.type === 'tap' && inside(versionButton(f), e.at)) h.close('continue');
      return true;
    },
  });
}

export interface ResumePlanIn {
  configChanged: boolean;
  /** 旧档迁移回退类型（未迁移 null） */
  migration: { kind: 'battle_rollback' | 'node_rollback' | 'none' } | null;
  pendingType: string | null;
  /** 原本要弹的 toast（noticeText 结果） */
  toast: string | null;
}
/**
 * 续玩提示决策（PRD §21.4 + runstate-migration.md §4）：
 * - 配置版本不一致且存档停在战斗中（含旧档迁移的战斗回退）→ 只弹 §21.4「继续」确认框，不叠 toast；
 * - 配置版本不一致但不在战斗中 → 静默升级（不弹框、不弹 toast）；
 * - 版本一致 → 按原 toast。
 * 回退点取两者更早者：deserializeRunState 已按迁移规则回退（战斗中的旧档本来就回到本场开打前 / 上一节点）。
 */
export function resumePlan(o: ResumePlanIn): { dialog: boolean; toast: string | null; upgradeConfig: boolean } {
  if (!o.configChanged) return { dialog: false, toast: o.toast, upgradeConfig: false };
  const inBattle = ['BATTLE', 'ELITE', 'BOSS'].includes(o.pendingType ?? '') || (!!o.migration && o.migration.kind !== 'none');
  return { dialog: inBattle, toast: null, upgradeConfig: true };
}

/**
 * 不可逆操作按钮（#108 UI 复审）：朱砂底（同 primary）；外描边 2px cinnHi，紧贴其外 1px rgba(0,0,0,.7) 暗环（分层描边，不用模糊）；字 goldHi。
 */
export function dangerButton(c: Parameters<typeof button>[0], r: Rect, label: string) {
  markHit(r);
  c.fillStyle = BTN_FILL_PRIMARY;
  c.fillRect(r.x, r.y, r.w, r.h);
  c.fillStyle = 'rgba(255,255,255,.08)';
  c.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h / 2 - 2);
  frame(c, { x: r.x - 2.5, y: r.y - 2.5, w: r.w + 5, h: r.h + 5 }, DANGER_RING, 1);
  frame(c, { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, B.cinnHi, 2);
  center(c, label, r.x + r.w / 2, r.y + r.h / 2 + 7, brush(20), B.goldHi, 20);
}
export const DANGER_RING = 'rgba(0,0,0,.7)';
/** 与 paint.ts primary 按钮同色 */
const BTN_FILL_PRIMARY = '#9C3A28';
