import { beforeEach, describe, expect, it } from 'vitest';
import { RunSession, NULL_IO } from '../src/game/run';
import { CONFIG } from '../src/data/config';
import { setRunSaveStore } from '../src/core/run/save';
import { loadMapSave, mapRun, mapSession, resetMapSession } from '../src/game/map';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { LEGACY_RUN_SAVE_KEY, RUN_STATE_KEY, TEMP_UID_BASE, isTempUid, noticeText } from '../src/game/run/state';
import { BATTLES } from '../src/data/enemies';
import type { Engine } from '../src/engine/engine';
import type { Game } from '../src/core/battle';
import type { BattleRouteParams } from '../src/game/map/route';

/** 记录所有写入键的内存存储 */
const spyStore = () => {
  const m = new Map<string, string>();
  const writes: string[] = [];
  return {
    m,
    writes,
    get: (k: string) => m.get(k) ?? null,
    set: (k: string, v: string) => void (writes.push(k), m.set(k, v)),
    remove: (k: string) => void m.delete(k),
  };
};
const fakeEngine = () => ({ platform: { launchQuery: () => ({}), now: () => 1 } }) as unknown as Engine;
const node = (id: string, enemies = [...BATTLES[0].en]) => ({ nodeId: id, nodeType: 'BATTLE' as const, encounterName: 't', enemies });
const handOf = (g: Game) => g.hand.map((c) => `${c.uid}:${c.id}`);
const intentsOf = (g: Game) => g.en.map((e) => `${e.id}:${e.uid}:${e.step}:${e.hp}`);

let store: ReturnType<typeof spyStore>;
beforeEach(() => {
  store = spyStore();
  setRunSaveStore(store);
  resetMapSession();
});

describe('#122 PR2：体力 / 牌组跨场延续', () => {
  it('打完一场进下一场：体力 = 上一场结束时体力（rules.map.betweenBattleHeal = 0，不用 sim.baselineBetweenBattleHeal）', () => {
    expect(CONFIG.rules.map.betweenBattleHeal).toBe(0);
    expect(CONFIG.rules.sim.baselineBetweenBattleHeal).not.toBe(0); // 只给三战回归模拟，正式流程不能读它
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 5 });
    const g1 = run.buildBattle(NULL_IO, node('L1C0'));
    g1.p.hp -= 3;
    const endHp = g1.p.hp;
    run.settleBattle(true);
    const g2 = run.buildBattle(NULL_IO, node('L2C0'));
    expect(g2.p.hp).toBe(endHp);
    expect(g2.p.maxHp).toBe(g1.p.maxHp);
    expect(run.state.hp).toBe(endHp);
  });
  it('牌组：词条与新牌带到下一场；战斗内临时牌（TEMP_UID 号段）不进牌组、不写档', () => {
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 6 });
    const newUid = run.allocUid();
    run.update((d) => void d.deck.push({ uid: newUid, id: 'B001', suit: 'S', rank: 9, mods: [] }));
    const g1 = run.buildBattle(NULL_IO, node('L1C0'));
    expect(g1.deckMaster.map((c) => c.uid)).toContain(newUid);
    expect(g1.en.every((e) => isTempUid(e.uid))).toBe(true); // 敌人实例 uid 也在临时号段，不撞永久卡
    g1.deckMaster[0].mods.push('A01');
    g1.deckMaster.push({ uid: ++g1.uid, id: 'B001', suit: 'H', rank: 1, mods: [] });
    expect(g1.uid).toBeGreaterThanOrEqual(TEMP_UID_BASE);
    run.settleBattle(true);
    const s = run.state;
    expect(s.deck.some((c) => isTempUid(c.uid))).toBe(false);
    expect(s.deck[0].mods).toEqual(['A01']);
    const g2 = run.buildBattle(NULL_IO, node('L2C0'));
    expect(g2.deckMaster.map((c) => c.uid).sort()).toEqual(s.deck.map((c) => c.uid).sort());
    expect(g2.deckMaster[0].mods).toEqual(['A01']);
    expect(() => run.serialize()).not.toThrow();
  });
});

describe('#122 PR2：页面流程不写旧键 mojuan.run.v1', () => {
  it('点将 → 地图 → 进战斗 → 结算 → 奖励 → 集市：所有写入只有新键', () => {
    const run = mapRun();
    run.store = store;
    run.start({ main: 'H01', sub: 'H08', seed: 21 });
    const s = mapSession(fakeEngine(), 1, 21, { main: 'H01', sub: 'H08' });
    const battleId = s.available.find((id) => s.node(id)!.type === 'BATTLE')!;
    const r = s.enter(battleId);
    const p = r.params as BattleRouteParams;
    const b = new BattleScene({
      build: (io, bp) => run.buildBattle(io, { nodeId: bp.nodeId!, nodeType: bp.nodeType!, encounterName: '', enemies: bp.enemies! }, false),
    });
    b.enter({ invalidate() {}, width: 390, height: 844 }, p);
    run.settleBattle(true);
    run.completeNode(store);
    run.enterNode({ id: `${battleId}#reward`, type: 'REWARD' }, store);
    run.inventory.gold += 10;
    run.completeNode(store);
    expect(store.writes.length).toBeGreaterThan(0);
    expect(store.writes.every((k) => k === RUN_STATE_KEY)).toBe(true);
    expect(store.m.has(LEGACY_RUN_SAVE_KEY)).toBe(false);
    expect(JSON.parse(store.m.get(RUN_STATE_KEY)!).heroMain).toBe('H01');
  });
  it('有旧键存档：读档迁移成功后写新键并删除旧键，之后不再碰旧键', () => {
    const legacy = {
      schema: 1,
      version: '0.2.0',
      configVersion: 'dev',
      runSeed: 22,
      chapter: 1,
      heroMain: 'H01',
      heroSub: 'H08',
      hp: 5,
      maxHp: 9,
      gold: 30,
      deck: [],
      relics: [],
      potions: [],
      nodePath: [],
      mapState: { nodes: [], edges: [], visited: [], current: null },
      encounters: { draws: 0 },
      battleState: null,
      battleStartSnapshot: null,
      timestamp: 0,
    };
    store.m.set(LEGACY_RUN_SAVE_KEY, JSON.stringify(legacy));
    const v = loadMapSave()!;
    expect([v.heroMain, v.hp, v.gold]).toEqual(['H01', 5, 30]);
    expect(store.m.has(LEGACY_RUN_SAVE_KEY)).toBe(false);
    expect(store.m.has(RUN_STATE_KEY)).toBe(true);
    expect(store.writes).not.toContain(LEGACY_RUN_SAVE_KEY);
  });
});

describe('#122 PR2：战斗中途刷新回到开打前快照（地图 → 战斗页真实流程）', () => {
  it('刷新后读档：pendingNode = 该战斗，体力 / 手牌 / 敌人与第一次一致，toast「已回到本场战斗开打前」', () => {
    const run = mapRun();
    run.store = store;
    run.start({ main: 'H03', sub: 'H04', seed: 31 });
    const s = mapSession(fakeEngine(), 1, 31, { main: 'H03', sub: 'H04' });
    const id = s.available.find((x) => s.node(x)!.type === 'BATTLE')!;
    const p = s.enter(id).params as BattleRouteParams;
    const mk = (rs: RunSession) =>
      new BattleScene({
        build: (io, bp) => rs.buildBattle(io, { nodeId: bp.nodeId!, nodeType: bp.nodeType!, encounterName: '', enemies: bp.enemies! }, false),
      });
    const b1 = mk(run);
    b1.enter({ invalidate() {}, width: 390, height: 844 }, p);
    const g1 = b1.g;
    const hpBefore = g1.p.hp;
    const hand1 = handOf(g1);
    const en1 = intentsOf(g1);
    // 战斗中：掉血、打出牌（不存档）
    g1.p.hp -= 4;
    run.save(store); // 节点内存档只写进节点快照
    // 刷新：内存会话全丢，重新读档
    const run2 = new RunSession();
    const r = run2.load(store);
    expect(r.ok && r.notice).toBe('node_restart');
    expect(r.ok && noticeText(r.notice, run2.inNode)).toBe('已回到本场战斗开打前');
    expect(run2.inNode).toEqual({ id, type: 'BATTLE' });
    const b2 = mk(run2);
    b2.enter({ invalidate() {}, width: 390, height: 844 }, p);
    expect(b2.g.p.hp).toBe(hpBefore);
    expect(handOf(b2.g)).toEqual(hand1);
    expect(intentsOf(b2.g)).toEqual(en1);
    expect(store.writes).not.toContain(LEGACY_RUN_SAVE_KEY);
  });
});

describe('#122 PR2：战斗失败「结束本局」', () => {
  it('失败（游戏代码尚无复活机制）：存档标记 ended，pendingNode 清空；刷新读档不再重进战斗', () => {
    const run = mapRun();
    run.store = store;
    run.start({ main: 'H03', sub: 'H04', seed: 41 });
    const s = mapSession(fakeEngine(), 1, 41, { main: 'H03', sub: 'H04' });
    const id = s.available.find((x) => s.node(x)!.type === 'BATTLE')!;
    s.enter(id);
    const g = run.buildBattle(NULL_IO, node(id));
    g.p.hp = 0;
    run.settleBattle(false);
    run.endRun(store);
    const saved = JSON.parse(store.m.get(RUN_STATE_KEY)!);
    expect(saved.ended).toEqual({ reason: 'defeat', nodeId: id });
    expect([saved.pendingNode, saved.hp]).toEqual([null, 0]);
    const run2 = new RunSession();
    const r = run2.load(store);
    expect(r.ok && r.notice).toBe(null); // 不提示「已回到本场战斗开打前」
    expect(run2.ended).toEqual({ reason: 'defeat', nodeId: id });
    expect(run2.inNode).toBeNull();
  });
});

describe('#122 PR2：同 seed 换武将重建起始牌组', () => {
  it('赵云+刘备 → 吕布+陆逊：牌组 = 吕布起始牌，uid 不复用', async () => {
    const { starterDeck } = await import('../src/data/cards');
    const a = mapSession(fakeEngine(), 1, 51, { main: 'H03', sub: 'H04' });
    a.save();
    const old = mapRun().state.deck.map((c) => c.uid);
    mapSession(fakeEngine(), 1, 51, { main: 'H01', sub: 'H08' });
    const st = mapRun().state;
    expect([st.heroMain, st.heroSub]).toEqual(['H01', 'H08']);
    expect(st.deck.map((c) => [c.id, c.suit, c.rank])).toEqual(starterDeck('H01').map(([id, suit, rank]) => [id, suit, rank]));
    expect(starterDeck('H01')).not.toEqual(starterDeck('H03'));
    expect(st.deck.some((c) => old.includes(c.uid))).toBe(false);
    expect(JSON.parse(store.m.get(RUN_STATE_KEY)!).deck).toHaveLength(starterDeck('H01').length);
  });
});

describe('#122 PR3 去掉 rewardRefreshUsed（存档 v2）', () => {
  it('Inventory / RunState.counters 都不再带 rewardRefreshUsed，不写旧键', async () => {
    const { RunSession } = await import('../src/game/run');
    const { LEGACY_RUN_SAVE_KEY, RUN_STATE_KEY } = await import('../src/game/run/state');
    const m = new Map<string, string>();
    const st = { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 5 });
    expect('rewardRefreshUsed' in run.inventory).toBe(false);
    run.inventory.shopRefreshUsed = 1;
    run.save(st);
    const saved = JSON.parse(m.get(RUN_STATE_KEY)!);
    const counters = (saved.state ?? saved).counters;
    expect(counters).toEqual({ shopRefreshUsed: 1, removeUsed: 0 });
    expect(saved.version).toBe(2);
    expect(m.has(LEGACY_RUN_SAVE_KEY)).toBe(false);
  });
});

describe('RunState v1 → v2 迁移', () => {
  it('v1 存档（带 rewardRefreshUsed）读档后升到 v2、丢弃该字段，其余不变', async () => {
    const { RunSession } = await import('../src/game/run');
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 9 });
    run.inventory.shopRefreshUsed = 1;
    const v2 = JSON.parse(run.serialize());
    const v1 = { ...v2, version: 1, counters: { ...v2.counters, rewardRefreshUsed: 1 } };
    const other = new RunSession();
    const r = other.resume(JSON.stringify(v1));
    expect(r.ok && [r.state.version, r.state.counters, r.migratedFrom]).toEqual([2, { shopRefreshUsed: 1, removeUsed: 0 }, 1]);
    expect(r.ok && r.state.deck).toEqual(v2.deck);
    expect(JSON.parse(other.serialize()).counters).not.toHaveProperty('rewardRefreshUsed');
  });
});

describe('存储键迁移到 v2（键名不变：只剩 mojuan.runstate.v1）', () => {
  const memStore = () => {
    const m = new Map<string, string>();
    return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
  };
  it('新键里的 v1 存档 → 读档后回写为 v2，存储里只剩新键', async () => {
    const { RunSession } = await import('../src/game/run');
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 11 });
    const v1 = { ...JSON.parse(run.serialize()), version: 1 };
    v1.counters = { ...v1.counters, rewardRefreshUsed: 2 };
    const st = memStore();
    st.set(RUN_STATE_KEY, JSON.stringify(v1));
    const r = new RunSession().load(st);
    expect(r.ok).toBe(true);
    expect([...st.m.keys()]).toEqual([RUN_STATE_KEY]);
    const saved = JSON.parse(st.m.get(RUN_STATE_KEY)!);
    expect(saved.version).toBe(2);
    expect(saved.counters).not.toHaveProperty('rewardRefreshUsed');
    expect(st.m.has(LEGACY_RUN_SAVE_KEY)).toBe(false);
  });
  it('旧键 mojuan.run.v1 → 一路迁到 v2：只剩新键、version 2、旧键已删', async () => {
    const { RunSession } = await import('../src/game/run');
    const fs = await import('node:fs');
    const legacy = fs.readFileSync(new URL('./fixtures/legacy-save-seed22.json', import.meta.url), 'utf8');
    const st = memStore();
    st.set(LEGACY_RUN_SAVE_KEY, legacy);
    const r = new RunSession().load(st);
    expect(r.ok && r.migratedFrom).toBe(0);
    expect([...st.m.keys()]).toEqual([RUN_STATE_KEY]);
    const saved = JSON.parse(st.m.get(RUN_STATE_KEY)!);
    expect(saved.version).toBe(2);
    expect(saved.counters).toEqual({ shopRefreshUsed: 0, removeUsed: 0 });
    expect(st.m.has(LEGACY_RUN_SAVE_KEY)).toBe(false);
  });
});
