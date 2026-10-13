/** 调试（仅 dev）：`?page=battle&epiphany=1`（默认态）/ `?page=battle&epiphany=full`（满 2 词条态），`&epiN=1|2` 限制候选条数进战斗后直接弹灵光一闪层，供 UI 验收截图（#105） */
import type { Game } from '../../../core/battle';
import { affixPool } from '../../../core/rules';

export type DebugEpiphany = 'default' | 'full';

export function wantDebugEpiphany(query: Record<string, string | undefined>, dev: boolean): DebugEpiphany | null {
  if (!dev || query.page !== 'battle' || !query.epiphany) return null;
  return query.epiphany === 'full' ? 'full' : 'default';
}

/** 取手里第一张有词条池的牌（满态先铭刻 2 条），强制触发一次灵光一闪（走 core 正式流程） */
export function triggerDebugEpiphany(g: Game, mode: DebugEpiphany, n?: number): Promise<void> {
  const card = g.hand.find((c) => affixPool(c, g.deckMaster).length >= (mode === 'full' ? 5 : 3)) ?? g.hand[0];
  if (!card) return Promise.resolve();
  if (mode === 'full')
    card.mods = affixPool(card, g.deckMaster)
      .slice(0, 2)
      .map((a) => a.id);
  g.settings.epiphanyRate = 1;
  g.epiCount = 0;
  if (!n || n >= 3) return g.maybeEpiphany(card, true);
  const io = g.io;
  const orig = io.epiphany.bind(io);
  io.epiphany = (c, o, r) => orig(c, o.slice(0, n), r);
  return g.maybeEpiphany(card, true).finally(() => void (io.epiphany = orig));
}
