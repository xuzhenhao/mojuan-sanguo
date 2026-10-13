import { describe, expect, it } from 'vitest';
import { rngFromState, seeded } from '../src/core/rng';
import { generateMap } from '../src/core/run/map';
import { MAP_CONFIG } from '../src/data/map';
import { ECONOMY } from '../src/data/economy';
import { RunSession } from '../src/game/run';
import {
  createRunState,
  deserializeRunState,
  fromLegacyRunSave,
  initialRngStates,
  isRunState,
  RUN_STATE_VERSION,
  serializeRunState,
  type RunState,
} from '../src/game/run/state';
import type { RunSave } from '../src/core/run/save';

const draw = (r: () => number, n: number) => Array.from({ length: n }, () => r());
const started = (seed = 1234) => {
  const s = new RunSession();
  s.start({ main: 'H03', sub: 'H04', seed }, undefined, { now: 1000, tianming: 2, configVersion: 'c1' });
  return s;
};

describe('rng getState / setState（#122）', () => {
  it('中途导出状态再恢复，后续序列与不中断一致', () => {
    const a = seeded(42);
    draw(a, 7);
    const st = a.getState();
    const rest = draw(a, 20);
    expect(draw(rngFromState(st), 20)).toEqual(rest);
    const b = seeded(1);
    b.setState(st);
    expect(draw(b, 20)).toEqual(rest);
  });
  it('seeded 原序列不变（兼容旧存档 / sim 结果）', () => {
    // 原 mulberry32 实现（改造前 src/core/rng.ts）
    const ref = (seed: number) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    for (const sd of [0, 7, 1234, 0xffffffff]) expect(draw(seeded(sd), 50)).toEqual(draw(ref(sd), 50));
  });
});

describe('RunState 序列化（#122 PR1）', () => {
  it('开局：体力 / 牌组取 core，随机流与现有派生规则一致', () => {
    const s = started();
    const st = s.state;
    expect(isRunState(st)).toBe(true);
    expect(st).toMatchObject({ version: RUN_STATE_VERSION, heroMain: 'H03', heroSub: 'H04', runSeed: 1234, tianming: 2, startedAt: 1000, configVersion: 'c1' });
    expect(st.hp).toBe(s.game!.p.hp);
    expect(st.deck.map((c) => c.uid)).toEqual(s.game!.deckMaster.map((c) => c.uid));
    expect(st.gold).toBe(ECONOMY.startGold);
    expect(st.potions).toEqual(Array(ECONOMY.potionSlots).fill(null));
    expect(st.rng).toEqual(initialRngStates(1234));
    expect(st.rng.economy).toBe((1234 ^ 0x45a5) >>> 0);
  });
  it('往返序列化相等（含词条、地图、宝物、丹药、计数、统计）', () => {
    const s = started();
    s.update((d) => {
      d.deck[0].mods.push('E_S01');
      d.relics.push('R03');
      d.potions[1] = 'P01';
      d.gold = 77;
      d.counters.removeUsed = 2;
      d.map = generateMap(1234, 1, MAP_CONFIG);
      d.stats.battlesWon = 3;
    });
    s.rng('economy')();
    const text = s.serialize();
    const r = deserializeRunState(text, { configVersion: 'c1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(s.state);
    expect(r).toMatchObject({ migratedFrom: null, rngReset: false, configChanged: false });
    expect(serializeRunState(r.state)).toBe(text);
  });
  it('读档后继续抽取：各随机流序列与不中断时一致', () => {
    const a = started(99);
    draw(a.rng('economy'), 5);
    draw(a.rng('event'), 3);
    draw(a.game!.rng, 4); // 战斗用 Game.rng = battle 流
    const text = a.serialize();
    const cont = { e: draw(a.rng('economy'), 10), v: draw(a.rng('event'), 10), b: draw(a.game!.rng, 10) };
    const b = new RunSession();
    expect(b.resume(text).ok).toBe(true);
    expect(draw(b.rng('economy'), 10)).toEqual(cont.e);
    expect(draw(b.rng('event'), 10)).toEqual(cont.v);
    expect(draw(b.rng('battle'), 10)).toEqual(cont.b);
    expect(b.params).toEqual({ main: 'H03', sub: 'H04', seed: 99 });
    expect(b.game).toBeNull();
  });
  it('版本：更新的存档拒绝且不改当前会话；损坏 → corrupt；配置版本不同只标记', () => {
    const s = started();
    const raw = JSON.parse(s.serialize()) as RunState;
    const other = started(5);
    const before = other.serialize();
    const r = other.resume(JSON.stringify({ ...raw, version: RUN_STATE_VERSION + 1 }));
    expect(r).toEqual({ ok: false, reason: 'newer', version: RUN_STATE_VERSION + 1 });
    expect(other.serialize()).toBe(before);
    expect(deserializeRunState('{not json')).toEqual({ ok: false, reason: 'corrupt' });
    expect(deserializeRunState(null)).toEqual({ ok: false, reason: 'corrupt' });
    expect(deserializeRunState(JSON.stringify({ foo: 1 }))).toEqual({ ok: false, reason: 'corrupt' });
    expect(deserializeRunState(JSON.stringify({ ...raw, hp: 'x' })).ok).toBe(false);
    expect(deserializeRunState(JSON.stringify({ ...raw, rng: { battle: 1 } })).ok).toBe(false);
    const c = deserializeRunState(s.serialize(), { configVersion: 'c2' });
    expect(c.ok && c.configChanged).toBe(true);
    expect(() => serializeRunState({ ...raw, deck: [{ uid: 1 }] } as unknown as RunState)).toThrow();
  });
  it('旧 RunSave（mojuan.run.v1）迁移为 v1：保留体力/铜钱/牌组/地图，随机流按种子重派生', () => {
    const map = generateMap(8, 1, MAP_CONFIG);
    const legacy = {
      schema: 1,
      version: '0.2.0',
      configVersion: 'dev',
      runSeed: 8,
      chapter: 1,
      heroMain: 'H01',
      heroSub: 'H02',
      hp: 4,
      maxHp: 8,
      gold: 50,
      deck: [{ uid: 3, id: 'B001', suit: 'S', rank: 7, mods: ['E_S02'] }],
      relics: ['R03'],
      potions: ['P01'],
      mapState: map,
      encounters: { normalFought: 1, last: {}, draws: 1 },
      nodePath: [],
      battleState: null,
      battleStartSnapshot: null,
      timestamp: 5,
    } as unknown as RunSave;
    const r = deserializeRunState(JSON.stringify(legacy));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r).toMatchObject({ migratedFrom: 0, rngReset: true });
    expect(r.state).toMatchObject({ hp: 4, maxHp: 8, gold: 50, relics: ['R03'], potions: ['P01', null, null], nextUid: 4, rng: initialRngStates(8) });
    expect(r.state.deck[0].mods).toEqual(['E_S02']);
    expect(r.state.map).toEqual(map);
    expect(fromLegacyRunSave(legacy).encounters.draws).toBe(1);
  });
  it('拷贝语义：state / update / createRunState 都不共享外部引用', () => {
    const s = started();
    const a = s.state;
    a.deck[0].mods.push('E_S01');
    a.relics.push('R01');
    a.hp = -1;
    expect(s.state.deck[0].mods).toEqual([]);
    expect(s.state.relics).toEqual([]);
    expect(s.state.hp).toBeGreaterThan(0);
    // update 返回值、闭包里泄露的 draft 也不能改到会话
    let leaked: RunState | null = null;
    const ret = s.update((d) => {
      d.gold = 1;
      leaked = d;
    });
    ret.gold = 999;
    leaked!.gold = 555;
    expect(s.state.gold).toBe(1);
    // update 抛错不生效
    expect(() =>
      s.update((d) => {
        d.gold = 2;
        throw new Error('x');
      }),
    ).toThrow();
    expect(s.state.gold).toBe(1);
    // core Game 牌组与 RunState 不共享（PR2 再统一）
    s.game!.deckMaster[0].mods.push('E_S03');
    expect(s.state.deck[0].mods).toEqual([]);
    const deck = [{ uid: 1, id: 'B001', suit: 'S' as const, rank: 1, mods: [] as string[] }];
    const c = createRunState({ runSeed: 1, heroMain: 'H01', heroSub: 'H02', hp: 8, deck, gold: 0, potionSlots: 3 });
    deck[0].mods.push('E_S01');
    expect(c.deck[0].mods).toEqual([]);
    // resume 返回的 state 也是副本
    const b = new RunSession();
    const r = b.resume(s.serialize());
    if (r.ok) r.state.gold = 12345;
    expect(b.state.gold).toBe(1);
  });
  it('update 可改随机流状态（例如回滚），活随机流同步', () => {
    const s = started(3);
    const r = s.rng('economy');
    const st0 = s.state.rng.economy;
    const first = draw(r, 3);
    s.update((d) => {
      d.rng.economy = st0;
    });
    expect(draw(r, 3)).toEqual(first);
  });
  it('主副将（线上 P0：吕布 + 陆逊）：开局、序列化、读档后仍是所选武将，不回落默认赵云 + 刘备', () => {
    const s = new RunSession();
    const g = s.start({ main: 'H01', sub: 'H08', seed: 77 });
    expect([g.main.id, g.sub.id]).toEqual(['H01', 'H08']);
    expect([s.state.heroMain, s.state.heroSub]).toEqual(['H01', 'H08']);
    expect(s.state.hp).toBe(g.main.hp); // 吕布体力，不是默认主将
    const b = new RunSession();
    const r = b.resume(s.serialize());
    expect(r.ok && [r.state.heroMain, r.state.heroSub]).toEqual(['H01', 'H08']);
    expect([b.state.heroMain, b.state.heroSub]).toEqual(['H01', 'H08']);
    expect(b.params).toMatchObject({ main: 'H01', sub: 'H08' });
  });
  it('无局时访问 state 抛错；clear 后 inactive', () => {
    const s = new RunSession();
    expect(s.active).toBe(false);
    expect(() => s.state).toThrow(/没有进行中的局/);
    s.start({ main: 'H03', sub: 'H04', seed: 1 });
    s.clear();
    expect(s.active).toBe(false);
    expect(() => new RunSession().start({ main: 'H03', sub: 'H03', seed: 1 })).toThrow();
  });
});
