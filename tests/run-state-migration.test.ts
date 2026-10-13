/** runstate-migration.md §7 验收（#122）：旧档迁移、进节点快照 / 中途刷新、提示钩子、存储键迁移、uid 号段 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/battle';
import { enemyIntent } from '../src/core/rules';
import { generateMap, moveTo } from '../src/core/run/map';
import { MAP_CONFIG } from '../src/data/map';
import { RunSession } from '../src/game/run';
import { demoInventory } from '../src/game/economy/session';
import { openShop } from '../src/game/economy/shop';
import {
  allocCardUid,
  deserializeRunState,
  initialRngStates,
  isTempUid,
  LEGACY_RUN_SAVE_KEY,
  loadRunStateFrom,
  noticeText,
  RUN_STATE_KEY,
  serializeRunState,
  TEMP_UID_BASE,
  tempUidAllocator,
  type RunState,
} from '../src/game/run/state';
import { mkIO } from './helpers';

const mem = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
};
const card = (uid: number, id = 'B001', mods: string[] = []) => ({ uid, id, suit: 'S', rank: 7, mods });

/** 走到第一个战斗节点（第 1 层）：地图 current = 该节点，并抽了组包 */
function legacy(o: { inBattle: boolean; snap?: Record<string, unknown> | null; extraTop?: Record<string, unknown>; configVersion?: string }) {
  const map0 = generateMap(8, 1, MAP_CONFIG);
  const done = moveTo(map0, map0.nodes.find((n) => n.layer === 1)!.id); // 上一已完成节点：第 1 层
  const l2 = done.edges.find(([a]) => a === done.current)![1];
  const atNode = moveTo(done, l2, { encounterId: 'normal:0' });
  // 顶层 = 上一已完成节点状态（旧档战斗中只更新 battleState）
  const top = {
    schema: 1,
    version: '0.2.0',
    configVersion: o.configVersion ?? 'dev',
    runSeed: 8,
    chapter: 1,
    heroMain: 'H01',
    heroSub: 'H08',
    hp: 6,
    maxHp: 9,
    gold: 40,
    deck: [card(1), card(2, 'B004')],
    relics: ['R15'],
    potions: ['P01'],
    reviveLeft: 1,
    relicsUsed: [],
    mapState: o.inBattle ? atNode : done,
    encounters: { normalFought: 1, last: {}, draws: 2 },
    nodePath: [],
    battleState: o.inBattle ? { turn: 3, hand: [9, 9] } : null,
    battleStartSnapshot: o.snap === undefined ? null : o.snap,
    timestamp: 5,
    ...o.extraTop,
  };
  return { top, done, atNode, l2 };
}
const fullSnap = (atNode: unknown) => ({
  hp: 7,
  maxHp: 9,
  gold: 41,
  deck: [card(1, 'B001', ['E_S01']), card(2, 'B004')],
  relics: ['R15'],
  potions: ['P01', 'P03'],
  reviveLeft: 1,
  relicsUsed: [],
  mapState: atNode,
  encounters: { normalFought: 1, last: {}, draws: 2 },
});

describe('旧档迁移（runstate-migration.md §1–§4）', () => {
  it('战斗中 + 完整快照 → 回到节点开打前（pendingNode=该节点、未完成），无 battleState，提示 = 有快照；回退值全取快照', () => {
    const a = legacy({ inBattle: true });
    // 战斗中途：顶层被改成「战斗中当前值」（模拟用掉复活/丹药/七星灯），快照保留开打前
    const top = { ...a.top, battleStartSnapshot: fullSnap(a.atNode), reviveLeft: 0, potions: [], relicsUsed: ['R15'], hp: 1 };
    const r = deserializeRunState(JSON.stringify(top));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migration).toEqual({ kind: 'battle_rollback' });
    expect(r.notice).toBe('migrate_battle_restart');
    expect(noticeText(r.notice)).toBe('存档已更新，本场战斗重新开始');
    const s = r.state;
    expect(s.pendingNode).toEqual({ id: a.l2, type: a.atNode.nodes.find((n) => n.id === a.l2)!.type });
    expect(s.map!.current).toBe(a.l2);
    expect(s.map!.nodes.find((n) => n.id === a.l2)!.encounterId).toBe('normal:0'); // 重打同一组包
    expect('battleState' in s).toBe(false);
    expect([s.hp, s.gold, s.reviveLeft, s.relicsUsed, s.potions]).toEqual([7, 41, 1, [], ['P01', 'P03', null]]);
    expect(s.deck[0].mods).toEqual(['E_S01']);
    // 不判负、不跳过、不发奖励：体力 > 0、战斗胜场 0、节点未进入下一层
    expect(s.hp).toBeGreaterThan(0);
    expect(s.stats.battlesWon).toBe(0);
  });
  it('快照缺复活 / 丹药 / 一次性宝物 → 该项取上一已完成节点（顶层），不取战斗中当前值', () => {
    const a = legacy({ inBattle: true });
    const snap = fullSnap(a.atNode) as Record<string, unknown>;
    delete snap.reviveLeft;
    delete snap.potions;
    delete snap.relicsUsed;
    const r = deserializeRunState(JSON.stringify({ ...a.top, battleStartSnapshot: snap }));
    expect(r.ok && [r.state.reviveLeft, r.state.potions, r.state.relicsUsed, r.state.hp]).toEqual([1, ['P01', null, null], [], 7]);
  });
  it('无快照 → 退回上一已完成节点完整状态，提示 = 无快照；节点重新可选', () => {
    const a = legacy({ inBattle: true, snap: null });
    const r = deserializeRunState(JSON.stringify(a.top));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migration).toEqual({ kind: 'node_rollback' });
    expect(r.notice).toBe('migrate_node_rollback');
    expect(noticeText(r.notice)).toBe('存档已更新，已回到上一处');
    expect(r.state.pendingNode).toBeNull();
    expect(r.state.map!.current).toBe(a.done.current);
    expect(r.state.map!.visited).toEqual(a.done.visited);
    expect(r.state.map!.nodes.find((n) => n.id === a.l2)!.encounterId).toBeUndefined();
    expect([r.state.hp, r.state.gold, r.state.stats.battlesWon]).toEqual([6, 40, 0]);
  });
  it('非战斗中旧档 → 字段映射，无回退、无提示', () => {
    const a = legacy({ inBattle: false });
    const r = deserializeRunState(JSON.stringify(a.top));
    expect(r.ok && [r.migration, r.notice, r.state.pendingNode, r.state.hp, r.state.map!.current]).toEqual([{ kind: 'none' }, null, null, 6, a.done.current]);
  });
  it('配置版本不一致 + 旧档迁移 → 只要确认框（config_confirm，无 toast 文案），回退点取更早者（无快照时退回上一节点）', () => {
    const a = legacy({ inBattle: true, snap: null, configVersion: 'old' });
    const r = deserializeRunState(JSON.stringify(a.top), { configVersion: 'new' });
    expect(r.ok && [r.configChanged, r.notice, r.migration?.kind, r.state.map!.current]).toEqual([true, 'config_confirm', 'node_rollback', a.done.current]);
    expect(noticeText('config_confirm')).toBeNull();
    const b = legacy({ inBattle: true, configVersion: 'old' });
    const rb = deserializeRunState(JSON.stringify({ ...b.top, battleStartSnapshot: fullSnap(b.atNode) }), { configVersion: 'new' });
    expect(rb.ok && [rb.notice, rb.state.pendingNode?.id]).toEqual(['config_confirm', b.l2]); // 两者回退点相同：本场开打前
  });
  it('迁移只发生一次：旧键迁移后写新键、删旧键；再序列化/读档一致，不再迁移；同一存档读两次随机结果一致', () => {
    const a = legacy({ inBattle: true });
    const store = mem();
    store.set(LEGACY_RUN_SAVE_KEY, JSON.stringify({ ...a.top, battleStartSnapshot: fullSnap(a.atNode) }));
    const r1 = loadRunStateFrom(store);
    expect(r1.ok && r1.migratedFrom).toBe(0);
    expect(store.get(LEGACY_RUN_SAVE_KEY)).toBeNull();
    expect(store.get(RUN_STATE_KEY)).not.toBeNull();
    const r2 = loadRunStateFrom(store);
    expect(r2.ok && [r2.migratedFrom, r2.migration]).toEqual([null, null]);
    if (!r1.ok || !r2.ok) return;
    expect(r2.state).toEqual(r1.state);
    expect(serializeRunState(r2.state)).toBe(store.get(RUN_STATE_KEY));
    expect(r1.state.rng).toEqual(initialRngStates(8));
    const draws = () => {
      const s = new RunSession();
      s.load(store);
      return [s.rng('battle')(), s.rng('economy')(), s.rng('event')()];
    };
    expect(draws()).toEqual(draws());
  });
  it('存储：新键优先；空 → empty；更新版本 / 损坏不动任何键', () => {
    const store = mem();
    expect(loadRunStateFrom(store)).toEqual({ ok: false, reason: 'empty' });
    store.set(LEGACY_RUN_SAVE_KEY, '{bad');
    expect(loadRunStateFrom(store)).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(store.get(LEGACY_RUN_SAVE_KEY)).toBe('{bad');
    const s = new RunSession();
    s.start({ main: 'H01', sub: 'H08', seed: 3 });
    s.save(store);
    expect(loadRunStateFrom(store).ok).toBe(true); // 新键在，旧键忽略
    store.set(RUN_STATE_KEY, JSON.stringify({ ...JSON.parse(store.get(RUN_STATE_KEY)!), version: 99 }));
    const before = store.get(RUN_STATE_KEY);
    expect(loadRunStateFrom(store)).toMatchObject({ ok: false, reason: 'newer' });
    expect(store.get(RUN_STATE_KEY)).toBe(before);
  });
});

describe('进节点快照 / 节点中途刷新（§5）', () => {
  const begin = (seed = 2026) => {
    const s = new RunSession();
    s.start({ main: 'H01', sub: 'H08', seed });
    return s;
  };
  /** 刷新：从 store 读档到新会话 */
  const reload = (store: ReturnType<typeof mem>) => {
    const s = new RunSession();
    const r = s.load(store);
    return { s, r };
  };
  it('战斗中途刷新 → 回到开打前重打，前 3 回合手牌与敌人意图与第一次完全一致；toast「已回到本场战斗开打前」', async () => {
    const store = mem();
    const s1 = begin();
    s1.enterNode({ id: 'L1C1', type: 'BATTLE' }, store);
    const play = async (s: RunSession) => {
      const g = new Game(s.rng('battle'), mkIO(), { autoShan: false, main: 'H01', sub: 'H08' });
      g.p.hp = g.p.maxHp = 99; // 只看发牌与意图：不让被动挨打提前结束
      g.startBattle();
      const log: string[] = [];
      for (let t = 0; t < 3 && !g.over; t++) {
        log.push(
          `T${g.turn} hand=${g.hand.map((c) => c.id + c.suit + c.rank).join(',')} intents=${g
            .alive()
            .map((e) => enemyIntent(e).txt)
            .join('|')}`,
        );
        await g.endTurn(g.hand.slice(0, g.discardNeeded()));
      }
      return { log, g };
    };
    const first = await play(s1);
    expect(first.log).toHaveLength(3);
    // 战斗中途：内存状态被改（掉血），save 只写进节点快照
    s1.update((d) => {
      d.hp = 1;
    });
    s1.save(store);
    const { s: s2, r } = reload(store);
    expect(r.ok && r.notice).toBe('node_restart');
    expect(noticeText('node_restart', s2.inNode)).toBe('已回到本场战斗开打前');
    expect(s2.state.hp).toBe(begin().state.hp); // 开打前体力（中途掉的血不写档）
    expect(s2.inNode).toEqual({ id: 'L1C1', type: 'BATTLE' });
    const second = await play(s2);
    expect(second.log).toEqual(first.log);
  });
  it('事件中途刷新：V04 押输后刷新再押仍输（event 流等价抽取：roll < 0.5 为赢；#91 合入后换真事件）', () => {
    // 找一个首抽押输的种子
    let seed = 1;
    for (; seed < 200; seed++) if (begin(seed).rng('event')() >= 0.5) break;
    const store = mem();
    const s1 = begin(seed);
    s1.update((d) => {
      d.gold = 100;
    });
    s1.enterNode({ id: 'L3C2', type: 'EVENT' }, store);
    const bet = (s: RunSession) => {
      const win = s.rng('event')() < 0.5;
      s.update((d) => {
        d.gold += win ? 40 : -30;
      });
      return win;
    };
    expect(bet(s1)).toBe(false);
    s1.save(store); // 中途：仍写进节点快照
    const { s: s2, r } = reload(store);
    expect(r.ok && noticeText(r.notice, s2.inNode)).toBe('已回到进入此处前');
    expect(s2.state.gold).toBe(100);
    expect(bet(s2)).toBe(false);
    expect(s2.state.gold).toBe(70);
  });
  it('商店中途刷新 → 货架与第一次一致；非战斗节点 toast「已回到进入此处前」', () => {
    const store = mem();
    const s1 = begin(77);
    s1.enterNode({ id: 'L2C1', type: 'SHOP' }, store);
    const shelf1 = openShop(s1.rng('economy'), demoInventory());
    const { s: s2, r } = reload(store);
    const shelf2 = openShop(s2.rng('economy'), demoInventory());
    expect(shelf2).toEqual(shelf1);
    expect(r.ok && noticeText(r.notice, s2.inNode)).toBe('已回到进入此处前');
    for (const type of ['EVENT', 'SHOP', 'CHEST', 'REST']) expect(noticeText('node_restart', { id: 'x', type })).toBe('已回到进入此处前');
    for (const type of ['BATTLE', 'ELITE', 'BOSS']) expect(noticeText('node_restart', { id: 'x', type })).toBe('已回到本场战斗开打前');
  });
  it('节点结算完成立即写档：pendingNode 清空，读档无提示、保留结算结果', () => {
    const store = mem();
    const s1 = begin(5);
    s1.enterNode({ id: 'L1C1', type: 'BATTLE' }, store);
    s1.update((d) => {
      d.gold += 25;
    });
    s1.completeNode(store);
    const { s: s2, r } = reload(store);
    expect(r.ok && [r.notice, s2.inNode, s2.state.gold]).toEqual([null, null, s1.state.gold]);
  });
});

describe('卡牌 uid 号段（#122 第 2 点）', () => {
  it('永久卡由 RunState.nextUid 分配；临时牌独立号段且不能写进存档', () => {
    const s = new RunSession();
    s.start({ main: 'H01', sub: 'H08', seed: 1 });
    const n0 = s.state.nextUid;
    expect(s.allocUid()).toBe(n0);
    expect(s.allocUid()).toBe(n0 + 1);
    expect(s.state.nextUid).toBe(n0 + 2);
    const tmp = tempUidAllocator();
    const t = tmp();
    expect(t).toBe(TEMP_UID_BASE);
    expect(isTempUid(t) && !isTempUid(n0)).toBe(true);
    const bad = { ...s.state, deck: [...s.state.deck, card(t)] } as RunState;
    expect(() => serializeRunState(bad)).toThrow();
    const d = s.state;
    expect(allocCardUid(d)).toBe(n0 + 2);
  });
});
