/**
 * 局状态 RunState（#122 PR1）：一局的唯一数据源，纯数据（可 JSON 往返），由 RunSession 持有。
 * 覆盖目前分散在 core Game / EconomySession(Inventory) / MapSession(RunSave) / RunStats 里的局内状态；
 * 字段映射见 docs 与 PR 描述。PR1 只定义结构、拷贝与序列化，不接入战斗 / HUD / 经济页。
 *
 * 版本策略：
 * - version 为 RunState 结构版本（RUN_STATE_VERSION）。读档时 version 更新 → 拒绝（'newer'，不覆盖存档）；
 *   更旧 → 依次走 MIGRATIONS 升级；结构不符 / JSON 损坏 → 'corrupt'。
 * - 旧 RunSave（mojuan.run.v1，schema:1、version 为字符串）视为 v0，迁移时随机流按 runSeed 重新派生（无法续上旧序列，
 *   结果里 rngReset=true）。
 * - configVersion（配置版本）不同不在这里拒绝，只在结果里标记 configChanged，由续玩流程决定（现有 resumeRun 规则）。
 */
import type { CardInst } from '../../core/types';
import type { MapState } from '../../core/run/map';
import { newEncounterState, type EncounterState } from '../../core/run/encounters';
import type { RunSave } from '../../core/run/save';
import { emptyStats, parseStats, type RunStats } from './stats';

export const RUN_STATE_VERSION = 1;

/** 局内随机流：战斗（core Game.rng）、经济（奖励/集市/宝箱，EconomySession.rng）、节点事件（营地淬炼 / 奇遇，PR3 接入） */
export const RNG_STREAMS = ['battle', 'economy', 'event'] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

export interface RunCounters {
  /** H5 奖励页免费刷新已用次数（本局） */
  rewardRefreshUsed: number;
  /** H5 集市免费刷新已用次数（本局） */
  shopRefreshUsed: number;
  /** 本局删牌服务已用次数（价格递增） */
  removeUsed: number;
}

export interface RunState {
  version: typeof RUN_STATE_VERSION;
  configVersion: string;
  runSeed: number;
  chapter: number;
  /** 开局时间（ms），结算用时 */
  startedAt: number;
  heroMain: string;
  heroSub: string;
  /** 天命（局外解锁带入；≥6 集市 +20%） */
  tianming: number;
  hp: number;
  maxHp: number;
  gold: number;
  /** 牌组（含词条 mods） */
  deck: CardInst[];
  /** 下一张新牌 uid（局内自增，避免撞号） */
  nextUid: number;
  relics: string[];
  /** 丹药栏（定长，空位 null） */
  potions: (string | null)[];
  counters: RunCounters;
  /** 地图进度（点将出征后、进地图前为 null） */
  map: MapState | null;
  encounters: EncounterState;
  /** 各随机流的内部状态（mulberry32 uint32） */
  rng: Record<RngStream, number>;
  stats: RunStats;
}

/** 由局种子派生各随机流初始状态：battle = runSeed（与现 RunSession 一致），economy = runSeed ^ 0x45a5（与现 EconomySession.bind 一致） */
export function initialRngStates(runSeed: number): Record<RngStream, number> {
  return { battle: runSeed >>> 0, economy: (runSeed ^ 0x45a5) >>> 0, event: (runSeed ^ 0x9e3779b9) >>> 0 };
}

export interface NewRunStateOpts {
  runSeed: number;
  heroMain: string;
  heroSub: string;
  hp: number;
  maxHp?: number;
  deck: CardInst[];
  gold: number;
  potionSlots: number;
  chapter?: number;
  tianming?: number;
  configVersion?: string;
  startedAt?: number;
}
export function createRunState(o: NewRunStateOpts): RunState {
  return cloneRunState({
    version: RUN_STATE_VERSION,
    configVersion: o.configVersion ?? 'dev',
    runSeed: o.runSeed >>> 0,
    chapter: o.chapter ?? 1,
    startedAt: o.startedAt ?? 0,
    heroMain: o.heroMain,
    heroSub: o.heroSub,
    tianming: o.tianming ?? 0,
    hp: o.hp,
    maxHp: o.maxHp ?? o.hp,
    gold: o.gold,
    deck: o.deck,
    nextUid: o.deck.reduce((m, c) => Math.max(m, c.uid), 0) + 1,
    relics: [],
    potions: Array<string | null>(o.potionSlots).fill(null),
    counters: { rewardRefreshUsed: 0, shopRefreshUsed: 0, removeUsed: 0 },
    map: null,
    encounters: newEncounterState(),
    rng: initialRngStates(o.runSeed),
    stats: emptyStats(),
  });
}

/** 深拷贝（拷贝语义：RunSession 对外只给副本，外部改动不影响局状态） */
export const cloneRunState = (s: RunState): RunState => JSON.parse(JSON.stringify(s)) as RunState;

// ───────── 校验 ─────────
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isCard = (c: unknown) => {
  const k = c as CardInst;
  return !!k && isNum(k.uid) && isStr(k.id) && isStr(k.suit) && isNum(k.rank) && Array.isArray(k.mods) && k.mods.every(isStr);
};
export function isRunState(x: unknown): x is RunState {
  const s = x as RunState;
  if (!s || typeof s !== 'object' || s.version !== RUN_STATE_VERSION) return false;
  const nums = [s.runSeed, s.chapter, s.startedAt, s.tianming, s.hp, s.maxHp, s.gold, s.nextUid];
  return (
    nums.every(isNum) &&
    isStr(s.configVersion) &&
    isStr(s.heroMain) &&
    isStr(s.heroSub) &&
    Array.isArray(s.deck) &&
    s.deck.every(isCard) &&
    Array.isArray(s.relics) &&
    s.relics.every(isStr) &&
    Array.isArray(s.potions) &&
    s.potions.every((p) => p === null || isStr(p)) &&
    !!s.counters &&
    isNum(s.counters.rewardRefreshUsed) &&
    isNum(s.counters.shopRefreshUsed) &&
    isNum(s.counters.removeUsed) &&
    (s.map === null || (!!s.map && Array.isArray(s.map.nodes) && Array.isArray(s.map.visited))) &&
    !!s.encounters &&
    isNum(s.encounters.draws) &&
    !!s.rng &&
    RNG_STREAMS.every((k) => isNum(s.rng[k])) &&
    !!s.stats
  );
}

// ───────── 序列化 ─────────
export function serializeRunState(s: RunState): string {
  if (!isRunState(s)) throw new Error('RunState 结构不合法，拒绝写入');
  return JSON.stringify(s);
}

export type LoadResult =
  | { ok: true; state: RunState; migratedFrom: number | null; rngReset: boolean; configChanged: boolean }
  | { ok: false; reason: 'corrupt' | 'newer'; version?: unknown };

/** 旧版本升级：from 版本 → 下一版本。v0 = 旧 RunSave（mojuan.run.v1） */
type Migration = (raw: Record<string, unknown>, potionSlots: number) => Record<string, unknown>;
const MIGRATIONS: Record<number, Migration> = {
  0: (raw, potionSlots) => fromLegacyRunSave(raw as unknown as RunSave, potionSlots) as unknown as Record<string, unknown>,
};

/** 版本号：RunState 用数字 version；旧 RunSave（schema:1，version 为字符串）记 0 */
function versionOf(raw: Record<string, unknown>): number | null {
  if (isNum(raw.version)) return raw.version;
  if (raw.schema === 1 && isStr(raw.version)) return 0;
  return null;
}

export interface LoadOpts {
  /** 当前配置版本（不同则 configChanged=true） */
  configVersion?: string;
  /** 迁移旧档时丹药栏长度（旧档丹药是 string[]） */
  potionSlots?: number;
}
export function deserializeRunState(text: string | null | undefined, o: LoadOpts = {}): LoadResult {
  if (!text) return { ok: false, reason: 'corrupt' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'corrupt' };
  let cur = raw as Record<string, unknown>;
  const v0 = versionOf(cur);
  if (v0 === null) return { ok: false, reason: 'corrupt' };
  if (v0 > RUN_STATE_VERSION) return { ok: false, reason: 'newer', version: v0 };
  let v = v0;
  try {
    while (v < RUN_STATE_VERSION) {
      const m = MIGRATIONS[v];
      if (!m) return { ok: false, reason: 'corrupt', version: v };
      cur = m(cur, o.potionSlots ?? 3);
      v = versionOf(cur) ?? -1;
      if (v < 0) return { ok: false, reason: 'corrupt' };
    }
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!isRunState(cur)) return { ok: false, reason: 'corrupt' };
  const state = cloneRunState(cur);
  return {
    ok: true,
    state,
    migratedFrom: v0 === RUN_STATE_VERSION ? null : v0,
    rngReset: v0 === 0,
    configChanged: o.configVersion !== undefined && o.configVersion !== state.configVersion,
  };
}

/**
 * 旧 RunSave → RunState（v0 迁移）。旧档没有随机流状态与刷新/删牌计数：随机流按 runSeed 重新派生、计数归 0；
 * 战斗中存档（battleState）不迁移，由续玩流程按 battleStartSnapshot 回退。
 */
export function fromLegacyRunSave(s: RunSave, potionSlots = 3): RunState {
  const deck = (Array.isArray(s.deck) ? s.deck : []).filter(isCard) as CardInst[];
  const pots = (Array.isArray(s.potions) ? s.potions : []).map((p) => (isStr(p) ? p : null));
  const potions = Array.from({ length: Math.max(potionSlots, pots.length) }, (_, i) => pots[i] ?? null);
  const legacy = s as RunSave & { tianming?: unknown; stats?: unknown; startedAt?: unknown };
  return cloneRunState({
    version: RUN_STATE_VERSION,
    configVersion: isStr(s.configVersion) ? s.configVersion : 'dev',
    runSeed: s.runSeed >>> 0,
    chapter: s.chapter,
    startedAt: isNum(legacy.startedAt) ? legacy.startedAt : isNum(s.timestamp) ? s.timestamp : 0,
    heroMain: s.heroMain ?? '',
    heroSub: s.heroSub ?? '',
    tianming: isNum(legacy.tianming) ? legacy.tianming : 0,
    hp: s.hp,
    maxHp: s.maxHp,
    gold: s.gold,
    deck,
    nextUid: deck.reduce((m, c) => Math.max(m, c.uid), 0) + 1,
    relics: (s.relics ?? []).filter(isStr),
    potions,
    counters: { rewardRefreshUsed: 0, shopRefreshUsed: 0, removeUsed: 0 },
    map: s.mapState ?? null,
    encounters: s.encounters ?? newEncounterState(),
    rng: initialRngStates(s.runSeed),
    stats: parseStats(legacy.stats),
  });
}
