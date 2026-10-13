/**
 * 整章地图模式模拟（O35 复测 / 整章 65–80% 通关率目标）。
 * 口径：docs/specs/sim-map-mode.md 尚未入库，暂按以下假设（见 PR 描述，文档出来后对齐）：
 * - 地图：复用 src/core/run/map.ts generateMap + availableNodes/moveTo（rules.yaml map），不另写地图逻辑。
 * - 战斗：复用 src/core/run/encounters.ts drawEncounter（ch1.yaml pools/rules），体力继承，
 *   战后回复读 rules.map.betweenBattleHeal（H5 = 0）。
 * - 营地：只做疗伤（docs/specs/rest-v05.md §2，applyRestHeal + rules.map.rest；无遗物，relicBonus=0）。
 *   淬炼/焚稿改变牌组，sim 每战用起始牌组，暂不建模。
 * - 奇遇：按期望值折算为固定回血 eventHeal（默认 1：8 事件中 V01/V19 +2、V06 期望 +0.5、V09 抓药 +3，
 *   ≈ 7.5/8 ≈ 0.94，取整 1）；不触发 V13 战斗。
 * - 集市/宝箱/战斗奖励：期望值折算为 0 体力（不建模加牌、丹药、遗物）。
 * - 选路：random = 可走节点等概率；safe = 低血优先营地/奇遇、避开精英（见 pickNext）。
 */
import { CONFIG } from '../data/config';
import { MAP_CONFIG, poolsOf } from '../data/map';
import { seeded } from '../core/rng';
import { availableNodes, generateMap, getNode, hashSeed, moveTo, type MapState, type NodeType } from '../core/run/map';
import { drawEncounter, newEncounterState, type PoolName } from '../core/run/encounters';
import { applyRestHeal } from '../core/run/rest';
import { pickSub, runBattle, type HeroOpts } from './autoplay';

export type RoutePolicy = 'random' | 'safe';
export interface MapRunOpts extends HeroOpts {
  route?: RoutePolicy;
  eventHeal?: number;
  maxTurns?: number;
}
export interface MapRunResult {
  clear: boolean;
  /** 死在哪类节点（通关为 null） */
  diedAt: PoolName | null;
  /** 打过的战斗：池 + 组合名 + 胜负 + 开场/结束体力 */
  fights: { pool: PoolName; name: string; win: boolean; hpStart: number; hpEnd: number }[];
  path: NodeType[];
  restHealed: number;
  eventHealed: number;
  bossHpStart: number | null;
  timeouts: number;
}

const SAFE_PREF_LOW: NodeType[] = ['REST', 'EVENT', 'SHOP', 'CHEST', 'BATTLE', 'ELITE', 'BOSS'];
const SAFE_PREF_HIGH: NodeType[] = ['BATTLE', 'EVENT', 'CHEST', 'SHOP', 'REST', 'ELITE', 'BOSS'];

/** 选下一个节点（确定性：rng 来自 runSeed） */
export function pickNext(s: MapState, hp: number, maxHp: number, policy: RoutePolicy, rng: () => number): string {
  const ids = availableNodes(s);
  if (policy === 'random' || ids.length === 1) return ids[Math.floor(rng() * ids.length)];
  const ratio = hp / maxHp;
  const pref = ratio < 0.5 ? SAFE_PREF_LOW : SAFE_PREF_HIGH;
  // 精英：体力 ≥70% 才考虑优先（与普通战同档）
  const rank = (t: NodeType) => (t === 'ELITE' && ratio >= 0.7 ? pref.indexOf('BATTLE') + 0.5 : pref.indexOf(t));
  const best = Math.min(...ids.map((id) => rank(getNode(s, id)!.type)));
  const tied = ids.filter((id) => rank(getNode(s, id)!.type) === best);
  return tied[Math.floor(rng() * tied.length)];
}

export async function runMapChapter(runSeed: number, o: MapRunOpts = {}): Promise<MapRunResult> {
  const h: HeroOpts = o.preset || !o.main || o.sub ? o : { ...o, sub: pickSub(o.main) };
  const route = o.route ?? 'random';
  const eventHeal = o.eventHeal ?? 1;
  const chapter = 1;
  const pools = poolsOf(chapter);
  const rng = seeded(hashSeed(runSeed, 'sim-route', chapter));
  let map = generateMap(runSeed, chapter, MAP_CONFIG);
  let enc = newEncounterState();
  let hp: number | undefined;
  let maxHp = 0;
  const res: MapRunResult = { clear: false, diedAt: null, fights: [], path: [], restHealed: 0, eventHealed: 0, bossHpStart: null, timeouts: 0 };
  let i = 0;
  for (;;) {
    // 第一战前尚未读到 maxHp：按满血选路（第 1 层固定为 BATTLE，不影响结果）
    const id = pickNext(map, hp ?? 1, maxHp || 1, route, rng);
    map = moveTo(map, id);
    const node = getNode(map, id)!;
    res.path.push(node.type);
    if (node.type === 'BATTLE' || node.type === 'ELITE' || node.type === 'BOSS') {
      const d = drawEncounter(runSeed, chapter, node.type, enc, pools);
      enc = d.state;
      const r = await runBattle({
        ...h,
        battleIdx: 0,
        seed: hashSeed(runSeed, 'sim-battle', i++),
        hp,
        maxTurns: o.maxTurns,
        encounter: { name: d.group.name, en: d.group.enemies },
      });
      maxHp = r.maxHp;
      if (r.timeout) res.timeouts++;
      if (node.type === 'BOSS') res.bossHpStart = r.hpStart;
      res.fights.push({ pool: d.pool, name: d.group.name, win: r.win, hpStart: r.hpStart, hpEnd: r.hpEnd });
      if (!r.win) {
        res.diedAt = d.pool;
        return res;
      }
      if (node.type === 'BOSS') {
        res.clear = true;
        return res;
      }
      hp = Math.min(r.maxHp, r.hpEnd + (MAP_CONFIG.betweenBattleHeal ?? 0));
    } else if (hp !== undefined && node.type === 'REST') {
      const r = applyRestHeal(hp, maxHp, MAP_CONFIG.rest);
      res.restHealed += r.healed;
      hp = r.hp;
    } else if (hp !== undefined && node.type === 'EVENT') {
      const next = Math.min(maxHp, hp + eventHeal);
      res.eventHealed += next - hp;
      hp = next;
    }
  }
}

export interface MapBatchRow {
  main: string;
  sub: string;
  n: number;
  clearRate: number;
  diedAt: Record<PoolName, number>;
  bossReachRate: number;
  bossWinRate: number;
  bossHpStartMedian: number;
  fightsMedian: number;
  timeouts: number;
  poolWin: Record<PoolName, { n: number; win: number }>;
}

const med = (xs: number[]) => {
  const a = xs.slice().sort((x, y) => x - y);
  return a.length ? a[Math.floor((a.length - 1) / 2)] : 0;
};

export async function mapBatch(n: number, seed: number, o: MapRunOpts = {}): Promise<MapBatchRow> {
  const main = o.main ?? CONFIG.rules.defaultHeroes.main;
  const sub = o.sub ?? (o.main ? pickSub(o.main) : CONFIG.rules.defaultHeroes.sub);
  const rs: MapRunResult[] = [];
  for (let k = 0; k < n; k++) rs.push(await runMapChapter((seed + k * 7919) >>> 0, { ...o, main, sub }));
  const diedAt = { easy: 0, normal: 0, elite: 0, boss: 0 } as Record<PoolName, number>;
  const poolWin = { easy: { n: 0, win: 0 }, normal: { n: 0, win: 0 }, elite: { n: 0, win: 0 }, boss: { n: 0, win: 0 } } as MapBatchRow['poolWin'];
  for (const r of rs) {
    if (r.diedAt) diedAt[r.diedAt]++;
    for (const f of r.fights) {
      poolWin[f.pool].n++;
      if (f.win) poolWin[f.pool].win++;
    }
  }
  const reached = rs.filter((r) => r.bossHpStart !== null);
  return {
    main,
    sub,
    n,
    clearRate: rs.filter((r) => r.clear).length / n,
    diedAt,
    bossReachRate: reached.length / n,
    bossWinRate: reached.length ? reached.filter((r) => r.clear).length / reached.length : 0,
    bossHpStartMedian: med(reached.map((r) => r.bossHpStart!)),
    fightsMedian: med(rs.map((r) => r.fights.length)),
    timeouts: rs.reduce((x, r) => x + r.timeouts, 0),
    poolWin,
  };
}

const pct = (x: number) => (x * 100).toFixed(1) + '%';
export function mapReport(title: string, rows: MapBatchRow[], target: [number, number] = [0.65, 0.8]) {
  const name = (id: string) => CONFIG.heroes[id]?.name ?? id;
  const lines = [
    `# ${title}`,
    '',
    `目标整章通关率 ${pct(target[0])}–${pct(target[1])}`,
    '',
    '| 主将+副将 | 局数 | 整章通关率 | 达标 | 到 Boss 率 | Boss 胜率 | 进 Boss 体力中位 | 战斗数中位 | 死于 easy/normal/elite/boss | 超时 |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const ok = r.clearRate < target[0] ? '偏低' : r.clearRate > target[1] ? '偏高' : '✓';
    const d = r.diedAt;
    lines.push(
      `| ${name(r.main)}+${name(r.sub)} | ${r.n} | ${pct(r.clearRate)} | ${ok} | ${pct(r.bossReachRate)} | ${pct(r.bossWinRate)} | ${r.bossHpStartMedian} | ${r.fightsMedian} | ${d.easy}/${d.normal}/${d.elite}/${d.boss} | ${r.timeouts} |`,
    );
  }
  if (rows.length > 1) {
    const cr = rows.map((r) => r.clearRate);
    lines.push('', `武将差距：最高 ${pct(Math.max(...cr))}，最低 ${pct(Math.min(...cr))}，极差 ${pct(Math.max(...cr) - Math.min(...cr))}`);
  }
  return lines.join('\n');
}
