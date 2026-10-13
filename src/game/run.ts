/**
 * 局会话：点将「出征」后由 core 创建 run（new Game），并持有本局唯一数据源 RunState（#122）。
 * - state：对外只给深拷贝；改动走 update()，保证外部引用不能意外改到局状态。
 * - rng(stream)：本局各随机流（活对象），serialize / state 时把其内部状态写回 RunState，读档后续抽序列与不中断一致。
 * PR1 只建立 RunState 与序列化；战斗 / HUD / 经济 / 地图仍用各自的状态，PR2 起改为读写这里。
 * 只调用 core 的公开构造函数，不修改 core。战斗页（P1a）接管时替换 io。
 */
import { Game, type BattleIO } from '../core/battle';
import { rngFromState, type StatefulRng } from '../core/rng';
import { ECONOMY } from '../data/economy';
import {
  cloneRunState,
  createRunState,
  deserializeRunState,
  RNG_STREAMS,
  serializeRunState,
  allocCardUid,
  loadRunStateFrom,
  type LoadOpts,
  type LoadResult,
  type PendingNode,
  type RunStateStore,
  type StoreLoad,
  type RngStream,
  type RunState,
  RUN_STATE_KEY,
  writeRunStateTo,
} from './run/state';

/** 占位 IO：战斗页接入前不做任何表现 */
export const NULL_IO: BattleIO = {
  log() {},
  update() {},
  sleep: () => Promise.resolve(),
  showJudge: () => Promise.resolve(),
  respond: () => Promise.resolve(null),
  epiphany: () => Promise.resolve(null),
  onBattleEnd() {},
};

export interface RunParams {
  main: string;
  sub: string;
  seed: number;
}

export interface StartOpts {
  tianming?: number;
  configVersion?: string;
  now?: number;
}

export class RunSession {
  game: Game | null = null;
  params: RunParams | null = null;
  private st: RunState | null = null;
  /** 进节点快照（序列化文本）：节点内中途存档一律写它 */
  private checkpoint: string | null = null;
  private rngs: Partial<Record<RngStream, StatefulRng>> = {};

  start(p: RunParams, io: BattleIO = NULL_IO, o: StartOpts = {}): Game {
    if (p.main === p.sub) throw new Error('主副将不能是同一人');
    this.params = p;
    this.rngs = {};
    this.st = null;
    const st0 = createRunState({
      runSeed: p.seed,
      heroMain: p.main,
      heroSub: p.sub,
      hp: 0,
      deck: [],
      gold: ECONOMY.startGold,
      potionSlots: ECONOMY.potionSlots,
      tianming: o.tianming,
      configVersion: o.configVersion,
      startedAt: o.now,
    });
    this.st = st0;
    this.game = new Game(this.rng('battle'), io, { autoShan: false, main: p.main, sub: p.sub });
    // 初始体力 / 牌组取 core 开局结果（拷贝，不共享引用；PR2 再让 Game 读写 RunState）
    const g = this.game;
    this.update((s) => {
      s.hp = g.p.hp;
      s.maxHp = g.p.maxHp;
      s.deck = g.deckMaster.map((c) => ({ ...c, mods: [...c.mods] }));
      s.nextUid = g.uid + 1;
    });
    return this.game;
  }

  get active() {
    return this.st !== null;
  }
  /** 当前局状态的深拷贝（含各随机流最新状态）；没有局时抛错 */
  get state(): RunState {
    return cloneRunState(this.synced());
  }
  /** 修改局状态：fn 拿到的是副本，返回后整体提交（fn 抛错则不生效） */
  update(fn: (draft: RunState) => void): RunState {
    const draft = cloneRunState(this.synced());
    fn(draft);
    this.st = cloneRunState(draft); // 再拷一次：fn 闭包里留存的 draft 改不到会话
    for (const k of RNG_STREAMS) this.rngs[k]?.setState(draft.rng[k]);
    return cloneRunState(draft);
  }
  /** 本局随机流（同一 stream 返回同一活对象） */
  rng(stream: RngStream): StatefulRng {
    const s = this.need();
    return (this.rngs[stream] ??= rngFromState(s.rng[stream]));
  }
  serialize(): string {
    return serializeRunState(this.synced());
  }
  /** 分配永久卡 uid（RunState.nextUid）；战斗内临时牌用 state.ts 的 tempUidAllocator */
  allocUid(): number {
    let uid = 0;
    this.update((d) => {
      uid = allocCardUid(d);
    });
    return uid;
  }
  /** 当前是否在节点内（已进未完成） */
  get inNode(): PendingNode | null {
    return this.st?.pendingNode ?? null;
  }
  /**
   * 进节点（任何类型）：标记 pendingNode 并记下完整快照（含三条 rng 状态），有 store 则立即写档。
   * 调用方应先把地图 moveTo / 组包写进 RunState（update），再调用本函数。
   */
  enterNode(node: PendingNode, store?: RunStateStore) {
    this.update((d) => {
      d.pendingNode = { id: node.id, type: node.type };
    });
    this.checkpoint = serializeRunState(this.synced());
    store?.set(RUN_STATE_KEY, this.checkpoint);
  }
  /** 节点结算完成：清 pendingNode 并立即写档 */
  completeNode(store?: RunStateStore) {
    this.update((d) => {
      d.pendingNode = null;
    });
    this.checkpoint = null;
    if (store) writeRunStateTo(store, this.synced());
  }
  /** 写档：节点内只写进节点快照（中途不存），节点外写当前状态 */
  save(store: RunStateStore) {
    if (this.st?.pendingNode && this.checkpoint) store.set(RUN_STATE_KEY, this.checkpoint);
    else writeRunStateTo(store, this.synced());
  }
  /** 从存储读档（新键优先，旧键迁移一次） */
  load(store: RunStateStore, o: LoadOpts = {}): StoreLoad {
    const r = loadRunStateFrom(store, o);
    if (!r.ok) return r;
    this.adopt(r.state);
    return { ...r, state: cloneRunState(r.state) };
  }
  /**
   * 读档恢复 RunState 与随机流。失败（损坏 / 版本更新）不改当前会话。
   * PR1 不重建 core Game（game 置 null，由 PR2 用 RunState 建战斗）。
   */
  resume(text: string | null | undefined, o: LoadOpts = {}): LoadResult {
    const r = deserializeRunState(text, o);
    if (!r.ok) return r;
    this.adopt(r.state);
    return { ...r, state: cloneRunState(r.state) };
  }
  private adopt(st: RunState) {
    this.st = cloneRunState(st);
    this.rngs = {};
    this.game = null;
    this.checkpoint = st.pendingNode ? serializeRunState(st) : null;
    this.params = { main: st.heroMain, sub: st.heroSub, seed: st.runSeed };
  }
  /** 结束本局（结算 / 放弃） */
  clear() {
    this.st = null;
    this.checkpoint = null;
    this.rngs = {};
    this.game = null;
    this.params = null;
  }

  private need(): RunState {
    if (!this.st) throw new Error('当前没有进行中的局');
    return this.st;
  }
  /** 把活随机流的内部状态写回 RunState */
  private synced(): RunState {
    const s = this.need();
    for (const k of RNG_STREAMS) {
      const r = this.rngs[k];
      if (r) s.rng[k] = r.getState();
    }
    return s;
  }
}
