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
 * - 旧档迁移规则见 docs/specs/runstate-migration.md：战斗中状态丢弃，有快照回到该节点开打前，无快照退回上一已完成节点。
 *
 * 存档时机（#122 组长定稿）：进任何节点前写一份完整 RunState（pendingNode = 该节点，含三条 rng 状态），
 * 节点内中途不写；节点结算完成立即写档（pendingNode = null）。读到 pendingNode 非空 = 节点内中途刷新，一律回到这份快照重进。
 */
import type { CardInst } from '../../core/types';
import type { MapState } from '../../core/run/map';
import { newEncounterState, type EncounterState } from '../../core/run/encounters';
import type { RunSave } from '../../core/run/save';
import { emptyStats, parseStats, type RunStats } from './stats';

/** v2（#122 PR3）：counters 去掉 rewardRefreshUsed（#92 已去掉 H5 奖励刷新） */
export const RUN_STATE_VERSION = 2;
/** 当前配置版本（PRD §21.4 configVersion）；配置结构 / 数值发版时改这里 */
export const CONFIG_VERSION = 'dev';

/** 局内随机流：战斗（core Game.rng）、经济（奖励/集市/宝箱，EconomySession.rng）、节点事件（营地淬炼 / 奇遇，PR3 接入） */
export const RNG_STREAMS = ['battle', 'economy', 'event'] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

export interface RunCounters {
  /** H5 集市免费刷新已用次数（本局） */
  shopRefreshUsed: number;
  /** 本局删牌服务已用次数（价格递增） */
  removeUsed: number;
}

export interface PendingNode {
  id: string;
  /** 节点类型（BATTLE / ELITE / BOSS / EVENT / SHOP / CHEST / REST） */
  type: string;
}

/** 每局复活次数（PRD 复活；sim map-run 同值） */
export const REVIVES_PER_RUN = 1;
/** 一次性宝物（每局限 1 次） */
export const ONE_SHOT_RELICS: readonly string[] = ['R15'];

// ───────── 卡牌 uid 号段（#122 第 2 点） ─────────
/** 战斗内临时牌（衍生牌等）号段起点：≥ 此值的 uid 不进牌组、不写存档 */
export const TEMP_UID_BASE = 0x40000000;
export const isTempUid = (uid: number) => uid >= TEMP_UID_BASE;
/** 永久卡 uid：统一由 RunState.nextUid 分配（在 RunSession.update 的 draft 上调用） */
export function allocCardUid(draft: RunState): number {
  const uid = draft.nextUid++;
  if (isTempUid(uid)) throw new Error('永久卡 uid 号段已用尽');
  return uid;
}
/** 战斗内临时牌 uid 分配器：每场战斗新建一个，不进 RunState */
export function tempUidAllocator(): () => number {
  let n = TEMP_UID_BASE;
  return () => n++;
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
  /** 剩余复活次数（每局 REVIVES_PER_RUN） */
  reviveLeft: number;
  /** 已触发的一次性宝物（如 R15 七星灯） */
  relicsUsed: string[];
  /**
   * 已进入但未完成的节点（进节点快照）。非空时这份存档就是进该节点那一刻的状态：读档后重进该节点。
   * 地图 current 已在该节点（moveTo 之后），节点内的 encounterId 等保留，重打同一组包。
   */
  pendingNode: PendingNode | null;
  /** 地图进度（点将出征后、进地图前为 null） */
  map: MapState | null;
  encounters: EncounterState;
  /** 各随机流的内部状态（mulberry32 uint32） */
  rng: Record<RngStream, number>;
  stats: RunStats;
  /** 本局已结束（战斗失败）：续玩直接进结算页，不再重进节点（#122 PR2 「结束本局」） */
  ended?: { reason: 'defeat'; nodeId: string | null } | null;
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
    counters: { shopRefreshUsed: 0, removeUsed: 0 },
    reviveLeft: REVIVES_PER_RUN,
    relicsUsed: [],
    pendingNode: null,
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
    s.deck.every((c) => isCard(c) && !isTempUid(c.uid)) &&
    isNum(s.reviveLeft) &&
    Array.isArray(s.relicsUsed) &&
    s.relicsUsed.every(isStr) &&
    (s.pendingNode === null || (!!s.pendingNode && isStr(s.pendingNode.id) && isStr(s.pendingNode.type))) &&
    Array.isArray(s.relics) &&
    s.relics.every(isStr) &&
    Array.isArray(s.potions) &&
    s.potions.every((p) => p === null || isStr(p)) &&
    !!s.counters &&
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

/**
 * 读档后的提示钩子（PR3 接 toast，PR1 只返回类型）：
 * - migrate_battle_restart：旧档迁移，有快照 →「存档已更新，本场战斗重新开始」
 * - migrate_node_rollback：旧档迁移，无快照 →「存档已更新，已回到上一处」
 * - node_restart：节点内中途刷新，回到进节点快照 → 战斗节点「已回到本场战斗开打前」，其他节点「已回到进入此处前」（noticeText）
 * - config_confirm：配置版本不一致（PRD §21.4）→ 只弹「继续」确认框，不叠加 toast
 */
export type RunNotice = 'migrate_battle_restart' | 'migrate_node_rollback' | 'node_restart' | 'config_confirm';
const BATTLE_NODES = ['BATTLE', 'ELITE', 'BOSS'];
/** 提示文案（runstate-migration.md §4/§5）；config_confirm 走 §21.4 确认框，无 toast → null */
export function noticeText(n: RunNotice | null, pending: PendingNode | null = null): string | null {
  if (n === 'migrate_battle_restart') return '存档已更新，本场战斗重新开始';
  if (n === 'migrate_node_rollback') return '存档已更新，已回到上一处';
  if (n === 'node_restart') return pending && BATTLE_NODES.includes(pending.type) ? '已回到本场战斗开打前' : '已回到进入此处前';
  return null;
}

export interface Migration0 {
  kind: 'battle_rollback' | 'node_rollback' | 'none';
}
export type LoadResult =
  | {
      ok: true;
      state: RunState;
      migratedFrom: number | null;
      rngReset: boolean;
      configChanged: boolean;
      /** 旧档迁移的回退类型（未迁移为 null） */
      migration: Migration0 | null;
      /** 需要给玩家的提示（null = 不提示） */
      notice: RunNotice | null;
    }
  | { ok: false; reason: 'corrupt' | 'newer'; version?: unknown };

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
  const v0 = versionOf(raw as Record<string, unknown>);
  if (v0 === null) return { ok: false, reason: 'corrupt' };
  if (v0 > RUN_STATE_VERSION) return { ok: false, reason: 'newer', version: v0 };
  let state: RunState;
  let migration: Migration0 | null = null;
  try {
    if (v0 === 0) {
      const m = migrateLegacyRunSave(raw as RunSave, o.potionSlots ?? 3);
      state = m.state;
      migration = { kind: m.kind };
    } else state = raw as RunState;
    state = migrateRunState(state as unknown as Record<string, unknown>, v0 === 0 ? RUN_STATE_VERSION : v0);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!isRunState(state)) return { ok: false, reason: 'corrupt' };
  state = cloneRunState(state);
  const configChanged = o.configVersion !== undefined && o.configVersion !== state.configVersion;
  // 提示优先级：配置版本不一致只弹确认框（不叠 toast）> 迁移回退 > 节点内中途刷新
  let notice: RunNotice | null = null;
  if (configChanged) notice = 'config_confirm';
  else if (migration?.kind === 'battle_rollback') notice = 'migrate_battle_restart';
  else if (migration?.kind === 'node_rollback') notice = 'migrate_node_rollback';
  else if (state.pendingNode) notice = 'node_restart';
  return { ok: true, state, migratedFrom: v0 === RUN_STATE_VERSION ? null : v0, rngReset: v0 === 0, configChanged, migration, notice };
}

/** 结构版本迁移表：MIGRATIONS[n] 把 vn 升到 v(n+1) */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {
  /** v1 → v2：丢弃 counters.rewardRefreshUsed */
  1: (s) => {
    const c = { ...((s.counters ?? {}) as Record<string, unknown>) };
    delete c.rewardRefreshUsed;
    return { ...s, counters: c, version: 2 };
  },
};
/** 依次升级到 RUN_STATE_VERSION（缺迁移则抛错 → corrupt） */
export function migrateRunState(s: Record<string, unknown>, from: number): RunState {
  let cur = s;
  for (let v = from; v < RUN_STATE_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`缺少 RunState v${v} 迁移`);
    cur = m(cur);
  }
  return cur as unknown as RunState;
}

type LegacyCore = Partial<RunSave['battleStartSnapshot'] & { reviveLeft: number; relicsUsed: string[] }> & Record<string, unknown>;
type LegacySave = RunSave & { tianming?: unknown; stats?: unknown; startedAt?: unknown; reviveLeft?: unknown; relicsUsed?: unknown };

/**
 * 旧 RunSave → RunState（v0 迁移，runstate-migration.md）。
 * - 不在战斗中：字段映射，无回退。
 * - 战斗中 + 有 battleStartSnapshot：丢弃 battleState，回到该节点开打前（pendingNode = 该节点，节点未完成）；
 *   体力/牌组/复活/丹药/一次性宝物/铜钱/宝物/地图/组包取快照；快照缺的项取顶层字段——
 *   旧档战斗中只更新 battleState（autosaveBattle），顶层仍是上一已完成节点的状态。
 * - 战斗中 + 无快照：退回上一已完成节点（顶层字段；地图 current 退回 visited 的上一个，去掉该节点的 encounterId）。
 * 随机流按 runSeed 重新派生（旧档没有 rng 状态）。
 */
export function migrateLegacyRunSave(s: LegacySave, potionSlots = 3): { state: RunState; kind: Migration0['kind'] } {
  const inBattle = s.battleState != null || s.battleStartSnapshot != null;
  const snap = (s.battleStartSnapshot ?? null) as LegacyCore | null;
  const top = s as unknown as LegacyCore;
  const pick = <K extends keyof LegacyCore>(k: K): LegacyCore[K] => (snap && snap[k] !== undefined ? snap[k] : top[k]);
  let map: MapState | null = (snap ? pick('mapState') : s.mapState) ?? null;
  let encounters: EncounterState = (snap ? pick('encounters') : s.encounters) ?? newEncounterState();
  let pendingNode: PendingNode | null = null;
  let kind: Migration0['kind'] = 'none';
  if (inBattle && snap) {
    kind = 'battle_rollback';
    const cur = map?.current ? map.nodes.find((n) => n.id === map!.current) : undefined;
    if (cur) pendingNode = { id: cur.id, type: cur.type };
  } else if (inBattle) {
    kind = 'node_rollback';
    if (map?.current) map = rollbackNode(map);
    encounters = s.encounters ?? newEncounterState();
  }
  const src = inBattle && snap ? pick : (k: keyof LegacyCore) => top[k];
  const deck = ((src('deck') as unknown[] | undefined) ?? []).filter(isCard) as CardInst[];
  const pots = ((src('potions') as unknown[] | undefined) ?? []).map((p) => (isStr(p) ? p : null));
  const potions = Array.from({ length: Math.max(potionSlots, pots.length) }, (_, i) => pots[i] ?? null);
  const num = (k: keyof LegacyCore, d: number) => (isNum(src(k)) ? (src(k) as number) : d);
  const strs = (k: keyof LegacyCore) => ((src(k) as unknown[] | undefined) ?? []).filter(isStr);
  const state: RunState = {
    version: RUN_STATE_VERSION,
    configVersion: isStr(s.configVersion) ? s.configVersion : 'dev',
    runSeed: s.runSeed >>> 0,
    chapter: s.chapter,
    startedAt: isNum(s.startedAt) ? s.startedAt : isNum(s.timestamp) ? s.timestamp : 0,
    heroMain: s.heroMain ?? '',
    heroSub: s.heroSub ?? '',
    tianming: isNum(s.tianming) ? s.tianming : 0,
    hp: num('hp', 0),
    maxHp: num('maxHp', 0),
    gold: num('gold', 0),
    deck,
    nextUid: deck.reduce((m, c) => Math.max(m, c.uid), 0) + 1,
    relics: strs('relics'),
    potions,
    counters: { shopRefreshUsed: 0, removeUsed: 0 },
    reviveLeft: num('reviveLeft', REVIVES_PER_RUN),
    relicsUsed: strs('relicsUsed'),
    pendingNode,
    map,
    encounters,
    rng: initialRngStates(s.runSeed),
    stats: parseStats(s.stats),
  };
  return { state: cloneRunState(state), kind };
}

/** 退回上一已完成节点：去掉 visited 末尾的当前节点及其组包，current 指向上一个（第 1 层前为 null） */
function rollbackNode(m: MapState): MapState {
  const visited = m.visited.filter((id) => id !== m.current);
  const nodes = m.nodes.map((n) => {
    if (n.id !== m.current) return n;
    const { encounterId: _drop, ...rest } = n as typeof n & { encounterId?: string };
    void _drop;
    return rest;
  });
  return { ...m, nodes, visited, current: visited.length ? visited[visited.length - 1] : null };
}

/** 兼容旧名：旧 RunSave → RunState */
export function fromLegacyRunSave(s: RunSave, potionSlots = 3): RunState {
  return migrateLegacyRunSave(s as LegacySave, potionSlots).state;
}

// ───────── 存储（可注入；PR1 不接入页面） ─────────
export const RUN_STATE_KEY = 'mojuan.runstate.v1';
export const LEGACY_RUN_SAVE_KEY = 'mojuan.run.v1';
export interface RunStateStore {
  get(key: string): string | null;
  set(key: string, v: string): void;
  remove(key: string): void;
}
export type StoreLoad = LoadResult | { ok: false; reason: 'empty' };
/**
 * 读档：新键优先；没有新键时读旧键迁移一次——迁移成功即写新键并删除旧键（只迁移一次）。
 * 读到 'newer' / 'corrupt' 时不改动任何键。
 */
export function loadRunStateFrom(store: RunStateStore, o: LoadOpts = {}): StoreLoad {
  const cur = store.get(RUN_STATE_KEY);
  if (cur) {
    const r = deserializeRunState(cur, o);
    // 同键内结构升级（如 v1→v2）：迁移成功立即回写为当前版本（键名不变，版本写在 state 里）
    if (r.ok && r.migratedFrom !== null) store.set(RUN_STATE_KEY, serializeRunState(r.state));
    if (r.ok) store.remove(LEGACY_RUN_SAVE_KEY);
    return r;
  }
  const legacy = store.get(LEGACY_RUN_SAVE_KEY);
  if (!legacy) return { ok: false, reason: 'empty' };
  const r = deserializeRunState(legacy, o);
  if (r.ok) {
    store.set(RUN_STATE_KEY, serializeRunState(r.state));
    store.remove(LEGACY_RUN_SAVE_KEY);
  }
  return r;
}
export function writeRunStateTo(store: RunStateStore, s: RunState): void {
  store.set(RUN_STATE_KEY, serializeRunState(s));
}
export function clearRunStateIn(store: RunStateStore): void {
  store.remove(RUN_STATE_KEY);
  store.remove(LEGACY_RUN_SAVE_KEY);
}
