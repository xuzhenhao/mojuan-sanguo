import { describe, expect, it } from 'vitest';
import { debugRun } from '../src/game/scenes/p4-register';
import { RunSession } from '../src/game/run';

describe('#122 PR3 删演示背包：?page= 直达也走 RunSession', () => {
  it('debugRun 返回同一个 RunSession，?gold= / ?potions= 写进 RunState，不绑定存储', () => {
    const get = debugRun({ gold: '120', potions: '2', seed: '3' });
    const r = get();
    expect(r).toBeInstanceOf(RunSession);
    expect(get()).toBe(r);
    expect(r.store).toBeNull();
    expect([r.inventory.gold, r.state.gold, r.state.potions]).toEqual([120, 120, ['P01', 'P03', null]]);
    r.inventory.gold -= 20;
    expect(r.state.gold).toBe(100);
  });
});
