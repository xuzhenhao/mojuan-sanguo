import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { ECONOMY } from '../src/data/economy';
import { REVIVES_PER_RUN } from '../src/game/run/state';

describe('经济/复活参数挪入 rules.yaml（无数值变更）', () => {
  it('商店格子、宝物价、删牌价与旧常量一致', () => {
    expect(ECONOMY.shopSlots).toEqual({ common: 2, heroCard: 1, relic: 1, potion: 2 });
    expect(ECONOMY.relicPrice).toEqual({ N: 70, R: 100, E: 140 });
    expect(ECONOMY.removeBase).toBe(50);
    expect(ECONOMY.removeStep).toBe(25);
  });
  it('复活参数与旧常量一致', () => {
    expect(CONFIG.rules.revive).toEqual({ count: 1, hpRatio: 0.25, hpMin: 2, armor: 3 });
    expect(REVIVES_PER_RUN).toBe(1);
  });
});
