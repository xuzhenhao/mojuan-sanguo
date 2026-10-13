import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from '../src/platform/types';
import { RUN_SAVE_KEY, clearRunSave, hasRunSave, loadRunSave, writeRunSave } from '../src/game/result/run-save';
import { MetaStore, RunSaveSlot, summarize } from '../src/game/result/store';

function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  const s: StorageAdapter & { m: Map<string, string> } = {
    m,
    get: (k) => (m.has(k) ? m.get(k)! : null),
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
  return s;
}

const SAVE = {
  heroMain: 'H03',
  heroSub: 'H04',
  chapter: 1,
  hp: 7,
  maxHp: 10,
  gold: 42,
  deck: ['sha', 'shan', 'tao'],
  tianming: 2,
  runSeed: 12345,
  startedAt: 1700000000000,
  mapState: {
    current: 'n3',
    nodes: [
      { id: 'n1', layer: 1 },
      { id: 'n3', layer: 3 },
    ],
  },
};

describe('run-save 适配层', () => {
  it('键名：#122 PR2 起写新键 mojuan.runstate.v1（旧键只读）', () => {
    expect(RUN_SAVE_KEY).toBe('mojuan.runstate.v1');
  });
  it('序列化往返：写入后读出深度相等，且只占一个键', () => {
    const st = mem();
    writeRunSave(st, SAVE);
    expect(st.m.size).toBe(1);
    expect(hasRunSave(st)).toBe(true);
    expect(loadRunSave(st)).toEqual(SAVE);
  });
  it('无存档 / 空串：load 返回 null，has 为 false', () => {
    expect(loadRunSave(mem())).toBeNull();
    expect(hasRunSave(mem({ [RUN_SAVE_KEY]: '' }))).toBe(false);
  });
  it('损坏的 JSON 不抛异常，视为无存档', () => {
    const st = mem({ [RUN_SAVE_KEY]: '{"heroMain":"H03",' });
    expect(() => loadRunSave(st)).not.toThrow();
    expect(loadRunSave(st)).toBeNull();
    expect(hasRunSave(st)).toBe(false);
  });
  it('clear 只删局内存档，不碰局外存档', () => {
    const st = mem({ other: 'x' });
    writeRunSave(st, SAVE);
    clearRunSave(st);
    expect(hasRunSave(st)).toBe(false);
    expect(st.get('other')).toBe('x');
  });
  it('覆盖写入：后写的生效', () => {
    const st = mem();
    writeRunSave(st, SAVE);
    writeRunSave(st, { ...SAVE, gold: 1 });
    expect((loadRunSave(st) as typeof SAVE).gold).toBe(1);
  });
});

describe('续玩摘要 summarize / RunSaveSlot', () => {
  it('完整存档：层数取地图当前节点', () => {
    expect(summarize(SAVE)).toEqual({
      heroMain: 'H03',
      heroSub: 'H04',
      chapter: 1,
      layer: 3,
      hp: 7,
      maxHp: 10,
      gold: 42,
      deckSize: 3,
      tianming: 2,
      runSeed: 12345,
      startedAt: 1700000000000,
    });
  });
  it('旧版本存档（无 mapState / maxHp / startedAt / deck）：给默认值', () => {
    const s = summarize({ heroMain: 'H01', heroSub: 'H02', hp: 5, layer: 2 })!;
    expect(s).toMatchObject({ chapter: 1, layer: 2, hp: 5, maxHp: 5, gold: 0, deckSize: 0, tianming: 0, startedAt: null });
  });
  it('字段类型错误（NaN / 字符串）回落默认值', () => {
    const s = summarize({ heroMain: 'H01', heroSub: 'H02', hp: 'x', gold: NaN, chapter: Infinity })!;
    expect(s).toMatchObject({ hp: 0, gold: 0, chapter: 1 });
  });
  it('结构不对返回 null（无主副将 / 非对象 / null）', () => {
    expect(summarize(null)).toBeNull();
    expect(summarize('save')).toBeNull();
    expect(summarize([1, 2])).toBeNull();
    expect(summarize({ heroMain: 'H01' })).toBeNull();
  });
  it('RunSaveSlot：peek 不删档；remove 后 peek 为 null；损坏存档 peek 为 null', () => {
    const st = mem();
    writeRunSave(st, SAVE);
    const slot = new RunSaveSlot(st);
    expect(slot.peek()?.gold).toBe(42);
    expect(slot.peek()?.gold).toBe(42);
    expect(hasRunSave(st)).toBe(true);
    slot.remove();
    expect(slot.peek()).toBeNull();
    expect(new RunSaveSlot(mem({ [RUN_SAVE_KEY]: 'not json' })).peek()).toBeNull();
  });
});

describe('MetaStore 局外存档', () => {
  it('空 / 损坏 / schema 不符时回落空存档，且不抛异常', () => {
    const a = new MetaStore(mem()).load();
    const b = new MetaStore(mem({ k: '{bad' }), 'k').load();
    const c = new MetaStore(mem({ k: JSON.stringify({ schema: 99, x: 1 }) }), 'k').load();
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
  it('load 返回副本：修改返回值不污染默认存档', () => {
    const st = mem();
    const m = new MetaStore(st).load() as unknown as Record<string, unknown>;
    m.__polluted = 1;
    expect((new MetaStore(st).load() as unknown as Record<string, unknown>).__polluted).toBeUndefined();
  });
});
