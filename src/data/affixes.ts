import type { AffixDef, Rarity } from '../core/types';
import { CONFIG } from './config';

/** 词条库：来自 config/affixes/**.yaml（PRD 8.5） */
const SLOT = { weapon: 'weapon', armor: 'armor', plus_horse: 'plus', minus_horse: 'minus' } as const;
export const AFFIXES: AffixDef[] = CONFIG.affixes.map((a) => {
  const d: AffixDef = { id: a.id, r: a.rarity, n: a.name, d: a.desc, cat: a.category };
  if (a.mutex) d.mutex = a.mutex;
  if (a.only) d.only = a.only;
  if (a.slot) d.slot = SLOT[a.slot];
  if (a.maxPerDeck) d.maxPerDeck = a.maxPerDeck;
  return d;
});

/** 先抽稀有度再抽词条：config/rules.yaml rarityWeight */
export const RARITY_WEIGHT: Record<Rarity, number> = { ...CONFIG.rules.rarityWeight };

/** PRD 8.3：config/rules.yaml epiphany */
export const EPIPHANY = { ...CONFIG.rules.epiphany };
