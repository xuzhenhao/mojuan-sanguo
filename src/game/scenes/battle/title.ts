/** 战斗页顶条标题（#216）：模板只来自 rules.yaml battleTitle，按节点类型选用 */
import { CONFIG } from '../../../data/config';

export function battleTitle(nodeType: string | undefined, n: number, name: string, t = CONFIG.rules.battleTitle): string {
  const tpl = nodeType === 'BOSS' ? t.boss : nodeType === 'ELITE' ? t.elite : t.normal;
  return tpl.replace(/\{n\}/g, String(n)).replace(/\{name\}/g, name);
}
