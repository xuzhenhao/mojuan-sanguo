/**
 * 地图会话：持有本局 mapState 与组包状态，负责走节点、抽组包、写盘（进战斗节点时先写盘再播动画，PRD 21.4）。
 * 规则在 src/core/run；这里只做编排与持久化。
 */
import { availableNodes, generateMap, getNode, moveTo, type MapConfig, type MapNode, type MapState } from '../../core/run/map';
import { drawEncounter, groupOf, newEncounterState, type EncounterPools, type EncounterState } from '../../core/run/encounters';
import { loadRunSave, writeRunSave, type RunSave } from '../../core/run/save';
import { isComingSoon, routeFor } from './route';

export interface HudInfo {
  hp: number;
  maxHp: number;
  gold: number;
  potions: (string | null)[];
  hero: string;
}

/** 局状态未统一前，没有 RunSave 时用这些字段新建一份（地图页直达 / 调试） */
export type RunSaveBase = Omit<RunSave, 'runSeed' | 'chapter' | 'mapState' | 'encounters' | 'nodePath' | 'timestamp'>;

const DEFAULT_BASE = (): RunSaveBase => ({
  schema: 1,
  version: '0.2.0',
  configVersion: 'dev',
  heroMain: '',
  heroSub: '',
  hp: 0,
  maxHp: 0,
  gold: 0,
  deck: [],
  relics: [],
  potions: [],
  battleState: null,
  battleStartSnapshot: null,
});

export class MapSession {
  state: MapState;
  enc: EncounterState;
  constructor(
    readonly runSeed: number,
    readonly chapter: number,
    readonly cfg: MapConfig,
    readonly pools: EncounterPools,
    /** 存档写入：null = 不落盘（测试） */
    private persist: { load(): RunSave | null; write(s: RunSave): void } | null = { load: loadRunSave, write: writeRunSave },
    private base: () => RunSaveBase = DEFAULT_BASE,
    private now: () => number = () => Date.now(),
  ) {
    const saved = persist?.load();
    const ok = saved && saved.runSeed === runSeed && saved.chapter === chapter;
    this.state = ok ? saved.mapState : generateMap(runSeed, chapter, cfg);
    this.enc = ok ? saved.encounters : newEncounterState();
  }
  /** 存档里的局种子（续玩用） */
  static savedSeed(load: () => RunSave | null = loadRunSave): number | null {
    return load()?.runSeed ?? null;
  }
  /** 地图状态并进 RunSave（mojuan.run.v1）：已有同局存档则只更新 mapState / encounters / nodePath */
  save() {
    const prev = this.persist?.load();
    const same = prev && prev.runSeed === this.runSeed && prev.chapter === this.chapter;
    const head = same ? prev : { ...this.base(), runSeed: this.runSeed, chapter: this.chapter };
    this.persist?.write({ ...head, mapState: this.state, encounters: this.enc, nodePath: [...this.state.visited], timestamp: this.now() } as RunSave);
  }
  get available() {
    return availableNodes(this.state);
  }
  node(id: string): MapNode | undefined {
    return getNode(this.state, id);
  }
  /** 营地/奇遇（页面未实现）：只走到节点并写盘，不路由（否则第 8 层固定营地会卡住去 Boss 的路） */
  pass(id: string) {
    this.state = moveTo(this.state, id);
    this.save();
  }
  /** 走到节点：抽组包（战斗类）→ 写盘 → 返回路由事件与参数 */
  enter(id: string) {
    const n = this.node(id);
    if (!n) throw new Error(`未知节点 ${id}`);
    if (isComingSoon(n.type)) throw new Error(`${n.type} 节点用 pass()`);
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
