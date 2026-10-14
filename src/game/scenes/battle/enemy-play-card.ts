/**
 * 敌方出牌牌面（#157，flow.md §3.4 / render-spec §3.6）：
 * - enemy_act 期间在战场中央偏上画一张「正在打出」的牌；
 * - 复活取消（reviveFx.cancelled）时化墨淡出画在这张牌面上。
 * 布局读 rules.battleEnemyPlay；标签文案走文本表 battle.enemy_play_label。
 * 无独立视觉稿：按敌人牌/意图水墨风格自洽落地，待 UI 签截图。
 */
import { CARDS } from '../../../data/cards';
import { BATTLE_ENEMY_PLAY, type BattleEnemyPlayCfg } from '../../../data/config';
import { t } from '../../../data/text';
import type { EnemyAct } from '../../../core/types';
import type { Ctx2DLike, Rect } from '../../../engine/types';
import { drawInlineIcon } from '../../overlays/glyphs';
import { C, FONT, frame, goldFrame, rect, text } from './paint';

export interface EnemyPlayInfo {
  /** 牌面主名（杀 / 闪 / 万箭齐发 …） */
  name: string;
  /** 次数后缀，如 ×2；单次为空 */
  count: string;
  dmg: number;
  /** 只出闪 */
  defOnly: boolean;
  /** 窗格色感 */
  tint: string;
}

/** 把意图 acts 收成一张出牌牌面信息（多动作用主名 + ×n / 总伤） */
export function enemyPlayInfo(acts: readonly EnemyAct[], dmg: number): EnemyPlayInfo {
  const list = acts.length ? [...acts] : (['杀'] as EnemyAct[]);
  const primary = list.find((a) => a !== '闪') ?? list.find((a) => a === '闪') ?? list[0];
  const same = list.filter((a) => a === primary).length;
  const name = actName(primary);
  const defOnly = dmg === 0 && list.every((a) => a === '闪');
  const tint = defOnly ? C.azure : dmg > 0 ? C.cinnabar : C.goldDk;
  return { name, count: same > 1 ? `×${same}` : '', dmg, defOnly, tint };
}

function actName(a: EnemyAct): string {
  if (a === '杀+') return '杀';
  if (a === '万箭') return '万箭齐发';
  if (a === '咒') return '咒';
  if (a.startsWith('锦囊:')) return CARDS[a.slice(3)]?.name ?? a.slice(3);
  return a;
}

/** 牌面矩形：水平按 cx 居中，顶边 = safe.top + top */
export function enemyPlayCardRect(W: number, safeTop: number, cfg: BattleEnemyPlayCfg = BATTLE_ENEMY_PLAY): Rect {
  return {
    x: W * cfg.cx - cfg.w / 2,
    y: safeTop + cfg.top,
    w: cfg.w,
    h: cfg.h,
  };
}

export interface DrawEnemyPlayOpts {
  /** 整体透明度 */
  alpha?: number;
  /** 化墨进度 0..1（复活作废） */
  ink?: number;
  /** 出手浮动进度 0..1（sin 位移） */
  bob?: number;
  cfg?: BattleEnemyPlayCfg;
}

/** 画敌方出牌牌面（水墨扁平：金框 + 色窗 + 图标/数字 + 底名） */
export function drawEnemyPlayCard(ctx: Ctx2DLike, r: Rect, info: EnemyPlayInfo, opts: DrawEnemyPlayOpts = {}) {
  const cfg = opts.cfg ?? BATTLE_ENEMY_PLAY;
  const a0 = ctx.globalAlpha;
  const bob = (opts.bob ?? 0) > 0 ? Math.sin((opts.bob ?? 0) * Math.PI) * cfg.rise : 0;
  const rr = { ...r, y: r.y - bob };
  ctx.globalAlpha = a0 * (opts.alpha ?? 1);
  goldFrame(ctx, rr, info.defOnly ? 'silver' : 'bronze', 4);
  const win = { x: rr.x + 8, y: rr.y + 22, w: rr.w - 16, h: rr.h - 48 };
  rect(ctx, win, info.tint);
  ctx.globalAlpha = a0 * (opts.alpha ?? 1) * 0.35;
  rect(ctx, { x: win.x + 5, y: win.y + 5, w: win.w - 10, h: win.h - 10 }, C.paper);
  ctx.globalAlpha = a0 * (opts.alpha ?? 1);
  // 顶标签
  text(ctx, t('battle.enemy_play_label'), rr.x + rr.w / 2, rr.y + 14, {
    size: cfg.labelSize,
    color: C.goldLo,
    font: FONT.body,
    align: 'center',
  });
  // 中部图标 + 数字
  const cx = rr.x + rr.w / 2;
  const midY = win.y + win.h / 2;
  const icon = info.dmg > 0 ? 'sword' : info.defOnly ? 'spark' : 'spark';
  const iconCol = info.dmg > 0 ? C.cinnHi : info.defOnly ? C.defIntent : C.gold;
  if (info.defOnly) {
    text(ctx, '闪', cx, midY + 2, { size: cfg.iconSize, color: C.defIntent, font: FONT.brush, align: 'center' });
  } else {
    drawInlineIcon(ctx, icon, cx - (info.dmg > 0 ? 12 : 0), midY + cfg.iconSize * 0.35, cfg.iconSize, iconCol, C.ink);
    if (info.dmg > 0) {
      text(ctx, String(info.dmg), cx + 14, midY + 2, { size: cfg.iconSize, color: C.dmg, font: FONT.num, align: 'center', bold: true });
    }
  }
  // 底名
  const label = info.name + info.count;
  text(ctx, label, cx, rr.y + rr.h - 14, { size: cfg.nameSize, color: C.ink, font: FONT.brush, align: 'center' });
  // 化墨覆盖
  const ink = opts.ink ?? 0;
  if (ink > 0) {
    ctx.globalAlpha = a0 * (opts.alpha ?? 1) * ink;
    rect(ctx, { x: rr.x + 4, y: rr.y + 4, w: rr.w - 8, h: rr.h - 8 }, C.ink);
    frame(ctx, rr, C.ink, 2);
  }
  ctx.globalAlpha = a0;
}
