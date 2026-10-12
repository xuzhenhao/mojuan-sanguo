/**
 * 按武将的策略 AI（issue #21）。策略画像从当前武将的技能配置推导（主将 + 副将 + 已生效珠联），
 * 不按武将 id 写死；通用部分（选目标、主动技时机、留军令、受伤换牌）都由画像开关控制。
 * 旧的贪心 AI 保留在 autoplay.ts（--ai greedy）。
 */
import type { Game } from '../core/battle';
import type { Source } from '../core/effects';
import { def, enemyIntent, isRed, isShaPlay } from '../core/rules';
import { CONFIG, type Ability } from '../data/config';
import type { CardInst, Enemy } from '../core/types';

const tags = (c: CardInst) => CONFIG.cards[c.id]?.tags ?? [];
const atoms = (c: CardInst) => (CONFIG.cards[c.id]?.abilities ?? []).flatMap((a) => a.do.map((x) => x.do));
const abAtoms = (a: Ability) => a.do.flatMap((x) => [x.do, ...((x.then ?? []) as { do: string }[]).map((y) => y.do)]);
const isDraw = (c: CardInst) => !def(c).slot && !def(c).tgt && !def(c).jiu && c.id !== 'SH01' && atoms(c).includes('draw') && !atoms(c).includes('armor');
const isDefCard = (c: CardInst) => !!(def(c).shan || def(c).tao || def(c).slot === 'armor');

/** 策略画像：全部由技能配置推导 */
export interface Profile {
  /** 手牌打空 / 打少有收益（连营 / 连营·辅 / 连营策）→ 故意打空 */
  emptyHand: boolean;
  /** 受伤摸牌（天策 / 奸雄 / 天妒 / 遗策）→ 血量健康时不出闪，换牌 */
  takeHits: boolean;
  /** 回合结束剩余军令收益（挟势）→ 留下的军令数 */
  reserveLing: number;
  /** 回合结束手牌少于体力时摸牌（月隐）→ 不急着用低价值牌 */
  endDrawIfShort: boolean;
}

export function profileOf(g: Game): Profile {
  const srcs = g.effects.playerSources().map((s) => s.ab);
  const has = (f: (a: Ability) => boolean) => srcs.some(f);
  return {
    // 打空摸牌（hand_empty → draw），或回合结束手牌少时补牌（turn_end + hand_count_at_most → draw，#23 后的连营）
    emptyHand: has(
      (a) =>
        abAtoms(a).includes('draw') &&
        (a.trigger.when === 'hand_empty' || (a.trigger.when === 'turn_end' && (a.if ?? []).some((c) => c.type === 'hand_count_at_most'))),
    ),
    takeHits: has((a) => a.trigger.when === 'damaged' && abAtoms(a).includes('draw')),
    reserveLing: Math.max(
      0,
      ...srcs
        .filter((a) => a.trigger.when === 'turn_end')
        .flatMap((a) => (a.if ?? []).filter((c) => c.type === 'ling_left_at_least').map((c) => Number(c.value))),
    ),
    endDrawIfShort: has((a) => a.trigger.when === 'turn_end' && (a.if ?? []).some((c) => c.type === 'hand_less_than_hp')),
  };
}

// ---------- 敌人威胁与目标 ----------
/** 本回合将对玩家造成的伤害（意图） */
export const incoming = (g: Game) => g.alive().reduce((s, e) => s + enemyIntent(e).dmg, 0);
/** 给友军加成的后排“使能者”：有友军技能以 has_back_row_ally 为条件 */
export function isEnabler(g: Game, e: Enemy) {
  return e.row === 'back' && g.alive().some((o) => o !== e && (o.abilities ?? []).some((a) => (a.if ?? []).some((c) => c.type === 'has_back_row_ally')));
}
/** 击杀优先级：可本次击杀 > 使能者 > 后排 > 本回合杀多 > 血少 */
export function priority(g: Game, e: Enemy, dmg = 1) {
  let s = 0;
  if (e.hp + e.armor <= dmg) s += 100;
  if (isEnabler(g, e)) s += 50;
  if (e.row === 'back') s += 8;
  s += enemyIntent(e).dmg * 10;
  s -= e.hp + e.armor;
  s -= e.marks * 8;
  return s;
}
export function bestTarget(g: Game, c: CardInst, dmg = 1): Enemy | null {
  const cands = g.alive().filter((e) => g.canTarget(e, c));
  if (!cands.length) return null;
  // 后排使能者（张宝在场时的弓手）> 可击杀 > 闪标记少 > 有效血量低
  const key = (e: Enemy) => [isEnabler(g, e) ? 0 : 1, e.hp + e.armor <= dmg && e.marks === 0 ? 0 : 1, e.marks, e.hp + e.armor];
  return cands.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  })[0];
}
/** 打不到的高优先级目标（后排使能者 / 后排） */
const unreachable = (g: Game) =>
  g
    .alive()
    .filter((e) => e.row === 'back' && !g.inRange(e))
    .sort((a, b) => priority(g, b) - priority(g, a))[0];

// ---------- 主动技分类（按原子推导） ----------
type Kind = 'redirect' | 'pre_sha' | 'discard_armor' | 'other';
function kindOf(s: Source): Kind {
  const as = abAtoms(s.ab);
  if (as.includes('redirect_sha')) return 'redirect';
  if (s.ab.do.some((a) => a.do === 'apply_status' && ['aogu', 'jiu', 'yiyong'].includes(a.status ?? ''))) return 'pre_sha';
  if (as.includes('discard') && as.includes('armor')) return 'discard_armor';
  return 'other';
}
const shaThreat = (e: Enemy) => e.pat[e.step % e.pat.length].filter((a) => a.startsWith('杀')).length;

async function useActives(g: Game, phase: 'start' | 'pre_sha' | 'end') {
  for (const s of g.effects.activeAbilities()) {
    const id = s.ab.id;
    if (!g.canActivate(id)) continue;
    const k = kindOf(s);
    if (phase === 'start' && k === 'redirect') {
      // 离间：本回合杀最多、且有友军可挨打的敌人
      if (g.alive().length < 2) continue;
      const t = g.alive().sort((a, b) => shaThreat(b) - shaThreat(a))[0];
      if (t && shaThreat(t) >= 1) await g.activate(id, undefined, t);
    } else if (phase === 'pre_sha' && k === 'pre_sha') {
      // 傲骨：弃一张非防御、非杀的红牌换伤害
      const from = s.ab.do.find((a) => a.do === 'discard')?.from;
      const c = g.hand.find((x) => (!from?.color || (from.color === 'red') === isRed(x)) && !isDefCard(x) && !def(x).sha && x.id !== 'X004');
      if (c) await g.activate(id, c);
    } else if (phase === 'start' && k === 'discard_armor') {
      // 挟令：出牌前、敌方本回合有伤害且手牌 ≥3 时，弃最差的牌换 2 甲（护甲被打穿 → 反击）
      if (incoming(g) >= 1 && g.hand.length >= 3) {
        const c = worst(g, true);
        if (c) await g.activate(id, c);
      }
    }
  }
}

function worst(g: Game, keepShan: boolean) {
  const v = (c: CardInst) => (def(c).tao ? 6 : def(c).shan ? (keepShan ? 5 : 2) : def(c).sha ? 3 : def(c).slot ? 1 : 2);
  return g.hand.slice().sort((a, b) => v(a) - v(b))[0];
}

type Plays = { attack: number; defense: number; other: number };

/** 按武将画像的出牌阶段 */
export async function heroAiTurn(g: Game, plays: Plays) {
  const pf = profileOf(g);
  await useActives(g, 'start');
  let healed = 0;
  for (let guard = 0; guard < 40 && !g.over; guard++) {
    const p = g.p;
    const ok = (c: CardInst) => g.hand.includes(c) && !g.checkPlay(c);
    const find = (f: (c: CardInst) => boolean) => g.hand.find((c) => f(c) && ok(c));
    const shas = () => g.hand.filter((c) => def(c).sha && ok(c) && g.alive().some((e) => g.canTarget(e, c)));
    // 留军令（挟势）：非关键牌不把军令花到 reserve 以下
    const afford = (c: CardInst) => p.ling - g.costOf(c) >= pf.reserveLing || g.costOf(c) === 0;
    const far = unreachable(g);
    // 数值策划建议 1（design-v1 8.4 AI2）：体力 ≤ ⌈上限/2⌉，或（体力 ≤ 上限−2 且手里没有杀）时才吃桃
    const hasSha = () => g.hand.some((x) => def(x).sha || g.canAsSha(x));
    // 有杀时每回合至多吃 1 次（避免把军令全花在回复上、陷入不出杀的僵局）
    const wantHeal = () => (healed === 0 || !hasSha()) && (p.hp <= Math.ceil(p.maxHp / 2) || (p.hp <= p.maxHp - 2 && !hasSha()));
    // 建议 2：有给友军加成的敌人（张宝）在场时，用义勇（无视距离）去打后排使能者
    const enabler = g.alive().find((e) => isEnabler(g, e) && !g.inRange(e));
    let c: CardInst | undefined;
    let tgt: Enemy | null = null;
    let red: CardInst | undefined;

    // 闪留给敌方回合响应（响应打空同样触发连营），其余牌整手可打且军令够 → 打空
    const rest = g.hand.filter((x) => !def(x).shan);
    const canEmpty = pf.emptyHand && rest.length > 0 && rest.every(ok) && rest.reduce((s2, x) => s2 + g.costOf(x), 0) <= p.ling;
    if (canEmpty) {
      // 连营：整手牌都能打出且军令够 → 从最便宜的打起，故意打空
      c = rest.sort((a, b) => g.costOf(a) - g.costOf(b))[0];
      if (g.needsTarget(c)) tgt = isShaPlay(c) ? bestTarget(g, c) : g.alive()[0];
    } else if ((c = find((x) => !!def(x).slot && !p.equip[def(x).slot!]))) {
      /* 装备 */
    } else if (wantHeal() && (c = find((x) => !!def(x).tao || (atoms(x).includes('heal') && !def(x).tgt)))) {
      /* 回复 */
    } else if (
      (c = find(
        (x) =>
          (x.id === 'T013' || isDraw(x)) &&
          (g.costOf(x) === 0 || (afford(x) && (!shas().length || (p.ling - g.costOf(x) >= shas().length && p.ling - g.costOf(x) >= 1)))),
      ))
    ) {
      if (def(c).tgt) tgt = g.alive()[0];
    } else if (far && (c = find((x) => def(x).tgt === 'any' && atoms(x).includes('damage') && !def(x).sha))) {
      tgt = far; // 无视距离的伤害牌先打后排
    } else if ((c = find((x) => tags(x).includes('delay')))) {
      tgt = g.alive().sort((a, b) => b.hp - a.hp)[0]; // 延时锦囊：血最厚（存活最久、出手最多）的敌人
    } else if (g.alive().length >= 2 && (c = find((x) => !!def(x).aoe))) {
      /* 群体 */
    } else if (enabler && !p.yiyong && shas().length && (c = find((x) => x.id === 'SH01' && p.ling - g.costOf(x) >= 1))) {
      /* 义勇打后排 */
    } else if (shas().length && p.ling >= 2 && !p.jiu && (c = find((x) => !!def(x).jiu || x.id === 'SH01'))) {
      /* 酒/义勇 先手 */
    } else if (shas().length) {
      await useActives(g, 'pre_sha');
      const all = shas();
      c = all.find((x) => x.id !== 'X004') ?? all[0];
      if (!c) continue;
      if (c.id === 'X004') red = g.hand.find((x) => x !== c && isRed(x));
      tgt = bestTarget(g, c, 1 + p.jiu + p.aogu + p.yiyong);
    } else if ((c = find((x) => x.id === 'T003' && g.alive().some((e) => e.armor > 0)))) {
      tgt = g.alive().sort((a, b) => b.armor - a.armor)[0];
    } else if ((c = find((x) => def(x).tgt === 'any' && atoms(x).includes('damage') && !def(x).sha && afford(x)))) {
      tgt = g.alive().sort((a, b) => priority(g, b) - priority(g, a))[0];
    } else if ((c = find((x) => !def(x).slot && !def(x).tgt && atoms(x).includes('armor') && afford(x)))) {
      /* 建议 3：剩余军令打护甲牌 */
    } else if (p.hp < p.maxHp && g.hand.length > g.handLimit() && (c = find((x) => !!def(x).tao))) {
      /* 桃：回合末会被弃掉时才吃（否则留给濒死） */
    } else if (pf.emptyHand && g.hand.every((x) => ok(x) || !def(x).shan)) {
      // 连营：剩余可打的牌全部打出，力求手牌打空（闪打不出时放弃）
      c = find((x) => !def(x).shan);
      if (c && g.needsTarget(c)) tgt = isShaPlay(c) ? bestTarget(g, c) : g.alive()[0];
    }
    if (!c) break;
    if (g.needsTarget(c) && !tgt) break;
    const d = def(c);
    if (isShaPlay(c) || d.jiu || c.id === 'SH01' || d.aoe || c.id === 'X004' || (d.tgt && atoms(c).includes('damage'))) plays.attack++;
    else if (isDefCard(c)) plays.defense++;
    else plays.other++;
    if (def(c).tao || (atoms(c).includes('heal') && !def(c).tgt)) healed++;
    await g.play(c, tgt, red);
  }
  if (!g.over) await useActives(g, 'end');
}

/** 闪响应：护甲足够吸收时不出闪；受伤摸牌的武将在血量健康、本回合摸牌次数未用完时吃伤换牌 */
export function heroRespond(g: Game, n: number, legal: (c: CardInst) => boolean): CardInst | null {
  const cands = g.hand.filter(legal);
  if (!cands.length) return null;
  const pf = profileOf(g);
  const p = g.p;
  const left = incoming(g); // 本敌方回合剩余意图的粗估
  if (!pf.emptyHand && p.armor >= n && !p.status.xieling) return null;
  if (pf.takeHits) {
    const hitDraw = g.effects.playerSources().some((s) => s.ab.trigger.when === 'damaged' && g.effects.remaining(s) > 0);
    const afterHp = p.hp - Math.max(0, n - p.armor);
    if (hitDraw && n === 1 && afterHp >= p.maxHp - 2 && afterHp - left > 2) return null;
  }
  return cands.find((c) => def(c).shan) ?? cands[0];
}

/**
 * 无懈可击决策点：敌方锦囊（当前只有妖咒：随机弃 1 张手牌）。
 * 手里只剩无懈本身时，被咒弃掉的也只会是它，打出没有收益 → 不出；否则打出。
 */
export function heroWuxie(g: Game, legal: (c: CardInst) => boolean): CardInst | null {
  const w = g.hand.find(legal);
  if (!w) return null;
  return g.hand.length <= 1 ? null : w;
}

/** 回合末弃牌：连营流优先留可打出的牌；其余按价值 */
export function heroDiscards(g: Game): CardInst[] {
  const n = g.discardNeeded();
  const v = (c: CardInst) => (def(c).shan ? 5 : def(c).tao ? 4 : def(c).sha ? 3 : 1);
  return [...g.hand].sort((a, b) => v(a) - v(b)).slice(0, n);
}
