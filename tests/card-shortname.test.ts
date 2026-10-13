import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { CARDS } from '../src/data/cards';

describe('卡牌短名 shortName', () => {
  it('X101 方天戟·破阵 的短名是「破阵」', () => {
    expect(CONFIG.cards.X101.shortName).toBe('破阵');
    expect(CARDS.X101.shortName).toBe('破阵');
  });

  it('所有卡牌小牌显示名（shortName ?? name）不超过 5 个字', () => {
    const tooLong = Object.values(CONFIG.cards)
      .map((c) => ({ id: c.id, label: c.shortName ?? c.name }))
      .filter(({ label }) => [...label].length > 5);
    expect(tooLong).toEqual([]);
  });
});
