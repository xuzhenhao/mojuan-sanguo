import type { CardDef, Slot, Suit } from '../core/types';
import { CONFIG, atomAmount, type CardCfg } from './config';

/** 卡表：来自 config/cards/**.yaml（PRD 6.6 原型子集） */
const SLOT: Record<NonNullable<CardCfg['slot']>, Slot> = { weapon: 'weapon', armor: 'armor', plus_horse: 'plus', minus_horse: 'minus' };

function toDef(c: CardCfg): CardDef {
  const tags = new Set(c.tags ?? []);
  const d: CardDef = { name: c.name, type: c.typeLabel ?? c.type, cost: c.cost, desc: c.desc };
  if (tags.has('sha')) d.sha = true;
  if (tags.has('fire')) d.fire = true;
  if (tags.has('shan')) d.shan = true;
  if (tags.has('tao')) d.tao = true;
  if (tags.has('jiu')) d.jiu = true;
  if (tags.has('aoe')) d.aoe = true;
  if (tags.has('need_red')) d.needRed = true;
  if (d.sha) {
    const dmg = atomAmount(c.abilities, 'damage') ?? 1;
    if (dmg > 1) d.bonus = dmg - 1;
  }
  if (c.target === 'range' || c.target === 'any') d.tgt = c.target;
  if (c.slot) d.slot = SLOT[c.slot];
  if (c.range !== undefined) d.range = c.range;
  return d;
}

export const CARDS: Record<string, CardDef> = Object.fromEntries(Object.values(CONFIG.cards).map((c) => [c.id, toDef(c)]));

/** 开局牌组：config/decks/<rules.starterDeck>.yaml */
export const STARTER_DECK: [string, Suit, number][] = CONFIG.decks[CONFIG.rules.starterDeck].cards.map((c) => [c.card, c.suit, c.rank]);
