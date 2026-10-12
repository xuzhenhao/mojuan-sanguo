/**
 * 局内统计 RunStats（PRD 21.4 `stats`，供 P5 结算页 PRD 14.5 使用）。
 * 共享给战斗页 / 地图 / 奖励等模块记账，存进 RunSave.stats。纯数据 + 纯函数，不依赖 src/core。
 */

/** PRD 21.4 stats { battlesWon, elitesKilled, bossKilled, turns, dmgDealt, dmgTaken, maxTurnLoss, epiphanies } */
export interface RunStats {
  /** 战斗胜利场次（含精英、Boss） */
  battlesWon: number;
  /** 精英战胜利场次 */
  elitesKilled: number;
  /** Boss 战胜利场次 */
  bossKilled: number;
  /** 总回合数（我方回合，跨所有战斗累计） */
  turns: number;
  /** 造成伤害合计（对敌人体力的实际扣减，不含被护甲抵消的部分） */
  dmgDealt: number;
  /** 承受伤害合计（主将体力的实际扣减，不含被护甲抵消的部分） */
  dmgTaken: number;
  /** 最大单回合掉血（一个敌方回合内主将体力扣减的最大值） */
  maxTurnLoss: number;
  /** 灵光一闪触发次数 */
  epiphanies: number;
}

export const RUN_STATS_KEYS = [
  'battlesWon',
  'elitesKilled',
  'bossKilled',
  'turns',
  'dmgDealt',
  'dmgTaken',
  'maxTurnLoss',
  'epiphanies',
] as const satisfies readonly (keyof RunStats)[];

/** 全 0 */
export function emptyStats(): RunStats {
  return { battlesWon: 0, elitesKilled: 0, bossKilled: 0, turns: 0, dmgDealt: 0, dmgTaken: 0, maxTurnLoss: 0, epiphanies: 0 };
}

/** 合并两段统计（例如本局累计 + 一场战斗的增量）：maxTurnLoss 取最大，其余相加。不修改入参 */
export function mergeStats(a: RunStats, b: Partial<RunStats>): RunStats {
  const out = { ...a };
  for (const k of RUN_STATS_KEYS) {
    const v = b[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[k] = k === 'maxTurnLoss' ? Math.max(out[k], v) : out[k] + v;
  }
  return out;
}

/** 一场战斗结束时的增量：战斗类型决定胜场/精英/Boss 计数 */
export function battleResultDelta(kind: 'normal' | 'elite' | 'boss', win: boolean): Partial<RunStats> {
  if (!win) return {};
  return { battlesWon: 1, elitesKilled: kind === 'elite' ? 1 : 0, bossKilled: kind === 'boss' ? 1 : 0 };
}

/** 宽松读取（存档里缺字段或类型不对的项按 0） */
export function parseStats(raw: unknown): RunStats {
  const s = (raw ?? {}) as Partial<Record<keyof RunStats, unknown>>;
  const out = emptyStats();
  for (const k of RUN_STATS_KEYS) if (typeof s[k] === 'number' && Number.isFinite(s[k])) out[k] = s[k] as number;
  return out;
}
