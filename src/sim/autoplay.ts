/**
 * 自动试玩统计（issue #3）：直接驱动 src/core 的 Game 纯逻辑 + 简单贪心 AI，
 * 批量统计剩余体力分布、回合数、战败率与各防御层抵消量（护主/八卦/闪/护甲/桃）。
 */
import { Game, type BattleIO } from '../core/battle';
import { seeded } from '../core/rng';
import { def, isRed, isShaPlay } from '../core/rules';
import { BATTLES } from '../data/enemies';
import type { CardInst, Enemy } from '../core/types';

export type Layer = 'huzhu' | 'bagua' | 'shan' | 'armor' | 'tao';
export const LAYERS: Layer[] = ['huzhu', 'bagua', 'shan', 'armor', 'tao'];
export const LAYER_CH: Record<Layer, string> = { huzhu: '护主', bagua: '八卦', shan: '闪', armor: '护甲', tao: '桃/酒回复' };

export interface GameStats {
  battleIdx: number;
  seed: number;
  win: boolean;
  timeout: boolean;
  hpStart: number;
  hpEnd: number;
  turns: number;
  /** 本场曾进入濒死（体力 ≤0） */
  dying: boolean;
  absorbed: Record<Layer, number>;
  /** 敌方实际打出的伤害总量（各层抵消前） */
  incoming: number;
  hpLost: number;
  turnsHit: number;
  firstTurnLoss: number;
  firstTurnEnemySha: number;
  plays: { attack: number; defense: number; other: number };
}

const emptyLayers = (): Record<Layer, number> => ({ huzhu: 0, bagua: 0, shan: 0, armor: 0, tao: 0 });

/** 带统计钩子的 Game 子类：只包装、不改变规则 */
export class StatGame extends Game {
  st = { absorbed: emptyLayers(), incoming: 0, dying: false, hpLost: 0, turnHit: new Map<number, number>(), sha1: 0 };
  async enemySha(e: Enemy, n: number, mod?: string) {
    if (this.turn === 1) this.st.sha1++;
    const r = await super.enemySha(e, n, mod);
    if (r === 'huzhu' || r === 'bagua' || r === 'shan') {
      this.st.absorbed[r] += n;
      this.st.incoming += n;
    }
    return r;
  }
  async dmgPlayer(n: number) {
    this.st.incoming += n;
    const a = Math.min(this.p.armor, n);
    this.st.absorbed.armor += a;
    this.st.hpLost += n - a;
    if (n - a > 0) this.st.turnHit.set(this.turn, (this.st.turnHit.get(this.turn) ?? 0) + n - a);
    if (this.p.hp - (n - a) <= 0) this.st.dying = true;
    await super.dmgPlayer(n);
  }
  heal(n: number) {
    const b = this.p.hp;
    super.heal(n);
    this.st.absorbed.tao += this.p.hp - b;
  }
}

export function silentIO(onEnd: (w: boolean) => void): BattleIO {
  return {
    log: () => {},
    update: () => {},
    sleep: async () => {},
    showJudge: async () => {},
    // 闪由 autoShan 处理；此处只剩濒死自救：有桃/酒就用
    respond: async () => null as CardInst | null,
    epiphany: async (_c, o) => o[0] ?? null,
    onBattleEnd: onEnd,
  };
}

// ---------------- 简单贪心 AI ----------------
const isDefCard = (c: CardInst) => {
  const d = def(c);
  return !!(d.shan || d.tao || c.id === 'T012' || d.slot === 'armor');
};

function targetFor(g: Game, c: CardInst): Enemy | null {
  const cands = g.alive().filter((e) => g.canTarget(e, c));
  if (!cands.length) return null;
  // 优先无闪标记、体力低的
  return cands.sort((a, b) => a.marks - b.marks || a.hp + a.armor - (b.hp + b.armor))[0];
}

/** 执行 AI 的一个出牌阶段，返回打出的牌分类计数 */
export async function aiTurn(g: Game, plays: GameStats['plays']) {
  for (let guard = 0; guard < 30 && !g.over; guard++) {
    const p = g.p;
    const ok = (c: CardInst) => g.hand.includes(c) && !g.checkPlay(c);
    const find = (f: (c: CardInst) => boolean) => g.hand.find((c) => f(c) && ok(c));
    const shas = () => g.hand.filter((c) => def(c).sha && ok(c) && targetFor(g, c));
    let c: CardInst | undefined;
    let tgt: Enemy | null = null;
    let red: CardInst | undefined;

    if ((c = find((x) => !!def(x).slot && !p.equip[def(x).slot!]))) {
      /* 装备 */
    } else if ((c = find((x) => x.id === 'T013' || x.id === 'T001'))) {
      if (c.id === 'T013') tgt = g.alive()[0];
    } else if (p.hp <= p.maxHp - 2 && (c = find((x) => !!def(x).tao))) {
      /* 桃 */
    } else if ((c = find((x) => x.id === 'D001'))) {
      tgt = g.alive().sort((a, b) => b.hp - a.hp)[0];
    } else if (g.alive().length >= 2 && (c = find((x) => x.id === 'T005'))) {
      /* 南蛮 */
    } else if (shas().length && p.ling >= 2 && !p.jiu && (c = find((x) => !!def(x).jiu || x.id === 'SH01'))) {
      /* 酒/义勇 先手 */
    } else if (shas().length) {
      // 傲骨：弃一张非桃非闪的红牌
      if (g.canAogu() && !p.aogu) {
        const r = g.hand.find((x) => isRed(x) && !isDefCard(x) && !def(x).sha && x.id !== 'X004');
        if (r) g.aogu(r);
      }
      const all = shas();
      c = all.find((x) => x.id !== 'X004') ?? all[0];
      if (c.id === 'X004') red = g.hand.find((x) => x !== c && isRed(x));
      tgt = targetFor(g, c);
    } else if ((c = find((x) => x.id === 'T003' && g.alive().some((e) => e.armor > 0)))) {
      tgt = g.alive().find((e) => e.armor > 0)!;
    } else if ((c = find((x) => x.id === 'T012'))) {
      /* 以逸待劳 */
    } else if (p.hp < p.maxHp && (c = find((x) => !!def(x).tao))) {
      /* 桃 */
    }
    if (!c) return;
    if (g.needsTarget(c) && !tgt) return;
    const d = def(c);
    if (isShaPlay(c) || d.jiu || c.id === 'SH01' || c.id === 'T005' || c.id === 'X004') plays.attack++;
    else if (isDefCard(c)) plays.defense++;
    else plays.other++;
    await g.play(c, tgt, red);
  }
}

function pickDiscards(g: Game): CardInst[] {
  const n = g.discardNeeded();
  const score = (c: CardInst) => (def(c).shan ? 5 : def(c).tao ? 4 : def(c).sha ? 3 : 1);
  return [...g.hand].sort((a, b) => score(a) - score(b)).slice(0, n);
}

export interface RunOpts {
  battleIdx: number;
  seed: number;
  hp?: number;
  maxTurns?: number;
}

/** 单场战斗：从给定体力开始，AI 打到结束 */
export async function runBattle(o: RunOpts): Promise<GameStats> {
  let win = false;
  const io = silentIO((w) => (win = w));
  const g = new StatGame(seeded(o.seed), io, { autoShan: true });
  io.respond = async (_t, legal) => g.hand.find(legal) ?? null;
  g.battleIdx = o.battleIdx;
  if (o.hp !== undefined) g.p.hp = o.hp;
  const hpStart = g.p.hp;
  const plays = { attack: 0, defense: 0, other: 0 };
  g.startBattle();
  const maxTurns = o.maxTurns ?? 40;
  while (!g.over && g.turn <= maxTurns) {
    await aiTurn(g, plays);
    if (g.over) break;
    await g.endTurn(pickDiscards(g));
  }
  return {
    battleIdx: o.battleIdx,
    seed: o.seed,
    win: g.over && win,
    timeout: !g.over,
    hpStart,
    hpEnd: Math.max(0, g.p.hp),
    turns: g.turn,
    dying: g.st.dying,
    absorbed: g.st.absorbed,
    incoming: g.st.incoming,
    hpLost: g.st.hpLost,
    turnsHit: g.st.turnHit.size,
    firstTurnLoss: g.st.turnHit.get(1) ?? 0,
    firstTurnEnemySha: g.st.sha1,
    plays,
  };
}

/** 整章：依次打完所有战斗，体力继承 */
export async function runChapter(seed: number) {
  const res: GameStats[] = [];
  let hp: number | undefined;
  for (let i = 0; i < BATTLES.length; i++) {
    const r = await runBattle({ battleIdx: i, seed: seed * 31 + i, hp });
    res.push(r);
    if (!r.win) return { clear: false, res, hpAtLast: i === BATTLES.length - 1 ? r.hpStart : null };
    hp = r.hpEnd;
  }
  return { clear: true, res, hpAtLast: res[res.length - 1].hpStart };
}

// ---------------- 汇总 ----------------
export const quantile = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1) + '%' : '-');

export function summarize(rs: GameStats[]) {
  const n = rs.length;
  const wins = rs.filter((r) => r.win);
  const hp = rs.map((r) => r.hpEnd);
  const maxHp = rs[0]?.hpStart ?? 8;
  const dist: Record<number, number> = {};
  for (const h of hp) dist[h] = (dist[h] ?? 0) + 1;
  const absorbed = emptyLayers();
  for (const r of rs) for (const l of LAYERS) absorbed[l] += r.absorbed[l];
  const plays = { attack: 0, defense: 0, other: 0 };
  for (const r of rs) for (const k of ['attack', 'defense', 'other'] as const) plays[k] += r.plays[k];
  const totalPlays = plays.attack + plays.defense + plays.other;
  return {
    n,
    defeatRate: (n - wins.length) / n,
    timeouts: rs.filter((r) => r.timeout).length,
    hpMedian: quantile(hp, 0.5),
    hpMedianWins: quantile(
      wins.map((r) => r.hpEnd),
      0.5,
    ),
    hpP10: quantile(hp, 0.1),
    hpP90: quantile(hp, 0.9),
    hpDist: dist,
    fullHpRate: hp.filter((h) => h >= maxHp).length / n,
    le3Rate: hp.filter((h) => h <= 3).length / n,
    dyingRate: rs.filter((r) => r.dying).length / n,
    turnsMedian: quantile(
      rs.map((r) => r.turns),
      0.5,
    ),
    turnsP10: quantile(
      rs.map((r) => r.turns),
      0.1,
    ),
    turnsP90: quantile(
      rs.map((r) => r.turns),
      0.9,
    ),
    absorbedPerGame: Object.fromEntries(LAYERS.map((l) => [l, absorbed[l] / n])) as Record<Layer, number>,
    incomingPerGame: mean(rs.map((r) => r.incoming)),
    hpLostPerGame: mean(rs.map((r) => r.hpLost)),
    hitTurnShare: rs.reduce((a, r) => a + r.turnsHit, 0) / rs.reduce((a, r) => a + r.turns, 0),
    firstTurnSha: mean(rs.map((r) => r.firstTurnEnemySha)),
    firstTurnLoss: mean(rs.map((r) => r.firstTurnLoss)),
    playShare: { attack: plays.attack / totalPlays, defense: plays.defense / totalPlays },
  };
}
export type Summary = ReturnType<typeof summarize>;

const KIND = (i: number) => (BATTLES[i].name.includes('精英') ? '精英战' : /boss|Boss|首领/.test(BATTLES[i].name) ? 'Boss 战' : '普通战');

export function report(title: string, per: { idx: number; s: Summary }[], ch: { n: number; clear: number; hpAtLast: number[] }) {
  const f = (x: number, d = 1) => (Number.isNaN(x) ? '-' : x.toFixed(d));
  const L: string[] = [`# ${title}`, ''];
  L.push('| 战斗 | 类型 | 场数 | 剩余体力中位数 (P10–P90) | 胜场中位数 | 满血率 | ≤3体力率 | 濒死率 | 回合 中位 (P10–P90) | 战败率 | 超时 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const { idx, s } of per)
    L.push(
      `| ${idx + 1}. ${BATTLES[idx].name} | ${KIND(idx)} | ${s.n} | ${f(s.hpMedian)} (${f(s.hpP10)}–${f(s.hpP90)}) | ${f(s.hpMedianWins)} | ${pct(s.fullHpRate, 1)} | ${pct(s.le3Rate, 1)} | ${pct(s.dyingRate, 1)} | ${f(s.turnsMedian)} (${f(s.turnsP10)}–${f(s.turnsP90)}) | ${pct(s.defeatRate, 1)} | ${s.timeouts} |`,
    );
  L.push('', '## 剩余体力分布', '');
  for (const { idx, s } of per)
    L.push(
      `- ${BATTLES[idx].name}: ` +
        Object.entries(s.hpDist)
          .sort((a, b) => +a[0] - +b[0])
          .map(([h, c]) => `${h}:${c}`)
          .join('  '),
    );
  L.push('', '## 防御层抵消量（每场平均点数）', '');
  L.push(`| 战斗 | 敌方伤害输入 | ${LAYERS.map((l) => LAYER_CH[l]).join(' | ')} | 实际掉血 |`);
  L.push(`|---|---|${LAYERS.map(() => '---').join('|')}|---|`);
  for (const { idx, s } of per)
    L.push(`| ${BATTLES[idx].name} | ${f(s.incomingPerGame, 2)} | ${LAYERS.map((l) => f(s.absorbedPerGame[l], 2)).join(' | ')} | ${f(s.hpLostPerGame, 2)} |`);
  L.push('', '## 过程指标', '');
  L.push('| 战斗 | 首回合敌方杀数 | 首回合掉血 | 掉血回合占比 | 进攻牌占比 | 防御牌占比 |', '|---|---|---|---|---|---|');
  for (const { idx, s } of per)
    L.push(
      `| ${BATTLES[idx].name} | ${f(s.firstTurnSha, 2)} | ${f(s.firstTurnLoss, 2)} | ${pct(s.hitTurnShare, 1)} | ${pct(s.playShare.attack, 1)} | ${pct(s.playShare.defense, 1)} |`,
    );
  L.push(
    '',
    `## 整章（${ch.n} 局，体力继承）`,
    '',
    `- 通关率 ${pct(ch.clear, ch.n)}`,
    `- 到达最后一战时体力中位数 ${f(quantile(ch.hpAtLast, 0.5))}（样本 ${ch.hpAtLast.length}）`,
  );
  return L.join('\n');
}

/** 批量：每战 n 场（前半固定种子 1..n/2，后半随机种子），每战从满血开始 */
export async function batch(n: number, randomSeed = Date.now()) {
  const seeds = Array.from({ length: n }, (_, i) => (i < n / 2 ? i + 1 : (randomSeed + i * 7919) >>> 0));
  const per: { idx: number; s: Summary }[] = [];
  for (let idx = 0; idx < BATTLES.length; idx++) {
    const rs: GameStats[] = [];
    for (const seed of seeds) rs.push(await runBattle({ battleIdx: idx, seed }));
    per.push({ idx, s: summarize(rs) });
  }
  let clear = 0;
  const hpAtLast: number[] = [];
  for (const seed of seeds) {
    const c = await runChapter(seed);
    if (c.clear) clear++;
    if (c.hpAtLast !== null) hpAtLast.push(c.hpAtLast);
  }
  return { per, ch: { n, clear, hpAtLast } };
}
