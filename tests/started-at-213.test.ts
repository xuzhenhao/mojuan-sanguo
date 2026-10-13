import { describe, expect, it, vi } from 'vitest';
import { RunSession } from '../src/game/run';
import { outcomeFromRunState } from '../src/game/result/adapter';
import { fmtDuration } from '../src/game/result/settlement';

describe('#213 开局写入 startedAt，结算用时不再恒为 00:00', () => {
  it('start 不传 now 也写入当前时间戳', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_760_000_000_000);
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 1 });
    expect(run.state.startedAt).toBe(1_760_000_000_000);
    const o = outcomeFromRunState(run.state, { now: 1_760_000_000_000 + 3 * 60_000 + 7_000 });
    expect(fmtDuration(o.durationMs)).not.toBe('00:00');
    expect(o.durationMs).toBe(187_000);
    vi.useRealTimers();
  });
  it('存档往返保留 startedAt', () => {
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 1 }, undefined, { now: 12345 });
    const r = new RunSession();
    expect(r.resume(run.serialize()).ok).toBe(true);
    expect(r.state.startedAt).toBe(12345);
  });
});
