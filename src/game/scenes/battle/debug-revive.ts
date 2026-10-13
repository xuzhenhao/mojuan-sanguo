/** 调试（仅 dev）：`?page=battle&revive=1` 进战斗后把主将打到 0，直接弹「将星未陨」复活层，供 UI 验收截图（#151） */
import type { Game } from '../../../core/battle';

export function wantDebugRevive(query: Record<string, string>, dev: boolean): boolean {
  return dev && query.page === 'battle' && query.revive === '1';
}

export function triggerDebugRevive(g: Game): Promise<void> {
  if (g.reviveLeft <= 0) g.reviveLeft = 1;
  g.hand = [];
  g.p.hp = 1;
  g.p.armor = 0;
  return g.dmgPlayer(1);
}
