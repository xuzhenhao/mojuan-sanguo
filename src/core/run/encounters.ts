/**
 * 战斗组包抽取（PRD 10.5）：按场次分池，池内等权，同一池不连续抽到同一组合。
 * 随机流与地图生成分开（encounterSeed 由 runSeed 派生），读档后抽取结果不变。
 */
import { seeded } from '../rng';
import { hashSeed, type NodeType } from './map';

export type PoolName = 'easy' | 'normal' | 'elite' | 'boss';
export interface EncounterGroup {
  name: string;
  enemies: string[];
}
export interface EncounterPools {
  pools: Record<PoolName, EncounterGroup[]>;
  rules: { easyBattles: number; noRepeatInPool: boolean };
}
/** 存档用：已打普通战场次、各池上一次抽到的下标、抽取次数（用于派生随机数） */
export interface EncounterState {
  normalFought: number;
  last: Partial<Record<PoolName, number>>;
  draws: number;
}
export const newEncounterState = (): EncounterState => ({ normalFought: 0, last: {}, draws: 0 });

export function poolFor(type: NodeType, st: EncounterState, cfg: EncounterPools): PoolName | null {
  if (type === 'BATTLE') return st.normalFought < cfg.rules.easyBattles ? 'easy' : 'normal';
  if (type === 'ELITE') return 'elite';
  if (type === 'BOSS') return 'boss';
  return null;
}

/** 抽一个组合；encounterId = `${pool}:${下标}` */
export function drawEncounter(runSeed: number | string, chapter: number, type: NodeType, st: EncounterState, cfg: EncounterPools) {
  const pool = poolFor(type, st, cfg);
  if (!pool) throw new Error(`${type} 节点没有战斗`);
  const list = cfg.pools[pool];
  const rng = seeded(hashSeed(runSeed, 'encounter', chapter, st.draws));
  let idx = Math.floor(rng() * list.length);
  const prev = st.last[pool];
  if (cfg.rules.noRepeatInPool && list.length > 1 && idx === prev) idx = (idx + 1 + Math.floor(rng() * (list.length - 1))) % list.length;
  const next: EncounterState = {
    normalFought: st.normalFought + (type === 'BATTLE' ? 1 : 0),
    last: { ...st.last, [pool]: idx },
    draws: st.draws + 1,
  };
  return { pool, index: idx, encounterId: `${pool}:${idx}`, group: list[idx], state: next };
}

export function groupOf(encounterId: string, cfg: EncounterPools): EncounterGroup | undefined {
  const [pool, i] = encounterId.split(':');
  return cfg.pools[pool as PoolName]?.[Number(i)];
}
