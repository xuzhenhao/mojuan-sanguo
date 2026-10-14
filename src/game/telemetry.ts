/**
 * 埋点（#202）：本模块只负责字段与缓冲，发送交给平台 transport（platform.telemetry.send）。
 * - track 写入内存环形缓冲（调试查看）并进待发队列；满 BATCH_MAX 条或 flushTelemetry()（boot 在切后台时调）时批量发送。
 * - 未绑定 transport（单测 / 启动前）只缓冲不发送。
 */
import type { TelemetryEvent, TelemetryTransport } from '../platform/types';

const BUF_MAX = 200;
export const BATCH_MAX = 20;
export const telemetryLog: TelemetryEvent[] = [];
let pending: TelemetryEvent[] = [];
let transport: TelemetryTransport | null = null;
let clock: () => number = () => 0;

/** boot 绑定平台 transport 与时钟；传 null 解绑 */
export function bindTelemetry(t: TelemetryTransport | null, now?: () => number) {
  transport = t;
  if (now) clock = now;
}
export function flushTelemetry() {
  if (!transport || !pending.length) return;
  const batch = pending;
  pending = [];
  try {
    transport.send(batch);
  } catch {
    // 传输失败不影响游戏（埋点尽力而为）
  }
}
export function track(ev: string, data: Record<string, unknown> = {}) {
  const e: TelemetryEvent = { ev, data, t: clock() };
  telemetryLog.push(e);
  if (telemetryLog.length > BUF_MAX) telemetryLog.shift();
  pending.push(e);
  if (pending.length > BUF_MAX) pending.shift();
  if (pending.length >= BATCH_MAX) flushTelemetry();
}
/** 单测用：清空缓冲与绑定 */
export function resetTelemetry() {
  telemetryLog.length = 0;
  pending = [];
  transport = null;
  clock = () => 0;
}

// ───────── 对局埋点字段（#181）：事件名与字段白名单，见 docs/specs/telemetry-181.md ─────────
/** 节点 / 战斗分类：minion = 普通战，elite = 精英，boss = Boss */
export type BattleTag = 'minion' | 'elite' | 'boss';
/** 敌人 config yaml `tier`（schema 枚举：小怪 / 精英 / Boss）→ 埋点标签 */
const TIER_TAG: Record<string, BattleTag> = { 小怪: 'minion', 精英: 'elite', Boss: 'boss' };
const TAG_RANK: Record<BattleTag, number> = { minion: 0, elite: 1, boss: 2 };
/** 本场战斗标签：取参战敌人 config tier 的最高档（不按敌人 id 判断）；无 tier 信息时为 minion */
export function battleTagOf(enemies: readonly { tier?: string }[]): BattleTag {
  let tag: BattleTag = 'minion';
  for (const e of enemies) {
    const t = e.tier ? TIER_TAG[e.tier] : undefined;
    if (t && TAG_RANK[t] > TAG_RANK[tag]) tag = t;
  }
  return tag;
}

/** 每个事件允许上报的字段；不在表内的字段一律丢弃（防误传 PII / 存档大对象） */
export const MATCH_EVENTS = {
  run_start: ['hero_main', 'hero_sub', 'tianming', 'chapter'],
  node_enter: ['node_id', 'node_type', 'layer', 'chapter'],
  card_pick: ['card_id', 'skipped', 'offered', 'battle_tag', 'chapter'],
  battle_end: ['battle_tag', 'win', 'node_id', 'layer', 'chapter', 'turns', 'plays_per_turn', 'loop_plays', 'dmg_taken', 'dmg_dealt', 'enemies'],
  damage_taken: ['source', 'amount', 'battle_tag', 'layer'],
  death: ['node_id', 'node_type', 'layer', 'chapter', 'source', 'tianming'],
  run_end: ['result', 'abandoned', 'chapter', 'layer', 'tianming', 'boss_node', 'death_node', 'duration_ms', 'soul', 'runSeed'],
  run_abandon: ['entry', 'layer', 'chapter'],
  /** #183 开发版 FPS 窗口报告（engine.setFpsSink） */
  perf_sample: ['avg_fps', 'low1_fps', 'verdict', 'frames'],
} as const;
export type MatchEvent = keyof typeof MATCH_EVENTS;
type Fields<E extends MatchEvent> = Partial<Record<(typeof MATCH_EVENTS)[E][number], unknown>>;

/** 按白名单裁字段并丢 undefined */
export function pickFields<E extends MatchEvent>(ev: E, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of MATCH_EVENTS[ev] as readonly string[]) if (data[k] !== undefined) out[k] = data[k];
  return out;
}

/** 类型化埋点：字段受白名单约束 */
export function trackMatch<E extends MatchEvent>(ev: E, data: Fields<E>, sink: (ev: string, d: Record<string, unknown>) => void = track) {
  sink(ev, pickFields(ev, data as Record<string, unknown>));
}

/** 战斗结束字段（回合数 / 每回合出牌 / 循环牌次数 / 精英 vs 小怪） */
export function battleEndFields(
  g: { turn: number; playsByTurn?: number[]; loopPlays?: number; en: { id: string; hp: number; max: number; tier?: string }[]; p: { hp: number } },
  o: { win: boolean; tag: BattleTag; hpBefore: number; nodeId?: string; layer?: number; chapter?: number },
): Fields<'battle_end'> {
  return {
    battle_tag: o.tag,
    win: o.win,
    node_id: o.nodeId,
    layer: o.layer,
    chapter: o.chapter,
    turns: g.turn,
    plays_per_turn: [...(g.playsByTurn ?? [])],
    loop_plays: g.loopPlays ?? 0,
    dmg_taken: Math.max(0, o.hpBefore - Math.max(0, g.p.hp)),
    dmg_dealt: g.en.reduce((n, e) => n + Math.max(0, e.max - Math.max(0, e.hp)), 0),
    enemies: g.en.map((e) => e.id),
  };
}
