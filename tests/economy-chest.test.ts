import { describe, expect, it } from 'vitest';
import { seeded } from '../src/core/rng';
import { ECONOMY, RELICS } from '../src/data/economy';
import { pickRelics } from '../src/game/economy/pools';
import { rollChest, takeChestRelic } from '../src/game/economy/chest';
import { makeTestInventory } from './test-inventory';

describe('宝箱（10.8）', () => {
  it('约 75% 宝物三选一，其余铜钱 50–80', () => {
    const rng = seeded(13);
    let relic = 0;
    for (let i = 0; i < 2000; i++) {
      const o = rollChest(rng, makeTestInventory());
      if (o.type === 'relic') {
        relic++;
        expect(o.relics).toHaveLength(3);
      } else {
        expect(o.gold).toBeGreaterThanOrEqual(50);
        expect(o.gold).toBeLessThanOrEqual(80);
      }
    }
    expect(relic / 2000).toBeGreaterThan(0.71);
    expect(relic / 2000).toBeLessThan(0.79);
  });
  it('宝物池耗尽时以铜钱替代', () => {
    const inv = makeTestInventory();
    inv.relics = RELICS.map((r) => r.id);
    expect(rollChest(seeded(14), inv).type).toBe('gold');
  });
  it('不出已持有的宝物；领取一次', () => {
    const inv = makeTestInventory();
    inv.relics = ['R10', 'R20'];
    const ids = pickRelics(seeded(15), inv.relics, 3, ECONOMY.chestRelicRarity);
    expect(ids.some((x) => inv.relics.includes(x))).toBe(false);
    const o = { type: 'relic' as const, relics: ids };
    expect(takeChestRelic(inv, o, ids[0])).toBe(true);
    expect(takeChestRelic(inv, o, ids[0])).toBe(false);
  });
});
