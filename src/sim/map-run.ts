/**
 * 整章地图模式（docs/specs/sim-map-mode.md v0.1 最小版）：真实地图 + 真实组包 + 营地公式，
 * 奇遇/商店/宝箱按期望值折算；卡牌奖励折算成开场护甲 +k（k=0 版完全不计）。
 */
import { seeded } from '../core/rng';
import { reviveAllowed, reviveHp } from '../core/rules';
import { availableNodes, generateMap, getNode, hashSeed, moveTo, type NodeType } from '../core/run/map';
import { drawEncounter, newEncounterState } from '../core/run/encounters';
import { applyRestHeal } from '../core/run/rest';
import { MAP_CONFIG, poolsOf } from '../data/map';
import { BATTLES } from '../data/enemies';
import { CONFIG } from '../data/config';
import { quantile, resolveHeroes, runBattle, type HeroOpts } from './autoplay';
import { starterDeck } from '../data/cards';
import type { CardInst } from '../core/types';
import { addCard, newInventory } from '../game/economy/inventory';
import { rollCards } from '../game/economy/reward';
import { openShop } from '../game/economy/shop';
import { cardScore, isLoopCard, pickRewardCard, rewardCfg, type ShanCfg } from './loop-ai';

export interface RewardCoef {
  normal: number;
  elite: number;
  shopCard: number;
  smith: number;
  relic: number;
  cap: number;
}
export const K0: RewardCoef = { normal: 0, elite: 0, shopCard: 0, smith: 0, relic: 0, cap: 0 };
export const K_PLACEHOLDER: RewardCoef = { normal: 0.15, elite: 0.3, shopCard: 0.2, smith: 0.15, relic: 0.2, cap: 4 };

/** 主动选精英的体力比例下限（v0.1 为 0.7 时精英只走 0.37 次，见 #117） */
export const ELITE_MIN_HP = Number(process.env.SIM_ELITE_HP ?? 0.7);
const EVENTS = ['V01', 'V04', 'V05', 'V06', 'V09', 'V13', 'V14', 'V19'];
const GOLD = { normal: [15, 25], elite: [40, 55], chest: [50, 80] } as const;
const ri = (r: () => number, [a, b]: readonly [number, number]) => a + Math.floor(r() * (b - a + 1));
const PRI_LOW: NodeType[] = ['REST', 'EVENT', 'SHOP', 'CHEST', 'BATTLE', 'ELITE'];
const PRI: NodeType[][] = [['BATTLE', 'EVENT'], ['CHEST'], ['SHOP'], ['ELITE'], ['REST']];
/** 体力 ≥ ELITE_MIN_HP 时精英和普通战、奇遇同档（v0.1 精英排第 4 档只走 0.37 次，偏差 −47%） */
const PRI_HEALTHY: NodeType[][] = [['BATTLE', 'EVENT', 'ELITE'], ['CHEST'], ['SHOP'], ['REST']];

export interface MapRunResult {
  clear: boolean;
  clearNoRevive: boolean;
  revived: boolean;
  deathLayer: number | null;
  bossHp: number | null;
  goldBeforeBoss: number | null;
  nodes: Record<NodeType, number>;
  /** #241：主动出牌数（不含闪 / 响应）与玩家回合数，算平均每回合主动牌 */
  activePlays: number;
  turns: number;
  /** #241：结束时牌组里的循环牌张数 / 牌组张数 */
  loopInDeck: number;
  deckSize: number;
}

export interface MapRunOpts {
  /** 天命档（≥5 无复活，PRD 4.4 / subpages §2.1；与 core Game.canRevive 同一判断） */
  tianming?: number;
  /** #241：正式模拟卡牌奖励（战后三选一）与商店买卡（真实 economy 逻辑，按章节稀有度池） */
  rewards?: boolean;
  /** #241：选牌时不拿循环牌（对照组） */
  noLoop?: boolean;
  /** #241：留闪策略覆盖（默认 config sim.shan） */
  shan?: Partial<ShanCfg>;
  /** #241：出牌 AI 是否用循环牌逻辑（默认 true） */
  loopAi?: boolean;
  /** #241：开局额外塞入的牌（固定循环牌组对照 / 单卡注入实验；需 rewards 模式，走 inventory 牌组） */
  extraCards?: string[];
}

export async function runMap(seed: number, h0: HeroOpts, coef: RewardCoef, o: MapRunOpts = {}): Promise<MapRunResult> {
  const h = resolveHeroes(h0);
  const cfg = MAP_CONFIG;
  const pools = poolsOf(1);
  let map = generateMap(seed, 1, cfg);
  let enc = newEncounterState();
  const rPath = seeded(hashSeed(seed, 'sim-path'));
  const rEv = seeded(hashSeed(seed, 'sim-event'));
  const rRw = seeded(hashSeed(seed, 'sim-reward'));
  const evPool = [...EVENTS];
  // #241 卡牌奖励：独立随机流，开/关奖励时路径与战斗种子保持一致（成对比较）
  const rCard = seeded(hashSeed(seed, 'sim-cards'));
  const rcfg = rewardCfg();
  const mainId = h.main ?? CONFIG.rules.defaultHeroes.main;
  const deck0: CardInst[] = starterDeck(mainId, h.preset ? CONFIG.rules.presets?.[h.preset]?.deck : undefined).map(([id, suit, rank], i) => ({
    uid: 50000 + i,
    id,
    suit,
    rank,
    mods: [],
  }));
  const inv = newInventory({ deck: deck0, main: mainId, sub: h.sub ?? CONFIG.rules.defaultHeroes.sub, chapter: 1 });
  for (const x of o.extraCards ?? []) addCard(inv, x, 'H', 7);
  const ids = () => inv.deck.map((c) => c.id);
  let activePlays = 0;
  let turns = 0;
  const takeReward = (kind: 'normal' | 'elite') => {
    const offers = rollCards(rCard, inv, kind);
    const i = pickRewardCard(
      offers.map((x) => x.id),
      ids(),
      { noLoop: o.noLoop, cfg: rcfg },
    );
    if (i >= 0) addCard(inv, offers[i].id, offers[i].suit, offers[i].rank);
  };
  const shopCards = () => {
    inv.gold = gold;
    const st = openShop(rCard, inv);
    let bought = 0;
    const cands = st.cards
      .filter((it) => it.type === 'card' && !(o.noLoop && isLoopCard(it.id)))
      .map((it) => ({ it, v: cardScore(it.id, ids(), rcfg) }))
      .sort((a, b) => b.v - a.v);
    for (const { it, v } of cands) {
      if (bought >= rcfg.shopMaxCards || v <= rcfg.skipBelow) break;
      if (it.type !== 'card' || inv.gold - it.price < rcfg.shopBuyMinGold) continue;
      inv.gold -= it.price;
      addCard(inv, it.id, it.suit, it.rank);
      bought++;
    }
    gold = inv.gold;
  };
  const h0hp = CONFIG.heroes[h.main ?? CONFIG.rules.defaultHeroes.main]?.hp ?? 8;
  let hp: number | undefined;
  let maxHp: number | undefined;
  let gold = 60;
  let k = 0;
  let nextArmor = 0;
  const rvCount = CONFIG.rules.revive.count;
  let revive = reviveAllowed(rvCount, o.tianming ?? 0) ? rvCount : 0;
  let revived = false;
  let bossHp: number | null = null;
  let goldBeforeBoss: number | null = null;
  const nodes: Record<NodeType, number> = { BATTLE: 0, ELITE: 0, EVENT: 0, REST: 0, SHOP: 0, CHEST: 0, BOSS: 0 };
  let fights = 0;
  const addK = (x: number, layer: number) => {
    void layer;
    k = Math.min(coef.cap, k + x);
  };
  // 累计不分层，开场护甲第 4 层起生效（见 fight）
  const fight = async (enemies: { name: string; enemies: string[] }, layer: number, boss: boolean) => {
    const armor = (layer >= 4 ? Math.floor(k) : 0) + nextArmor;
    nextArmor = 0;
    const base = {
      ...h,
      battleIdx: boss ? BATTLES.length - 1 : 0,
      encounter: { name: enemies.name, en: enemies.enemies },
      maxHp,
      deck: o.rewards || o.extraCards?.length ? inv.deck : undefined,
      shan: o.shan,
      loopAi: o.loopAi,
    };
    let r = await runBattle({ ...base, seed: hashSeed(seed, 'sim-battle', fights++), hp, armorStart: armor });
    if (!r.win && reviveAllowed(revive, o.tianming ?? 0)) {
      // 复活（4.4.1）：近似为同一场重开，体力 max(hpMin, ceil(上限×hpRatio))，+armor 甲（rules.revive）
      const rv = CONFIG.rules.revive;
      revive--;
      revived = true;
      const rhp = reviveHp(r.maxHp, rv);
      activePlays += r.plays.attack + r.plays.defense + r.plays.other;
      turns += r.turns;
      r = await runBattle({ ...base, seed: hashSeed(seed, 'sim-battle', fights++), hp: rhp, armorStart: armor + rv.armor });
    }
    activePlays += r.plays.attack + r.plays.defense + r.plays.other;
    turns += r.turns;
    hp = r.hpEnd;
    maxHp = r.maxHp;
    return r.win;
  };
  const cur = () => ({ hp: hp ?? h0hp, max: maxHp ?? h0hp });
  const heal = (n: number) => {
    const c = cur();
    hp = Math.min(c.max, c.hp + n);
  };
  let layer = 0;
  while (map.current !== 'BOSS') {
    const avail = availableNodes(map).map((id) => getNode(map, id)!);
    let pick = avail[0];
    if (avail[0].type !== 'BOSS') {
      const c = cur();
      const low = c.hp / c.max <= 0.4;
      const ok = avail.filter((n) => n.type !== 'ELITE' || c.hp / c.max >= ELITE_MIN_HP || avail.every((m) => m.type === 'ELITE'));
      const tiers = low ? PRI_LOW.map((t) => [t]) : c.hp / c.max >= ELITE_MIN_HP ? PRI_HEALTHY : PRI;
      for (const t of tiers) {
        const cs = ok.filter((n) => t.includes(n.type));
        if (cs.length) {
          pick = cs[Math.floor(rPath() * cs.length)];
          break;
        }
      }
    }
    map = moveTo(map, pick.id);
    layer = pick.layer;
    nodes[pick.type]++;
    const c = cur();
    switch (pick.type) {
      case 'BATTLE':
      case 'ELITE': {
        const d = drawEncounter(seed, 1, pick.type, enc, pools);
        enc = d.state;
        if (!(await fight(d.group, layer, false))) return done(false);
        const el = pick.type === 'ELITE';
        gold += ri(rRw, el ? GOLD.elite : GOLD.normal);
        if (o.rewards) takeReward(el ? 'elite' : 'normal');
        else addK(el ? coef.elite : coef.normal, layer);
        break;
      }
      case 'BOSS': {
        bossHp = c.hp;
        goldBeforeBoss = gold;
        const d = drawEncounter(seed, 1, 'BOSS', enc, pools);
        if (!(await fight(d.group, 9, true))) return done(false);
        break;
      }
      case 'REST':
        if (c.hp >= c.max) addK(coef.smith, layer);
        else hp = applyRestHeal(c.hp, c.max, cfg.rest).hp;
        break;
      case 'SHOP':
        if (o.rewards) shopCards();
        else if (gold >= 60) {
          gold -= 60;
          addK(coef.shopCard, layer);
        }
        break;
      case 'CHEST':
        if (rRw() < 0.5) gold += ri(rRw, GOLD.chest);
        else addK(coef.relic, layer);
        break;
      case 'EVENT': {
        if (!evPool.length) {
          const d = drawEncounter(seed, 1, 'BATTLE', { ...enc, normalFought: 0 }, pools);
          enc = { ...d.state, normalFought: enc.normalFought };
          if (!(await fight(d.group, layer, false))) return done(false);
          break;
        }
        const ev = evPool.splice(Math.floor(rEv() * evPool.length), 1)[0];
        const miss = c.max - c.hp;
        if (ev === 'V01') {
          if (miss > 0) heal(2);
          else addK(0.1, layer);
        } else if (ev === 'V04') {
          if (gold >= 90) gold += rEv() < 0.5 ? 40 : -30;
        } else if (ev === 'V05') {
          if (gold >= 75) {
            gold -= 75;
            addK(0.3, layer);
          }
        } else if (ev === 'V06') {
          if (rEv() < 0.5) heal(2);
          else {
            hp = Math.max(1, c.hp - 1);
            addK(0.15, layer);
          }
        } else if (ev === 'V09') {
          if (c.hp / c.max <= 0.5) {
            maxHp = c.max - 1;
            hp = c.max - 1;
          } else if (gold >= 40) {
            gold -= 40;
            heal(3);
          }
        } else if (ev === 'V13') {
          if (c.hp / c.max >= 0.6) {
            const d = drawEncounter(seed, 1, 'BATTLE', { ...enc, normalFought: 0 }, pools);
            enc = { ...d.state, normalFought: enc.normalFought };
            if (!(await fight(d.group, layer, false))) return done(false);
            gold += 2 * ri(rRw, GOLD.normal);
          } else nextArmor += 3;
        } else if (ev === 'V14') {
          if (h.main === 'H02' || h.sub === 'H02') addK(0.2, layer);
          else gold += 40;
        } else if (ev === 'V19') {
          if (gold >= 60 && miss >= 3) {
            gold -= 60;
            hp = c.max;
          } else heal(2);
        }
        break;
      }
    }
  }
  return done(true);
  function done(clear: boolean): MapRunResult {
    return {
      clear,
      clearNoRevive: clear && !revived,
      revived,
      deathLayer: clear ? null : map.current === 'BOSS' ? 9 : layer,
      bossHp,
      goldBeforeBoss,
      nodes,
      activePlays,
      turns,
      loopInDeck: inv.deck.filter((c) => isLoopCard(c.id)).length,
      deckSize: inv.deck.length,
    };
  }
}

export const PAIRS: [string, string][] = [
  ['H01', 'H02'],
  ['H02', 'H01'],
  ['H03', 'H04'],
  ['H04', 'H03'],
  ['H05', 'H06'],
  ['H06', 'H05'],
  ['H07', 'H08'],
  ['H08', 'H07'],
];

export async function mapBatch(n: number, seed: number, h: HeroOpts, coef: RewardCoef, o: MapRunOpts = {}) {
  const rs: MapRunResult[] = [];
  for (let i = 0; i < n; i++) rs.push(await runMap(seed * 1000 + i, h, coef, o));
  const avg = (f: (r: MapRunResult) => number) => rs.reduce((a, r) => a + f(r), 0) / n;
  const nodes = {} as Record<NodeType, number>;
  for (const t of Object.keys(rs[0].nodes) as NodeType[]) nodes[t] = avg((r) => r.nodes[t]);
  const deaths: Record<string, number> = {};
  for (const r of rs) if (r.deathLayer !== null) deaths[r.deathLayer] = (deaths[r.deathLayer] ?? 0) + 1;
  const num = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
  return {
    n,
    clear: avg((r) => +r.clear),
    clearNoRevive: avg((r) => +r.clearNoRevive),
    bossHpMedian: quantile(num(rs.map((r) => r.bossHp)), 0.5),
    goldMedian: quantile(num(rs.map((r) => r.goldBeforeBoss)), 0.5),
    /** #241 平均每回合主动牌（总主动牌 / 总回合） */
    playsPerTurn: rs.reduce((a, r) => a + r.activePlays, 0) / (rs.reduce((a, r) => a + r.turns, 0) || 1),
    loopInDeck: avg((r) => r.loopInDeck),
    deckSize: avg((r) => r.deckSize),
    nodes,
    deaths,
  };
}
