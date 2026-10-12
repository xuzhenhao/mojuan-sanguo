/** 张角 B1（design-v1.md 10.7）与 T002 投放（11.2） */
import { describe, expect, it } from 'vitest';
import { CONFIG, rewardWeight, shopPrice } from '../src/data/config';

describe('张角 B1', () => {
  const b1 = CONFIG.enemies.B1 as unknown as {
    enabled?: boolean;
    flashMarksPerTurn?: number;
    hp: number;
    desc?: string;
    phases?: { when: string; intents: string[][] }[];
  };
  it('启用、HP 18、每回合闪标记 0', () => {
    expect(b1.enabled).toBe(true);
    expect(b1.hp).toBe(18);
    expect(b1.flashMarksPerTurn).toBe(0);
  });
  it('删除「全场连环」', () => expect(JSON.stringify(b1)).not.toContain('连环'));
  it('阶段 2 意图按定稿', () =>
    expect(b1.phases).toEqual([
      {
        when: 'hp_below_50%',
        intents: [
          ['杀+', '杀', '杀'],
          ['锦囊:D003', '杀+'],
          ['杀+', '杀+', '杀'],
        ],
      },
    ]));
});

describe('T002 顺手牵羊投放', () => {
  it('不在任何起始牌组', () => {
    for (const h of Object.values(CONFIG.heroes)) expect(h.starterDeck.map((c) => c.card)).not.toContain('T002');
    for (const d of Object.values(CONFIG.decks)) expect(d.cards.map((c) => c.card)).not.toContain('T002');
  });
  it('通用奖励池 N，权重与 T001/T003/T013 相同（=1）', () => {
    expect(CONFIG.cards.T002.rarity).toBe('N');
    for (const id of ['T001', 'T002', 'T003', 'T013']) expect(rewardWeight(id)).toBe(1);
  });
  it('商店价 40；其余按稀有度', () => {
    expect(shopPrice('T002')).toBe(40);
    expect(CONFIG.rules.shop?.cardPrice).toEqual({ N: 40, R: 60, E: 90, L: 130 });
  });
});
