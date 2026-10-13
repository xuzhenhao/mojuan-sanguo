/**
 * 奇遇事件规则（#91；docs/specs/events-v05.md §2–§6，PRD §13）：抽事件、条件（置灰）、执行结果。
 * 纯函数：输入局内数值的可变副本 + 随机流，输出结果文案与数值变化；页面只负责交互与写回 RunState。
 */
import type { Rng } from '../../core/rng';
import type { CardInst, Suit } from '../../core/types';
import { canBurn, canBurnAny } from '../../core/run/rest';
import { CONFIG, type EventCfg, type EventOption, type EventOutcome, type EventRequire } from '../../data/config';
import { ECONOMY } from '../../data/economy';
import { cardPool, rollSuit, weighted } from '../economy/pools';
import { handName } from '../scenes/battle/hpview';
import { seeded } from '../../core/rng';
import { hashSeed } from '../../core/run/map';
import type { EncounterPools } from '../../core/run/encounters';

/** 事件页读写的局内数值（RunState 子集） */
export interface EventRun {
  hp: number;
  maxHp: number;
  gold: number;
  deck: CardInst[];
  nextUid: number;
  heroMain: string;
  heroSub: string;
  /** V13 收编：下一场战斗开场护甲（RunState.nextBattleArmor） */
  nextBattleArmor: number;
}

/** 开场护甲总上限（PRD 5.x「与宝物叠加时开场护甲总上限 4」） */
export const START_ARMOR_CAP = 4;

export const eventDef = (id: string): EventCfg | undefined => CONFIG.events[id];
/** 本章启用的事件（按 id 排序，保证抽取可复现） */
export const eventPool = (chapter: number): EventCfg[] =>
  Object.values(CONFIG.events)
    .filter((e) => e.enabled && e.chapters.includes(chapter))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

/** 同一局内不重复、无放回抽取（§13.1）；池抽空返回 null（节点降级为 1 场 easy 战斗） */
export function drawEvent(rng: Rng, chapter: number, seen: readonly string[]): EventCfg | null {
  const left = eventPool(chapter).filter((e) => !seen.includes(e.id));
  if (!left.length) return null;
  return left[Math.floor(rng() * left.length)];
}

/** 条件不满足的原因（null = 满足），文案按 §6.1 */
export function requireFail(r: EventRequire, s: EventRun): string | null {
  switch (r.type) {
    case 'gold_at_least':
      return s.gold >= (r.value ?? 0) ? null : '铜钱不足';
    case 'max_hp_at_least':
      return s.maxHp >= (r.value ?? 0) ? null : '体力上限过低';
    case 'hp_below_max':
      return s.hp < s.maxHp ? null : '体力已满';
    case 'deck_removable':
      return canBurnAny(s.deck, ECONOMY.minDeck) ? null : '牌组不能再少';
    case 'hero_is':
      return s.heroMain === r.hero || s.heroSub === r.hero ? null : `需要${CONFIG.heroes[r.hero ?? '']?.name ?? r.hero}`;
  }
}
export const optionBlocked = (o: EventOption, s: EventRun): string | null => {
  for (const r of o.requires ?? []) {
    const why = requireFail(r, s);
    if (why) return why;
  }
  return null;
};
/** 选项是否需要先打开删牌页（V05 卖牌） */
export const needsRemove = (o: EventOption) => hasType(o.outcomes, 'remove_card');
function hasType(xs: EventOutcome[] | undefined, t: EventOutcome['type']): boolean {
  return !!xs?.some((o) => o.type === t || [o.success, o.fail, o.red, o.black, o.then, o.else].some((y) => hasType(y, t)));
}

/**
 * 加牌候选池（§6.3-3/4）：hero → 该武将专属牌（H02 = X201）；rarity → 非专属、进奖励池（rewardWeight>0）的同稀有度牌，
 * 势力牌只出主将势力（同奖励池 14.8 规则）。
 */
export function addPool(s: Pick<EventRun, 'heroMain' | 'heroSub'>, pool: NonNullable<EventOutcome['pool']>): { id: string; weight: number }[] {
  if (pool.hero)
    return Object.values(CONFIG.cards)
      .filter((c) => (c as { exclusiveHero?: string }).exclusiveHero === pool.hero)
      .map((c) => ({ id: c.id, weight: 1 }));
  const excl = new Set(
    Object.values(CONFIG.cards)
      .filter((c) => (c as { exclusiveHero?: string }).exclusiveHero)
      .map((c) => c.id),
  );
  return cardPool({ main: s.heroMain, sub: s.heroSub }).filter((c) => !excl.has(c.id) && (!pool.rarity || c.rarity === pool.rarity));
}

/** 天机签筒（PRD 5.10）：52 张标准花色等概率，红 = ♥♦，P(红)=50% */
export function drawJudge(rng: Rng): { suit: Suit; rank: number; red: boolean } {
  const k = Math.floor(rng() * 52);
  const suit = (['S', 'H', 'C', 'D'] as Suit[])[k % 4];
  return { suit, rank: 1 + Math.floor(k / 4), red: suit === 'H' || suit === 'D' };
}

export interface EventChange {
  kind: 'hp' | 'maxHp' | 'gold' | 'card+' | 'card-' | 'armor';
  text: string;
}
export interface EventResult {
  text: string;
  changes: EventChange[];
  /** V13 剿灭：立刻打一场 easy 战斗，奖励铜钱倍率 */
  battle?: { goldMult: number };
  judge?: { suit: Suit; rank: number; red: boolean };
  /** roll / judge / branch 的成败（选结果文案） */
  success?: boolean;
  added: CardInst[];
  removed: CardInst[];
}

const cardName = (id: string) => handName(CONFIG.cards[id] ?? { name: id });

/**
 * 执行一个选项（就地修改 s）。removeUid：含删牌的选项先在删牌页选好；未选（取消）调用方不应调用本函数。
 * 结果按 outcomes 顺序执行；所有随机都走传入的 rng（局内 event 流，可复现）。
 */
export function applyOption(ev: EventCfg, idx: number, s: EventRun, rng: Rng, removeUid?: number): EventResult {
  const o = ev.options[idx];
  if (!o) throw new Error(`事件 ${ev.id} 没有选项 ${idx}`);
  const why = optionBlocked(o, s);
  if (why) throw new Error(`选项不可用：${why}`);
  const before = { hp: s.hp, maxHp: s.maxHp, gold: s.gold };
  const res: EventResult = { text: '', changes: [], added: [], removed: [] };
  const run = (xs: EventOutcome[] = []) => {
    for (const x of xs) step(x);
  };
  const step = (x: EventOutcome) => {
    switch (x.type) {
      case 'gold':
        s.gold = Math.max(0, s.gold + Number(x.value ?? 0));
        break;
      case 'heal':
        s.hp = x.value === 'full' ? s.maxHp : Math.min(s.maxHp, s.hp + Number(x.value ?? 0));
        break;
      case 'damage':
        s.hp = Math.max(1, s.hp - Number(x.value ?? 0)); // 不致死（§13.1 V06）
        break;
      case 'max_hp':
        s.maxHp = Math.max(1, s.maxHp + Number(x.value ?? 0));
        s.hp = Math.min(s.hp, s.maxHp);
        break;
      case 'add_card': {
        const id = x.card ?? weighted(rng, addPool(s, x.pool ?? {}), (c) => c.weight)?.id;
        if (!id) break;
        const { suit, rank } = rollSuit(rng, id);
        const c: CardInst = { uid: s.nextUid++, id, suit, rank, mods: [] };
        s.deck.push(c);
        res.added.push(c);
        break;
      }
      case 'remove_card': {
        if (removeUid === undefined || !canBurn(s.deck, removeUid, ECONOMY.minDeck)) throw new Error('删牌未选择或不合法');
        const i = s.deck.findIndex((c) => c.uid === removeUid);
        res.removed.push(...s.deck.splice(i, 1));
        break;
      }
      case 'roll': {
        const ok = rng() < (x.chance ?? 0);
        res.success = ok;
        run(ok ? x.success : x.fail);
        break;
      }
      case 'judge': {
        const j = drawJudge(rng);
        res.judge = j;
        res.success = j.red;
        run(j.red ? x.red : x.black);
        break;
      }
      case 'branch': {
        const ok = !!x.if && !requireFail(x.if, s);
        res.success = ok;
        run(ok ? x.then : x.else);
        break;
      }
      case 'next_battle_buff':
        s.nextBattleArmor = Math.min(START_ARMOR_CAP, s.nextBattleArmor + (x.armor ?? 0));
        res.changes.push({ kind: 'armor', text: `下一战开场护甲 +${x.armor ?? 0}` });
        break;
      case 'battle':
        res.battle = { goldMult: x.reward_mult?.gold ?? 1 };
        break;
      case 'leave':
        break;
    }
  };
  run(o.outcomes);
  const tpl = res.success === undefined ? (o.result ?? '') : res.success ? (o.resultSuccess ?? o.result ?? '') : (o.resultFail ?? o.result ?? '');
  res.text = tpl.replace('{card}', res.added[0] ? cardName(res.added[0].id) : '').replace('{removed}', res.removed[0] ? cardName(res.removed[0].id) : '');
  const diff: EventChange[] = [];
  if (s.maxHp !== before.maxHp) diff.push({ kind: 'maxHp', text: `体力上限 ${before.maxHp}→${s.maxHp}` });
  if (s.hp !== before.hp) diff.push({ kind: 'hp', text: `体力 ${before.hp}→${s.hp}` });
  if (s.gold !== before.gold) diff.push({ kind: 'gold', text: `铜钱 ${before.gold}→${s.gold}` });
  for (const c of res.added) diff.push({ kind: 'card+', text: `+ ${cardName(c.id)}` });
  for (const c of res.removed) diff.push({ kind: 'card-', text: `− ${cardName(c.id)}` });
  res.changes = [...diff, ...res.changes];
  return res;
}

/**
 * 奇遇战斗（V13 剿灭 / 池抽空降级）：从 easy 池独立抽取（§13.1）——用节点派生的独立种子，
 * 不改 EncounterState（不占前 2 场 easy 名额、不参与普通池防重复）。
 */
export function drawEventEasy(runSeed: number, chapter: number, nodeId: string, pools: EncounterPools) {
  const list = pools.pools.easy;
  const i = Math.floor(seeded(hashSeed(runSeed, 'event-easy', chapter, nodeId))() * list.length);
  return { encounterId: `easy:${i}`, group: list[i] };
}
