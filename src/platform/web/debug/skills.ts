/**
 * 主动技按钮（UI 层）：完全由配置生成，不按技能名写死。
 * 数据来源：G.effects.activeAbilities()（当前主将 + 副将中 trigger.when === 'active' 的能力），
 * 可用性/次数来自引擎的 canActivate / remaining，需求（弃牌 / 选敌人）来自 activeNeeds。
 */
import type { Game } from '../../../core/battle';
import { cardMatches } from '../../../core/effects';
import type { CardInst, Enemy } from '../../../core/types';

export interface SkillButton {
  id: string;
  name: string;
  desc: string;
  needCard: boolean;
  needTarget: boolean;
  /** 剩余次数；无限制时为 Infinity */
  remaining: number;
  disabled: boolean;
  /** 不可用原因（用于提示），可用时为空串 */
  reason: string;
}

export function skillButtons(g: Game, locked = false): SkillButton[] {
  return g.effects.activeAbilities().map((s) => {
    const id = s.ab.id;
    const need = g.activeNeeds(id);
    const remaining = g.effects.remaining(s);
    const usable = g.canActivate(id);
    const noTarget = need.target && g.alive().length === 0;
    let reason = '';
    if (remaining <= 0) reason = '次数已用完';
    else if (!usable) reason = need.card ? '没有可弃置的牌' : '条件未满足';
    else if (noTarget) reason = '没有可选目标';
    return {
      id,
      name: s.ab.name ?? id,
      desc: s.ab.desc ?? '',
      needCard: need.card,
      needTarget: need.target,
      remaining,
      disabled: locked || !!reason,
      reason,
    };
  });
}

/** 该主动技可弃置的手牌（依据 do: discard 的 from 筛选） */
export function skillCardOk(g: Game, id: string, c: CardInst) {
  const dis = g.effects.activeAbility(id)?.ab.do.find((a) => a.do === 'discard');
  return !!dis && g.hand.includes(c) && cardMatches(c, dis.from);
}

/** 该主动技可选的敌人目标 */
export function skillTargetOk(g: Game, _id: string, e: Enemy) {
  return g.alive().includes(e);
}

export interface SkillPick {
  card?: CardInst;
  target?: Enemy;
}
/** 尚缺的步骤：card → target → 完成(null) */
export function nextSkillStep(b: Pick<SkillButton, 'needCard' | 'needTarget'>, p: SkillPick): 'card' | 'target' | null {
  if (b.needCard && !p.card) return 'card';
  if (b.needTarget && !p.target) return 'target';
  return null;
}
