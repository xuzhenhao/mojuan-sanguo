import { describe, expect, it } from 'vitest';
import { RunSaveSlot, RUN_SAVE_KEY } from '../src/game/result/store';
import { resumeFailure } from '../src/game/result/abandon';
import { RunSession } from '../src/game/run';

const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};

describe('#214 存档 JSON 截断：提示并清除坏档', () => {
  it('截断的 RunState 文本判为坏档，删档后不再判坏', () => {
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 1 }, undefined, { now: 1 });
    const s = run.serialize();
    const st = mem({ [RUN_SAVE_KEY]: s.slice(0, s.length / 2) });
    const slot = new RunSaveSlot(st);
    expect(slot.peek()).toBeNull();
    expect(slot.unreadable()).toBe(true);
    const f = resumeFailure('corrupt');
    expect(f.clearSave).toBe(true);
    expect(f.text).toContain('存档已损坏');
    slot.remove();
    expect(st.m.has(RUN_SAVE_KEY)).toBe(false);
    expect(slot.unreadable()).toBe(false);
  });
  it('没有存档 / 正常存档都不算坏档', () => {
    expect(new RunSaveSlot(mem()).unreadable()).toBe(false);
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 1 }, undefined, { now: 1 });
    expect(new RunSaveSlot(mem({ [RUN_SAVE_KEY]: run.serialize() })).unreadable()).toBe(false);
  });
});
