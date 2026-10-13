import { describe, expect, it } from 'vitest';
import { K0, runMap } from '../src/sim/map-run';

describe('#106 地图模拟：天命 ≥5 不复活', () => {
  it('同种子：天命 0 有复活的局，天命 5 不复活', async () => {
    let seed = -1;
    for (let s = 1; s <= 40 && seed < 0; s++) if ((await runMap(s, { main: 'H03', sub: 'H04' }, K0)).revived) seed = s;
    expect(seed).toBeGreaterThan(0);
    const r4 = await runMap(seed, { main: 'H03', sub: 'H04' }, K0, { tianming: 4 });
    const r5 = await runMap(seed, { main: 'H03', sub: 'H04' }, K0, { tianming: 5 });
    expect(r4.revived).toBe(true);
    expect(r5.revived).toBe(false);
    expect(r5.clear).toBe(r5.clearNoRevive);
  }, 120_000);
});
