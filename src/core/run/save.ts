/**
 * 局存档（PRD 21.4）中与地图相关的部分 + 续玩版本规则。
 * - 每场结算后自动存档（autosaveAfterBattle）；进入战斗节点时先写 battleStartSnapshot 再播动画（enterBattle）。
 * - 续玩时 configVersion 不一致：存档停在战斗中 → 退回本场战斗开始前（battleStartSnapshot），需弹 version 提示；
 *   不在战斗中 → 静默用新配置继续。
 */
import type { MapState } from './map';
import type { EncounterState } from './encounters';

/** 进入战斗前的局状态（体力、牌组、铜钱、宝物、丹药、地图路线） */
export interface RunCore {
  hp: number;
  maxHp: number;
  gold: number;
  deck: unknown[];
  relics: string[];
  potions: string[];
  mapState: MapState;
  encounters: EncounterState;
}

export interface RunSave extends RunCore {
  schema: 1;
  version: string;
  configVersion: string;
  runSeed: number;
  chapter: number;
  heroMain: string;
  heroSub: string;
  nodePath: string[];
  /** 战斗中存档的快照（由战斗页提供，地图不解析） */
  battleState: unknown | null;
  /** 进入战斗节点时写入，回滚用 */
  battleStartSnapshot: RunCore | null;
  timestamp: number;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const coreOf = (s: RunSave): RunCore =>
  clone({ hp: s.hp, maxHp: s.maxHp, gold: s.gold, deck: s.deck, relics: s.relics, potions: s.potions, mapState: s.mapState, encounters: s.encounters });

/** 进战斗节点：写入战斗开始快照（此时 mapState 已走到该节点） */
export function enterBattle(s: RunSave, now: number): RunSave {
  return { ...s, battleStartSnapshot: coreOf(s), battleState: null, timestamp: now };
}
/** 战斗内每次结算后：只更新 battleState */
export function autosaveBattle(s: RunSave, battleState: unknown, now: number): RunSave {
  return { ...s, battleState, timestamp: now };
}
/** 一场战斗结算（胜利）后：清掉战斗快照，写入战后局状态 */
export function autosaveAfterBattle(s: RunSave, after: Partial<RunCore>, now: number): RunSave {
  return { ...s, ...clone(after), battleState: null, battleStartSnapshot: null, timestamp: now };
}

export type ResumeResult =
  | { kind: 'ok'; save: RunSave } // 版本一致：恢复到最近决策点
  | { kind: 'silent_upgrade'; save: RunSave } // 不在战斗中：静默用新配置
  | { kind: 'rollback_battle'; save: RunSave; dialog: 'version' }; // 战斗从第 1 回合重开，弹 version 对话框

export const VERSION_DIALOG_TEXT = '游戏已更新。为保证规则一致，本场战斗将从头开始；进入本场战斗前的进度（体力、牌组、铜钱、地图路线）均已保留。';

export function resumeRun(s: RunSave, currentConfigVersion: string): ResumeResult {
  if (s.configVersion === currentConfigVersion) return { kind: 'ok', save: s };
  const inBattle = s.battleState != null || s.battleStartSnapshot != null;
  if (!inBattle) return { kind: 'silent_upgrade', save: { ...s, configVersion: currentConfigVersion } };
  const snap = s.battleStartSnapshot;
  if (!snap) throw new Error('战斗中存档缺少 battleStartSnapshot');
  return {
    kind: 'rollback_battle',
    dialog: 'version',
    save: { ...s, ...clone(snap), configVersion: currentConfigVersion, battleState: null, battleStartSnapshot: clone(snap) },
  };
}

// ───────── 存储读写（可注入；默认 localStorage） ─────────
export const RUN_SAVE_KEY = 'mojuan.run.v1';

/** 最小 KV 存储接口（与 platform StorageAdapter 兼容） */
export interface RunSaveStore {
  get(key: string): string | null;
  set(key: string, v: string): void;
  remove(key: string): void;
}

function defaultStore(): RunSaveStore | null {
  const ls = (globalThis as { localStorage?: Storage }).localStorage;
  if (!ls) return null;
  return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v), remove: (k) => ls.removeItem(k) };
}
let injected: RunSaveStore | null | undefined;
/** 注入存储层（测试用内存 mock；微信端注入 wx 存储）。传 undefined 恢复默认 localStorage */
export function setRunSaveStore(s: RunSaveStore | null | undefined): void {
  injected = s;
}
const store = (): RunSaveStore | null => (injected === undefined ? defaultStore() : injected);

/** 结构校验：字段缺失或类型不对视为损坏 */
export function isRunSave(x: unknown): x is RunSave {
  const s = x as RunSave;
  return (
    !!s &&
    typeof s === 'object' &&
    s.schema === 1 &&
    typeof s.configVersion === 'string' &&
    typeof s.runSeed === 'number' &&
    typeof s.chapter === 'number' &&
    typeof s.hp === 'number' &&
    typeof s.maxHp === 'number' &&
    typeof s.gold === 'number' &&
    Array.isArray(s.deck) &&
    !!s.mapState &&
    Array.isArray(s.mapState.nodes) &&
    Array.isArray(s.mapState.edges) &&
    Array.isArray(s.mapState.visited) &&
    !!s.encounters
  );
}
export function hasRunSave(): boolean {
  return loadRunSave() !== null;
}
/** 读档；无存档、JSON 损坏或结构不符返回 null */
export function loadRunSave(): RunSave | null {
  try {
    const raw = store()?.get(RUN_SAVE_KEY);
    if (!raw) return null;
    const s: unknown = JSON.parse(raw);
    return isRunSave(s) ? s : null;
  } catch {
    return null;
  }
}
export function writeRunSave(s: RunSave): void {
  store()?.set(RUN_SAVE_KEY, JSON.stringify(s));
}
export function clearRunSave(): void {
  store()?.remove(RUN_SAVE_KEY);
}
