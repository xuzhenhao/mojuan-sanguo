import { describe, expect, it } from 'vitest';
import { runBattle, summarize, quantile, LAYERS } from '../src/sim/autoplay';

describe('autoplay', () => {
  it('同种子可复现，且战斗能结束', async () => {
    const a = await runBattle({ battleIdx: 0, seed: 7 });
    const b = await runBattle({ battleIdx: 0, seed: 7 });
    expect(a).toEqual(b);
    expect(a.timeout).toBe(false);
  });
  it('防御层抵消 + 掉血 = 敌方伤害输入（不含回复）', async () => {
    for (let s = 1; s <= 20; s++) {
      const r = await runBattle({ battleIdx: 2, seed: s });
      const blocked = LAYERS.filter((l) => l !== 'tao').reduce((x, l) => x + r.absorbed[l], 0);
      expect(blocked + r.hpLost).toBe(r.incoming);
    }
  });
  it('summarize / quantile', async () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    const rs = await Promise.all([1, 2, 3].map((seed) => runBattle({ battleIdx: 1, seed })));
    const s = summarize(rs);
    expect(s.n).toBe(3);
    expect(s.defeatRate).toBeGreaterThanOrEqual(0);
  });
});
