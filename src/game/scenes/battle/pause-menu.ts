/**
 * 战斗内暂停（#196，承接 #108）：顶条右上暂停钮 → 暂停面板「继续 / 设置 / 放弃本局」。
 * 「设置」复用 #108 设置浮层（pauseFlow），「放弃本局」先弹二次确认（取消 / 放弃，文案 battle.abandon_*），确定后与 #108 同口径按战败结算。
 * 布局参数读 rules.battlePause，文案走文本表 battle.*；水墨扁平、T 主题色、不用模糊；只认按钮，点外部不关闭。
 */
import type { GestureEvent } from '../../../engine/input';
import type { OverlayStack } from '../../../engine/modal';
import type { Ctx2DLike, Rect } from '../../../engine/types';
import { hitInside } from '../../../engine/hit';
import { BATTLE_PAUSE, type BattlePauseCfg } from '../../../data/config';
import { t } from '../../../data/text';
import { pauseFlow, type PauseDeps } from '../../result/pause';
import type { DialogFrame } from '../../result/resume';
import { BRUSH, SANS, T } from '../p4-kit';

export type BattlePauseChoice = 'continue' | 'settings' | 'abandon';
export const BATTLE_PAUSE_ID = 'battle-pause';

/** 顶条暂停钮：圆心与热区（热区 ≥ 44） */
export function pauseIconLayout(width: number, topY: number, cfg: BattlePauseCfg = BATTLE_PAUSE) {
  const { r, hit, right } = cfg.pauseBtn;
  const cx = width - right - r;
  const cy = topY + 13;
  return { cx, cy, r, textRight: cx - hit / 2 - cfg.pauseBtn.textGap, hit: { x: cx - hit / 2, y: cy - hit / 2, w: hit, h: hit } as Rect };
}

export function drawPauseIcon(c: Ctx2DLike, width: number, topY: number, cfg: BattlePauseCfg = BATTLE_PAUSE) {
  const { cx, cy, r } = pauseIconLayout(width, topY, cfg);
  const x = c as Ctx2DLike & { beginPath?(): void; arc?(...a: number[]): void; fill?(): void; stroke?(): void; lineWidth?: number; strokeStyle?: string };
  if (x.beginPath && x.arc && x.fill && x.stroke) {
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = T.lac3;
    x.fill();
    x.lineWidth = 1;
    x.strokeStyle = T.goldLo;
    x.stroke();
  } else {
    c.fillStyle = T.lac3;
    c.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  c.fillStyle = T.gold;
  c.fillRect(cx - 5, cy - 6, 3, 12);
  c.fillRect(cx + 2, cy - 6, 3, 12);
}

export function battlePauseLayout(f: DialogFrame, cfg: BattlePauseCfg = BATTLE_PAUSE) {
  const { w, padTop, padBottom } = cfg.panel;
  const b = cfg.button;
  const h = padTop + 3 * b.h + 2 * b.gap + padBottom;
  const panel: Rect = { x: (f.width - w) / 2, y: (f.height - h) / 2, w, h };
  const bx = panel.x + (w - b.w) / 2;
  const at = (i: number): Rect => ({ x: bx, y: panel.y + padTop + i * (b.h + b.gap), w: b.w, h: b.h });
  return { panel, titleY: panel.y + 46, continue: at(0), settings: at(1), abandon: at(2) };
}

function btn(c: Ctx2DLike, r: Rect, label: string, kind: 'confirm' | 'secondary' | 'danger') {
  c.fillStyle = kind === 'confirm' ? T.cinnabar : T.lac2;
  c.fillRect(r.x, r.y, r.w, r.h);
  c.fillStyle = kind === 'confirm' ? T.goldHi : kind === 'danger' ? T.cinnHi : T.goldLo;
  c.fillRect(r.x, r.y, r.w, 1);
  c.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  c.fillRect(r.x, r.y, 1, r.h);
  c.fillRect(r.x + r.w - 1, r.y, 1, r.h);
  c.font = BRUSH(20);
  c.fillStyle = kind === 'danger' ? T.cinnHi : kind === 'confirm' ? T.paper : T.gold;
  (c as Ctx2DLike & { textAlign?: string }).textAlign = 'center';
  c.fillText?.(label, r.x + r.w / 2, r.y + r.h / 2 + 7);
}

export function drawBattlePause(c: Ctx2DLike, f: DialogFrame, cfg: BattlePauseCfg = BATTLE_PAUSE) {
  const L = battlePauseLayout(f, cfg);
  const p = L.panel;
  c.fillStyle = T.goldLo;
  c.fillRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2);
  c.fillStyle = T.lac1;
  c.fillRect(p.x, p.y, p.w, p.h);
  c.fillStyle = T.goldDk;
  c.fillRect(p.x + 6, p.y + 6, p.w - 12, 1);
  c.fillRect(p.x + 6, p.y + p.h - 7, p.w - 12, 1);
  c.font = BRUSH(30);
  c.fillStyle = T.gold;
  (c as Ctx2DLike & { textAlign?: string }).textAlign = 'center';
  c.fillText?.(t('battle.pause_title'), p.x + p.w / 2, L.titleY);
  btn(c, L.continue, t('battle.pause_continue'), 'confirm');
  btn(c, L.settings, t('battle.pause_settings'), 'secondary');
  btn(c, L.abandon, t('battle.pause_abandon'), 'danger');
}

/** 暂停面板：只认三个按钮（点外部吞掉不关闭） */
export function showBattlePause(ov: OverlayStack, f: DialogFrame, cfg: BattlePauseCfg = BATTLE_PAUSE) {
  return ov.push<BattlePauseChoice>({
    id: BATTLE_PAUSE_ID,
    kind: 'popup',
    modal: true,
    pausesScene: true,
    scrim: { color: T.lac0, alpha: cfg.scrimAlpha },
    draw: (sf) => drawBattlePause(sf.ctx, f, cfg),
    gesture: (e: GestureEvent, h) => {
      if (e.type !== 'tap') return true;
      const L = battlePauseLayout(f, cfg);
      if (hitInside(L.continue, e.at)) h.close('continue');
      else if (hitInside(L.settings, e.at)) h.close('settings');
      else if (hitInside(L.abandon, e.at)) h.close('abandon');
      return true;
    },
  });
}

/**
 * 战斗暂停流程：继续 → 'continue'；设置 → #108 设置浮层（其「继续」回战斗、「放弃本局」照常二次确认）；
 * 放弃本局 → 二次确认，「取消」回到暂停面板；「放弃」 → 'abandon'
 */
export async function battlePauseFlow(ov: OverlayStack, f: DialogFrame, d: PauseDeps, cfg: BattlePauseCfg = BATTLE_PAUSE): Promise<'continue' | 'abandon'> {
  for (;;) {
    const r = await showBattlePause(ov, f, cfg).result;
    if (r === 'continue' || r === undefined) return 'continue';
    if (r === 'settings') return pauseFlow(ov, f, d);
    if (await confirmBattleAbandon(ov, f, cfg).result) return 'abandon';
  }
}

export const BATTLE_ABANDON_ID = 'battle-abandon';

/** 放弃二次确认布局（#196 验收）：左「取消」右「放弃」 */
export function abandonConfirmLayout(f: DialogFrame, cfg: BattlePauseCfg = BATTLE_PAUSE) {
  const c = cfg.confirm;
  const panel: Rect = { x: (f.width - c.w) / 2, y: (f.height - c.h) / 2, w: c.w, h: c.h };
  const by = panel.y + c.h - c.padBottom - c.btnH;
  const x0 = panel.x + (c.w - 2 * c.btnW - c.btnGap) / 2;
  return {
    panel,
    titleY: panel.y + 52,
    bodyY: panel.y + 96,
    cancel: { x: x0, y: by, w: c.btnW, h: c.btnH } as Rect,
    ok: { x: x0 + c.btnW + c.btnGap, y: by, w: c.btnW, h: c.btnH } as Rect,
  };
}

export function drawAbandonConfirm(c: Ctx2DLike, f: DialogFrame, cfg: BattlePauseCfg = BATTLE_PAUSE) {
  const L = abandonConfirmLayout(f, cfg);
  const p = L.panel;
  c.fillStyle = T.cinnabar;
  c.fillRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2);
  c.fillStyle = T.lac1;
  c.fillRect(p.x, p.y, p.w, p.h);
  (c as Ctx2DLike & { textAlign?: string }).textAlign = 'center';
  c.font = BRUSH(26);
  c.fillStyle = T.gold;
  c.fillText?.(t('battle.abandon_confirm_title'), p.x + p.w / 2, L.titleY);
  c.font = SANS(15);
  c.fillStyle = T.paper2;
  c.fillText?.(t('battle.abandon_confirm_body'), p.x + p.w / 2, L.bodyY);
  btn(c, L.cancel, t('battle.abandon_cancel'), 'secondary');
  btn(c, L.ok, t('battle.abandon_ok'), 'danger');
}

/** 放弃二次确认：取消 → false，放弃 → true；点外部不关闭 */
export function confirmBattleAbandon(ov: OverlayStack, f: DialogFrame, cfg: BattlePauseCfg = BATTLE_PAUSE) {
  return ov.push<boolean>({
    id: BATTLE_ABANDON_ID,
    kind: 'popup',
    modal: true,
    pausesScene: true,
    scrim: { color: T.lac0, alpha: cfg.scrimAlpha },
    draw: (sf) => drawAbandonConfirm(sf.ctx, f, cfg),
    gesture: (e: GestureEvent, h) => {
      if (e.type !== 'tap') return true;
      const L = abandonConfirmLayout(f, cfg);
      if (hitInside(L.cancel, e.at)) h.close(false);
      else if (hitInside(L.ok, e.at)) h.close(true);
      return true;
    },
  });
}
