/** T009 无懈可击投放数值（design-v1 §12.3） */
import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/data/cards';
import { CONFIG, rewardWeight, shopPrice } from '../src/data/config';
import { pickReward, rewardPool } from '../src/data/reward-pool';
import { card, mkGame } from './helpers';

describe('T009 投放数值', () => {
  it('rewardWeight 0.7，其他 R 默认 1；商店价按 R 档 60（不单独设 shopPrice）', () => {
    expect(rewardWeight('T009')).toBe(0.7);
    expect(CONFIG.cards.T009.shopPrice).toBeUndefined();
    expect(shopPrice('T009')).toBe(60);
    for (const c of Object.values(CONFIG.cards)) if (c.rarity === 'R' && c.id !== 'T009') expect(rewardWeight(c.id)).toBe(1);
  });
  it('不进任何起始牌组', () => {
    for (const h of Object.values(CONFIG.heroes)) expect(h.starterDeck.map((c) => c.card)).not.toContain('T009');
    for (const d of Object.values(CONFIG.decks)) expect(d.cards.map((c) => c.card)).not.toContain('T009');
  });
  it('带 response 标签，卡面写明不受 M4 限制', () => {
    expect(CONFIG.cards.T009.tags).toContain('response');
    expect(CARDS.T009.response).toBe(true);
    expect(CONFIG.cards.T009.desc).toContain('响应牌，不受 0 费每回合 1 次限制');
  });
});

describe('奖励池权重', () => {
  it('R 池里 T009 权重 0.7', () => {
    const pool = rewardPool('R');
    expect(pool.find((p) => p.id === 'T009')?.weight).toBe(0.7);
  });
  it('按权重抽取：T009 的命中区间正好是 0.7 份', () => {
    const pool = rewardPool('R');
    const total = pool.reduce((s, p) => s + p.weight, 0);
    const N = 20000;
    let hit = 0;
    for (let i = 0; i < N; i++) if (pickReward('R', () => (i + 0.5) / N) === 'T009') hit++;
    expect(hit / N).toBeCloseTo(0.7 / total, 3);
    if (pool.length > 1) {
      const other = pool.find((p) => p.id !== 'T009')!.id;
      let h2 = 0;
      for (let i = 0; i < N; i++) if (pickReward('R', () => (i + 0.5) / N) === other) h2++;
      expect(hit / h2).toBeCloseTo(0.7, 2);
    }
  });
});

describe('M4：0 费每回合 1 次只统计非 response 牌', () => {
  it('T009 已用过也不触发 M4；去掉 response 标记则触发', () => {
    const { g } = mkGame({}, 1, { main: 'H01', sub: 'H04' });
    g.startBattle();
    const w = card('T009');
    g.hand.push(w);
    g.zeroCostPlays.set('T009', 3);
    const d = CARDS.T009;
    const orig = { wuxie: d.wuxie, response: d.response };
    try {
      d.wuxie = false; // 绕开「只能在响应窗口打出」，单测 M4 判定
      expect(g.checkPlay(w) ?? '').not.toMatch(/0 费牌每回合限/);
      d.response = false;
      expect(g.checkPlay(w) ?? '').toMatch(/0 费牌每回合限/);
    } finally {
      Object.assign(d, orig);
    }
  });
  it('打出 response 牌不累计 0 费次数', async () => {
    const { g } = mkGame({}, 1, { main: 'H01', sub: 'H04' });
    g.startBattle();
    const d = CARDS.T009;
    const orig = d.wuxie;
    try {
      d.wuxie = false;
      const w = card('T009');
      g.hand.push(w);
      await g.play(w, null).catch(() => undefined);
      expect(g.zeroCostPlays.get('T009') ?? 0).toBe(0);
    } finally {
      d.wuxie = orig;
    }
  });
});
