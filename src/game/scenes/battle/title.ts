/** 战斗页顶条标题（#216）：模板只来自 rules.yaml battleTitle，按节点类型选用 */
import { CONFIG } from '../../../data/config';

export function battleTitle(nodeType: string | undefined, n: number, name: string, t = CONFIG.rules.battleTitle): string {
  const tpl = nodeType === 'BOSS' ? t.boss : nodeType === 'ELITE' ? t.elite : t.normal;
  return tpl.replace(/\{n\}/g, String(n)).replace(/\{name\}/g, name);
}

/** 竖排名 / 顶条短名：yaml shortName，没有时用 name（#216 跟进） */
export const enemyShortName = (e: { name: string; short?: string }) => e.short ?? e.name;
/** Boss 战顶条用 Boss 短名，其余用组包名 */
export function titleName(nodeType: string | undefined, battleName: string, enemies: { name: string; short?: string; tier?: string }[]): string {
  if (nodeType !== 'BOSS') return battleName;
  const b = enemies.find((e) => e.tier === 'Boss');
  return b ? enemyShortName(b) : battleName;
}
