/**
 * 结算数据（PRD 14.5 / 15.1 / 15.3 / 21.4）：只在表现层计算，不改 src/core。
 * - 将魂公式已定（14.5），系数读 config rules.settlement（SETTLEMENT_CONFIG），数值以数值策划为准。
 * - 将魂首版只累计和展示（O30/O37）；天命 N 通关解锁 N+1（15.3）；武将全部免费（15.2）。
 */

import { CONFIG, type SettlementCfg } from '../../data/config';
import { emptyStats, type RunStats } from '../run/stats';

export type { RunStats };
/** @deprecated 用 emptyStats() */
export const EMPTY_STATS: RunStats = Object.freeze(emptyStats());

export interface ResultCard {
  id: string;
  name: string;
  /** 词条名（进化牌） */
  affixes: string[];
}

/** 结算页输入：由局状态（RunSave / Game）适配而来 */
export interface RunOutcome {
  win: boolean;
  /** 主动放弃（PRD 5.13）：按失败结算 */
  abandoned: boolean;
  runSeed: number;
  heroMain: string;
  heroSub: string;
  /** 珠联名（无则空） */
  combo?: string;
  chapter: number;
  /** 本章章名（例：黄巾） */
  chapterName?: string;
  /** 到达层（1–9，9 = Boss） */
  layer: number;
  /** 用时（毫秒） */
  durationMs: number;
  tianming: number;
  /** 通关章数（整局胜利 = chapter） */
  chaptersCleared: number;
  reviveUsed: boolean;
  stats: RunStats;
  deck: ResultCard[];
  relics: string[];
  gold: number;
  /** 致命敌人名（败北页左侧小牌） */
  killer?: string;
}

/** 将魂系数（PRD 14.5；config rules.settlement，#174） */
export const SETTLEMENT_CONFIG: SettlementCfg = CONFIG.rules.settlement;

/** 最后一章 = config rules.run.chapters（缺省 1，与 data/map RUN_CHAPTERS 同规则）；调用时读取 */
export const lastChapter = (rules: Pick<typeof CONFIG.rules, 'run'> = CONFIG.rules): number => rules.run?.chapters ?? 1;

export interface SoulLine {
  label: string;
  count: number;
  each: number;
  value: number;
}
export interface SoulBreakdown {
  lines: SoulLine[];
  /** 各行之和 */
  base: number;
  /** 败北/放弃 ×0.5 后（向下取整）；胜利时等于 base */
  afterDefeat: number;
  /** 天命加成倍率 */
  tianmingMul: number;
  total: number;
}

/** PRD 14.5：将魂 = 通关章数×30 + 精英×8 + 胜场×2 + Boss×40；失败 ×0.5 向下取整；× (1 + 0.1×天命) */
export function computeSoul(o: RunOutcome, cfg = SETTLEMENT_CONFIG.soul): SoulBreakdown {
  const s = o.stats;
  const lines: SoulLine[] = [
    { label: '通关章数', count: o.chaptersCleared, each: cfg.perChapter },
    { label: '精英击杀', count: s.elitesKilled, each: cfg.perElite },
    { label: '战斗胜利', count: s.battlesWon, each: cfg.perWin },
    { label: 'Boss 击杀', count: s.bossKilled, each: cfg.perBoss },
  ].map((l) => ({ ...l, value: l.count * l.each }));
  const base = lines.reduce((n, l) => n + l.value, 0);
  const afterDefeat = o.win ? base : Math.floor(base * cfg.defeatMul);
  const tianmingMul = 1 + cfg.tianmingStep * o.tianming;
  // 浮点：0.1×3 = 0.30000000000000004，先放大到整数百分比再取整
  const total = Math.floor((afterDefeat * Math.round(tianmingMul * 100)) / 100);
  return { lines, base, afterDefeat, tianmingMul, total };
}

/** 结算页 8 项（PRD 14.5）的展示模型 */
export interface ResultView {
  title: '大捷' | '败北';
  /** 1. 结果：章与层、用时、runSeed */
  reach: string;
  duration: string;
  seed: string;
  /** 2. 阵容 */
  lineup: { main: string; sub: string; combo?: string };
  /** 3. 战报 */
  report: { label: string; value: string }[];
  /** 4. 最终牌组、宝物、铜钱 */
  deck: ResultCard[];
  relics: string[];
  gold: number;
  /** 5. 将魂 */
  soul: SoulBreakdown;
  soulTotalBefore: number;
  /** 6. 解锁提示 */
  unlock: string | null;
  /** 7. 兵书抄录：本局进化牌 */
  evolved: ResultCard[];
  /** 败北页致命敌人 */
  killer?: string;
  abandoned: boolean;
  /** 竖排副标题（章名） */
  chapterName: string;
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function buildView(o: RunOutcome, meta: MetaProgress, names: (heroId: string) => string = (x) => x): ResultView {
  const s = o.stats;
  const normal = Math.max(0, s.battlesWon - s.elitesKilled - s.bossKilled);
  return {
    title: o.win ? '大捷' : '败北',
    reach: `第${CN[o.chapter] ?? o.chapter}章${o.chapterName ? ` · ${o.chapterName}` : ''} · ${o.layer >= 9 ? 'Boss' : `第 ${o.layer} 层`}`,
    duration: fmtDuration(o.durationMs),
    seed: String(o.runSeed),
    lineup: { main: names(o.heroMain), sub: names(o.heroSub), combo: o.combo },
    report: [
      { label: '战斗胜利', value: `${s.battlesWon}（普通 ${normal} / 精英 ${s.elitesKilled} / Boss ${s.bossKilled}）` },
      { label: '总回合数', value: String(s.turns) },
      { label: '造成伤害', value: String(s.dmgDealt) },
      { label: '承受伤害', value: String(s.dmgTaken) },
      { label: '最大单回合掉血', value: String(s.maxTurnLoss) },
      { label: '灵光一闪', value: `${s.epiphanies} 次` },
      { label: '复活', value: o.reviveUsed ? '已使用' : '未使用' },
    ],
    deck: o.deck,
    relics: o.relics,
    gold: o.gold,
    soul: computeSoul(o),
    soulTotalBefore: meta.soul,
    unlock: unlockAfter(o, meta),
    evolved: o.deck.filter((c) => c.affixes.length > 0),
    killer: o.killer,
    abandoned: o.abandoned,
    chapterName: o.chapterName ?? '',
  };
}

// ---------------- 局外存档（PRD 14.5：将魂、天命进度、统计） ----------------

export interface MetaProgress {
  schema: 1;
  /** 累计将魂（首版只累计和展示） */
  soul: number;
  /** 已解锁的最高天命（0 = 只开放天命 0） */
  tianmingUnlocked: number;
  runs: number;
  wins: number;
  /** 已结算过的 runSeed（防止重复入账，保留最近 20 个） */
  settled: number[];
}
export const META_KEY = 'mojuan.meta.v1';
export const EMPTY_META: MetaProgress = { schema: 1, soul: 0, tianmingUnlocked: 0, runs: 0, wins: 0, settled: [] };

/** PRD 15.3：通关天命 N 解锁 N+1（H5 首版通关 = 打败第 1 章 Boss） */
export function unlockAfter(o: RunOutcome, meta: MetaProgress): string | null {
  if (!o.win || o.tianming < meta.tianmingUnlocked || o.tianming >= SETTLEMENT_CONFIG.maxTianming) return null;
  return `解锁天命 ${o.tianming + 1}`;
}

/** 写入局外存档（幂等：同一 runSeed 只入账一次） */
export function applyOutcome(meta: MetaProgress, o: RunOutcome): MetaProgress {
  if (meta.settled.includes(o.runSeed)) return meta;
  const soul = computeSoul(o).total;
  return {
    ...meta,
    soul: meta.soul + soul,
    tianmingUnlocked: unlockAfter(o, meta) ? o.tianming + 1 : meta.tianmingUnlocked,
    runs: meta.runs + 1,
    wins: meta.wins + (o.win ? 1 : 0),
    settled: [...meta.settled, o.runSeed].slice(-20),
  };
}
