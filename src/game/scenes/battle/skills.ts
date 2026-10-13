/**
 * 战斗页主动技按钮：完全由配置生成（当前主将 + 副将中 trigger.when === 'active' 的能力），不按技能名写死。
 * 目标合法性统一走 core 的 legalTargets / isLegalTarget（#28）。
 * 不可用原因的优先级：没有可选目标 → 次数已用完 → 没有可弃置的牌 / 条件未满足。
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
  /** 不可用原因；可用时为空串 */
  reason: string;
}

export function skillReason(g: Game, id: string): string {
  const s = g.effects.activeAbility(id);
  if (!s) return '条件未满足';
  const need = g.activeNeeds(id);
  if (need.target && g.legalTargets(id).length === 0) return '没有可选目标';
  if (g.effects.remaining(s) <= 0) return '次数已用完';
  if (!g.canActivate(id)) return need.card ? '没有可弃置的牌' : '条件未满足';
  return '';
}

export function battleSkillButtons(g: Game, locked = false): SkillButton[] {
  return g.effects.activeAbilities().map((s) => {
    const id = s.ab.id;
    const need = g.activeNeeds(id);
    const reason = skillReason(g, id);
    return {
      id,
      name: s.ab.name ?? id,
      desc: s.ab.desc ?? '',
      needCard: need.card,
      needTarget: need.target,
      remaining: g.effects.remaining(s),
      disabled: locked || !!reason,
      reason,
    };
  });
}

/** 该主动技可弃置的手牌 */
export function skillCardOk(g: Game, id: string, c: CardInst) {
  const dis = g.effects.activeAbility(id)?.ab.do.find((a) => a.do === 'discard');
  return !!dis && g.hand.includes(c) && cardMatches(c, dis.from);
}

/** 该主动技可选的敌人目标：只认 core 的 isLegalTarget */
export function skillTargetOk(g: Game, id: string, e: Enemy) {
  return g.isLegalTarget(id, e);
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
