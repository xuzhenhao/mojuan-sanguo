/**
 * 地图会话：持有本局 mapState 与组包状态，负责走节点、抽组包、写盘（进战斗节点时先写盘再播动画，PRD 21.4）。
 * 规则在 src/core/run；这里只做编排与持久化。
 */
import { availableNodes, generateMap, getNode, moveTo, type MapConfig, type MapNode, type MapState } from '../../core/run/map';
import { drawEncounter, groupOf, newEncounterState, type EncounterPools, type EncounterState } from '../../core/run/encounters';
import type { StorageAdapter } from '../../platform/types';
import { routeFor } from './route';

export const MAP_SAVE_KEY = 'mojuan.run.map';

export interface HudInfo {
  hp: number;
  maxHp: number;
  gold: number;
  potions: (string | null)[];
  hero: string;
}

export interface MapSaveSlice {
  runSeed: number;
  chapter: number;
  mapState: MapState;
  encounters: EncounterState;
}

export class MapSession {
  state: MapState;
  enc: EncounterState;
  constructor(
    readonly runSeed: number,
    readonly chapter: number,
    readonly cfg: MapConfig,
    readonly pools: EncounterPools,
    private storage: StorageAdapter | null = null,
    restore?: MapSaveSlice | null,
  ) {
    const ok = restore && restore.runSeed === runSeed && restore.chapter === chapter;
    this.state = ok ? restore.mapState : generateMap(runSeed, chapter, cfg);
    this.enc = ok ? restore.encounters : newEncounterState();
  }
  static load(storage: StorageAdapter | null): MapSaveSlice | null {
    try {
      const raw = storage?.get(MAP_SAVE_KEY);
      return raw ? (JSON.parse(raw) as MapSaveSlice) : null;
    } catch {
      return null;
    }
  }
  get available() {
    return availableNodes(this.state);
  }
  node(id: string): MapNode | undefined {
    return getNode(this.state, id);
  }
  save() {
    const slice: MapSaveSlice = { runSeed: this.runSeed, chapter: this.chapter, mapState: this.state, encounters: this.enc };
    this.storage?.set(MAP_SAVE_KEY, JSON.stringify(slice));
  }
  /** 走到节点：抽组包（战斗类）→ 写盘 → 返回路由事件与参数 */
  enter(id: string) {
    const n = this.node(id);
    if (!n) throw new Error(`未知节点 ${id}`);
    let enc: { encounterId: string; name: string; enemies: string[] } | undefined;
    let patch: Partial<MapNode> = {};
    if (n.type === 'BATTLE' || n.type === 'ELITE' || n.type === 'BOSS') {
      const d = drawEncounter(this.runSeed, this.chapter, n.type, this.enc, this.pools);
      this.enc = d.state;
      enc = { encounterId: d.encounterId, name: d.group.name, enemies: d.group.enemies };
      patch = { encounterId: d.encounterId };
    }
    this.state = moveTo(this.state, id, patch);
    this.save();
    return routeFor(this.chapter, this.node(id)!, enc);
  }
  group(encounterId: string) {
    return groupOf(encounterId, this.pools);
  }
}
