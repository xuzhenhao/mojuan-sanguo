/**
 * 整章地图模式（docs/specs/sim-map-mode.md v0.1；O35 复测 / PRD §14.4 整章 65–80%）。
 * 不另写地图逻辑：generateMap / availableNodes / moveTo（core/run/map）、drawEncounter（ch1.yaml pools）、
 * applyRestHeal（core/run/rest，rules.map.rest）。回复读 rules.map.betweenBattleHeal（=0）。
 * 随机流：hashSeed(seed, 'sim-path' | 'sim-event' | 'sim-reward' | 'sim-battle', …) 分开。
 * 文档未写明、由实现补的口径见 ASSUMPTIONS。
 */
import { CONFIG } from '../data/config';
import { MAP_CONFIG, poolsOf } from '../data/map';
import { BATTLES } from '../data/enemies';
import { seeded } from '../core/rng';
import { availableNodes, generateMap, getNode, hashSeed, moveTo, type MapState, type NodeType } from '../core/run/map';
import { drawEncounter, newEncounterState, type EncounterGroup, type PoolName } from '../core/run/encounters';
import { applyRestHeal } from '../core/run/rest';
import { runBattle, type HeroOpts } from './autoplay';

export const ASSUMPTIONS = [
  '复活：core 不支持战斗中复活，sim 在战败后用同一组合重开该战，体力 max(2, ceil(maxHp×25%))、开场 +3 护甲（PRD 4.4/16.2）',
  '开场护甲加成 k 为小数：按期望值随机取整（如 0.6 → 60% 概率 +1），封顶 4，只在第 4 层起的战斗生效；V13 收编的 +3 甲另加，总量同样封顶 4',
  '商店：铜钱 ≥ 60 买 1 张 R 卡（+0.2），之后铜钱 ≥ 删牌价（50 起 +25）删 1 张（不加护甲，只记次数）；价格不做 ±10% 浮动',
  '宝箱：75% 宝物（+0.2），25% 铜钱 50–80（PRD 10.8）',
  '战斗铜钱：普通 15–25、精英 40–55（PRD 14.1）；V13 剿灭 ×2；V13 剿灭/池空降级的 easy 战胜利按普通战计 +0.15',
  'V06 签筒判定红色概率 50%（开局牌组红色比例 starterRedRatio）',
  '节点次数对照只统计走到 Boss 的局（完整路线）',
  '营地满血改淬炼：+0.15（rest-v05 §3 淬炼不建模具体词条）',
];

/** 第 5 节系数；k0 = 全 0（铜钱照常记账） */
export interface RewardCoef {
  battle: number;
  elite: number;
  shopCard: number;
  temper: number;
  treasure: number;
  peach: number;
  eCard: number;
  rCard: number;
  heroCard: number;
}
export const COEF_SPEC: RewardCoef = {
  battle: 0.15,
  elite: 0.3,
  shopCard: 0.2,
  temper: 0.15,
  treasure: 0.2,
  peach: 0.1,
  eCard: 0.3,
  rCard: 0.15,
  heroCard: 0.2,
};
export const COEF_ZERO: RewardCoef = { battle: 0, elite: 0, shopCard: 0, temper: 0, treasure: 0, peach: 0, eCard: 0, rCard: 0, heroCard: 0 };
export const ARMOR_CAP = 4;
export const ARMOR_FROM_LAYER = 4;
/** PRD §10.4 每局期望（营地 = 0.28 + 第 8 层 1） */
export const EXPECTED_NODES: Partial<Record<NodeType, number>> = { BATTLE: 3.6, ELITE: 0.7, EVENT: 1.2, SHOP: 0.76, CHEST: 0.48, REST: 1.28 };
/** PRD §14.4 v2 固定搭配 */
export const ALL_HEROES: [string, string][] = [
  ['H01', 'H02'],
  ['H02', 'H01'],
  ['H03', 'H04'],
  ['H04', 'H03'],
  ['H05', 'H06'],
  ['H06', 'H05'],
  ['H07', 'H08'],
  ['H08', 'H07'],
];
const EVENTS = ['V01', 'V04', 'V05', 'V06', 'V09', 'V13', 'V14', 'V19'] as const;

export interface MapRunOpts extends HeroOpts {
  coef?: RewardCoef;
  maxTurns?: number;
}
export interface MapRunResult {
  clear: boolean;
  clearNoRevive: boolean;
  revived: boolean;
  /** 死在第几层（Boss = layers+1；通关为 null） */
  diedLayer: number | null;
  path: NodeType[];
  nodes: Record<NodeType, number>;
  bossHpStart: number | null;
  goldBeforeBoss: number | null;
  spend: { card: number; remove: number; event: number };
  fights: { pool: PoolName; name: string; layer: number; win: boolean; hpStart: number; hpEnd: number; armor: number }[];
  bonus: number;
  timeouts: number;
}

const LOW: NodeType[] = ['REST', 'EVENT', 'SHOP', 'CHEST', 'BATTLE', 'ELITE'];

/** §3 路线选择：返回同一优先级的候选，再等概率取一 */
export function routeRank(t: NodeType, hp: number, maxHp: number): number {
  if (t === 'BOSS') return 0;
  const r = hp / maxHp;
  if (r <= 0.4) return LOW.indexOf(t);
  if (t === 'ELITE' && r < 0.7) return 99; // 精英只在 ≥70% 主动选
  return { BATTLE: 0, EVENT: 0, CHEST: 1, SHOP: 2, ELITE: 3, REST: 4 }[t as Exclude<NodeType, 'BOSS'>];
}
export function pickNext(s: MapState, hp: number, maxHp: number, rng: () => number): string {
  const ids = availableNodes(s);
  const rank = (id: string) => routeRank(getNode(s, id)!.type, hp, maxHp);
  const best = Math.min(...ids.map(rank));
  const tied = ids.filter((id) => rank(id) === best);
  return tied[Math.floor(rng() * tied.length)];
}

/** 小数按期望随机取整 */
export const stochRound = (x: number, rng: () => number) => Math.floor(x) + (rng() < x - Math.floor(x) ? 1 : 0);
const between = (rng: () => number, a: number, b: number) => a + Math.floor(rng() * (b - a + 1));

export async function runMapChapter(seed: number, o: MapRunOpts): Promise<MapRunResult> {
  const coef = o.coef ?? COEF_ZERO;
  const chapter = 1;
  const pools = poolsOf(chapter);
  const pathRng = seeded(hashSeed(seed, 'sim-path', chapter));
  const evRng = seeded(hashSeed(seed, 'sim-event', chapter));
  const rwRng = seeded(hashSeed(seed, 'sim-reward', chapter));
  let map = generateMap(seed, chapter, MAP_CONFIG);
  let enc = newEncounterState();
  const maxHp0 = (CONFIG.heroes[o.main!] as { hp?: number } | undefined)?.hp ?? 8;
  let hp: number = maxHp0;
  let maxHp: number = maxHp0;
  let gold = 60;
  let bonus = 0;
  let nextArmor = 0;
  let reviveLeft = 1;
  let removes = 0;
  let fightNo = 0;
  const evPool: string[] = [...EVENTS];
  const nodes = { BATTLE: 0, ELITE: 0, EVENT: 0, REST: 0, SHOP: 0, CHEST: 0, BOSS: 0 } as Record<NodeType, number>;
  const res: MapRunResult = {
    clear: false,
    clearNoRevive: false,
    revived: false,
    diedLayer: null,
    path: [],
    nodes,
    bossHpStart: null,
    goldBeforeBoss: null,
    spend: { card: 0, remove: 0, event: 0 },
    fights: [],
    bonus: 0,
    timeouts: 0,
  };

  /** 打一场；返回是否活着（含复活） */
  const fight = async (group: EncounterGroup, pool: PoolName, layer: number): Promise<boolean> => {
    let armor = Math.min(ARMOR_CAP, (layer >= ARMOR_FROM_LAYER ? stochRound(Math.min(ARMOR_CAP, bonus), rwRng) : 0) + nextArmor);
    nextArmor = 0;
    let startHp = hp;
    for (;;) {
      const r = await runBattle({
        ...o,
        battleIdx: 0,
        seed: hashSeed(seed, 'sim-battle', fightNo++),
        hp: startHp,
        startArmor: armor,
        maxTurns: o.maxTurns,
        encounter: { name: group.name, en: group.enemies },
      });
      maxHp = r.maxHp;
      if (r.timeout) res.timeouts++;
      res.fights.push({ pool, name: group.name, layer, win: r.win, hpStart: r.hpStart, hpEnd: r.hpEnd, armor });
      if (r.win) {
        hp = Math.min(maxHp, r.hpEnd + (MAP_CONFIG.betweenBattleHeal ?? 0));
        return true;
      }
      if (reviveLeft <= 0) return false;
      reviveLeft--;
      res.revived = true;
      startHp = Math.max(2, Math.ceil(maxHp * 0.25));
      armor = 3;
    }
  };
  /** 独立 easy 抽取（V13 剿灭 / 事件池空）：不占前 2 场 easy、不参与防重复 */
  const easyGroup = () => drawEncounter(hashSeed(seed, 'sim-event-battle', fightNo), chapter, 'BATTLE', newEncounterState(), pools).group;
  const winNormal = (mult = 1) => {
    gold += between(rwRng, 15, 25) * mult;
    bonus += coef.battle;
  };

  for (;;) {
    const id = pickNext(map, hp, maxHp, pathRng);
    map = moveTo(map, id);
    const node = getNode(map, id)!;
    const L = node.layer;
    nodes[node.type]++;
    res.path.push(node.type);
    switch (node.type) {
      case 'BATTLE':
      case 'ELITE':
      case 'BOSS': {
        if (node.type === 'BOSS') {
          res.bossHpStart = hp;
          res.goldBeforeBoss = gold;
        }
        const d = drawEncounter(seed, chapter, node.type, enc, pools);
        enc = d.state;
        if (!(await fight(d.group, d.pool, L))) {
          res.diedLayer = L;
          res.bonus = bonus;
          return res;
        }
        if (node.type === 'BOSS') {
          res.clear = true;
          res.clearNoRevive = !res.revived;
          res.bonus = bonus;
          return res;
        }
        if (node.type === 'ELITE') {
          gold += between(rwRng, 40, 55);
          bonus += coef.elite;
        } else winNormal();
        break;
      }
      case 'REST':
        if (hp < maxHp) hp = applyRestHeal(hp, maxHp, MAP_CONFIG.rest).hp;
        else bonus += coef.temper;
        break;
      case 'SHOP':
        if (gold >= 60) {
          gold -= 60;
          bonus += coef.shopCard;
          res.spend.card++;
        }
        if (gold >= 50 + 25 * removes) {
          gold -= 50 + 25 * removes;
          removes++;
          res.spend.remove++;
        }
        break;
      case 'CHEST':
        if (rwRng() < 0.75) bonus += coef.treasure;
        else gold += between(rwRng, 50, 80);
        break;
      case 'EVENT': {
        if (!evPool.length) {
          if (!(await fight(easyGroup(), 'easy', L))) {
            res.diedLayer = L;
            res.bonus = bonus;
            return res;
          }
          winNormal();
          break;
        }
        const ev = evPool.splice(Math.floor(evRng() * evPool.length), 1)[0];
        const r = hp / maxHp;
        if (ev === 'V01') {
          if (hp < maxHp) hp = Math.min(maxHp, hp + 2);
          else bonus += coef.peach;
        } else if (ev === 'V04') {
          if (gold >= 90) {
            gold -= 30;
            res.spend.event++;
            if (evRng() < 0.5) gold += 70;
          }
        } else if (ev === 'V05') {
          if (gold >= 75) {
            gold -= 75;
            res.spend.event++;
            bonus += coef.eCard;
          }
        } else if (ev === 'V06') {
          if (evRng() < 0.5) hp = Math.min(maxHp, hp + 2);
          else {
            hp = Math.max(1, hp - 1);
            bonus += coef.rCard;
          }
        } else if (ev === 'V09') {
          if (r <= 0.5) {
            maxHp -= 1;
            hp = maxHp;
          } else if (gold >= 40) {
            gold -= 40;
            res.spend.event++;
            hp = Math.min(maxHp, hp + 3);
          }
        } else if (ev === 'V13') {
          if (r >= 0.6) {
            if (!(await fight(easyGroup(), 'easy', L))) {
              res.diedLayer = L;
              res.bonus = bonus;
              return res;
            }
            winNormal(2);
          } else nextArmor = 3;
        } else if (ev === 'V14') {
          if (o.main === 'H02' || o.sub === 'H02') bonus += coef.heroCard;
          else gold += 40;
        } else if (ev === 'V19') {
          if (gold >= 60 && maxHp - hp >= 3) {
            gold -= 60;
            res.spend.event++;
            hp = maxHp;
          } else hp = Math.min(maxHp, hp + 2);
        }
        break;
      }
    }
  }
}

const med = (xs: number[]) => {
  const a = xs.slice().sort((x, y) => x - y);
  return a.length ? a[Math.floor((a.length - 1) / 2)] : 0;
};

export interface MapBatchRow {
  main: string;
  sub: string;
  n: number;
  clearRate: number;
  clearNoReviveRate: number;
  bossHpStartMedian: number;
  goldBeforeBossMedian: number;
  nodes: Record<NodeType, number>;
  diedLayer: Record<number, number>;
  spend: { card: number; remove: number; event: number };
  timeouts: number;
}

/** 第 k 局 runSeed = hashSeed(seed, 'sim-run', k)：同一 --seed 完全复现 */
export async function mapBatch(n: number, seed: number, o: MapRunOpts): Promise<MapBatchRow> {
  const rs: MapRunResult[] = [];
  for (let k = 0; k < n; k++) rs.push(await runMapChapter(hashSeed(seed, 'sim-run', k), o));
  const full = rs.filter((r) => r.bossHpStart !== null);
  const nodes = { BATTLE: 0, ELITE: 0, EVENT: 0, REST: 0, SHOP: 0, CHEST: 0, BOSS: 0 } as Record<NodeType, number>;
  for (const r of full) for (const t of Object.keys(nodes) as NodeType[]) nodes[t] += r.nodes[t] / full.length;
  const diedLayer: Record<number, number> = {};
  for (const r of rs) if (r.diedLayer !== null) diedLayer[r.diedLayer] = (diedLayer[r.diedLayer] ?? 0) + 1;
  const spend = { card: 0, remove: 0, event: 0 };
  for (const r of rs) for (const k of ['card', 'remove', 'event'] as const) spend[k] += r.spend[k] / n;
  return {
    main: o.main!,
    sub: o.sub!,
    n,
    clearRate: rs.filter((r) => r.clear).length / n,
    clearNoReviveRate: rs.filter((r) => r.clearNoRevive).length / n,
    bossHpStartMedian: med(full.map((r) => r.bossHpStart!)),
    goldBeforeBossMedian: med(full.map((r) => r.goldBeforeBoss!)),
    nodes,
    diedLayer,
    spend,
    timeouts: rs.reduce((x, r) => x + r.timeouts, 0),
  };
}

/** 三战制、战间回复 0 的基线（验收第 3 条对照，文档给出种子 777 = 67.6%） */
export async function threeBattleBaseline(n: number, seed: number, o: HeroOpts) {
  let clear = 0;
  for (let k = 0; k < n; k++) {
    let hp: number | undefined;
    let ok = true;
    for (let i = 0; i < BATTLES.length && ok; i++) {
      const r = await runBattle({ ...o, battleIdx: i, seed: hashSeed(seed, 'sim-3b', k, i), hp });
      ok = r.win;
      hp = r.hpEnd;
    }
    if (ok) clear++;
  }
  return clear / n;
}

const pct = (x: number) => (x * 100).toFixed(1) + '%';
const TYPES: NodeType[] = ['BATTLE', 'ELITE', 'EVENT', 'SHOP', 'CHEST', 'REST'];
const CN: Record<string, string> = { BATTLE: '普通战', ELITE: '精英', EVENT: '奇遇', SHOP: '商店', CHEST: '宝箱', REST: '营地' };

export function mapReport(title: string, rows: MapBatchRow[]) {
  const name = (id: string) => CONFIG.heroes[id]?.name ?? id;
  const mean = rows.reduce((x, r) => x + r.clearRate, 0) / rows.length;
  const out = [
    `### ${title}`,
    '',
    `8 将均值 ${pct(mean)}（目标 65–80%，各将在均值 ±10% 内；超出加粗）`,
    '',
    '| 主将+副将 | 通关率（含复活） | 不含复活 | 相对均值 | Boss 入场体力中位 | 到 Boss 前铜钱中位 | 买卡/删牌/事件花费（每局） | 死亡层分布 | 超时 |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const dev = r.clearRate - mean;
    const d = Object.entries(r.diedLayer)
      .map(([l, c]) => `L${l}:${c}`)
      .join(' ');
    const devS = `${dev >= 0 ? '+' : ''}${(dev * 100).toFixed(1)}pp`;
    out.push(
      `| ${name(r.main)}+${name(r.sub)} | ${pct(r.clearRate)} | ${pct(r.clearNoReviveRate)} | ${Math.abs(dev) > 0.1 ? `**${devS}**` : devS} | ${r.bossHpStartMedian} | ${r.goldBeforeBossMedian} | ${r.spend.card.toFixed(2)}/${r.spend.remove.toFixed(2)}/${r.spend.event.toFixed(2)} | ${d} | ${r.timeouts} |`,
    );
  }
  out.push(
    '',
    '节点次数（走到 Boss 的局，平均；偏差 >±30% 标 ⚠）',
    '',
    `| 主将 | ${TYPES.map((t) => CN[t]).join(' | ')} |`,
    `|---|${TYPES.map(() => '---').join('|')}|`,
  );
  out.push(`| PRD §10.4 期望 | ${TYPES.map((t) => EXPECTED_NODES[t]).join(' | ')} |`);
  for (const r of rows) out.push(`| ${name(r.main)} | ${TYPES.map((t) => nodeCell(r.nodes[t], EXPECTED_NODES[t]!)).join(' | ')} |`);
  return out.join('\n');
}
export const nodeDeviation = (actual: number, expected: number) => (actual - expected) / expected;
const nodeCell = (a: number, e: number) => `${a.toFixed(2)}${Math.abs(nodeDeviation(a, e)) > 0.3 ? ' ⚠' : ''}`;
