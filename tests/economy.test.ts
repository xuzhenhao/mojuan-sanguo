import { describe, expect, it } from 'vitest';
import { seeded } from '../src/core/rng';
import { CONFIG } from '../src/data/config';
import { ECONOMY, POTIONS, RELICS } from '../src/data/economy';
import { addPotion, potionsFull } from '../src/game/economy/inventory';
import { cardPool, cardPrice, jitter, pickCards, rarityWeights, rollSuit } from '../src/game/economy/pools';
import { enterReward, resolvePotion, rollReward, takeCard, takeRelic } from '../src/game/economy/reward';
import { demoInventory } from '../src/game/economy/session';

const cfg = (id: string) => CONFIG.cards[id] as { rarity: string; exclusiveHero?: string; faction?: string };

describe('P4 经济：数值表对齐 PRD', () => {
  it('宝物 31 件、丹药 10 种、丹药栏 3 格、开局铜钱 60', () => {
    expect(RELICS).toHaveLength(31);
    expect(POTIONS).toHaveLength(10);
    expect(ECONOMY.potionSlots).toBe(3);
    expect(demoInventory().gold).toBe(60);
  });
  it('精英 E/L 权重 ×1.5', () => {
    const n = rarityWeights(1, 'normal');
    const e = rarityWeights(1, 'elite');
    expect(e.E).toBeCloseTo(n.E * 1.5);
    expect(e.N).toBe(n.N);
  });
});

describe('卡牌候选（14.8）', () => {
  it('专属牌只出主/副将的；三张不重复', () => {
    const inv = demoInventory();
    const pool = cardPool(inv);
    for (const c of pool) {
      const x = cfg(c.id).exclusiveHero;
      if (x) expect([inv.main, inv.sub]).toContain(x);
    }
    const rng = seeded(1);
    for (let i = 0; i < 50; i++) {
      const ids = pickCards(rng, pool, 3, rarityWeights(1, 'normal'));
      expect(new Set(ids).size).toBe(3);
    }
  });
  it('Boss 至少 1 张 E+', () => {
    const inv = demoInventory();
    const rng = seeded(2);
    for (let i = 0; i < 50; i++) {
      const ids = pickCards(rng, cardPool(inv), 3, rarityWeights(1, 'normal'), true);
      expect(ids.some((id) => ['E', 'L'].includes(cfg(id).rarity))).toBe(true);
    }
  });
  it('集市 common 行不含专属/势力牌，hero 行只含', () => {
    const inv = demoInventory();
    expect(cardPool(inv, 'common').every((c) => !cfg(c.id).exclusiveHero && !cfg(c.id).faction)).toBe(true);
    expect(cardPool(inv, 'hero').every((c) => cfg(c.id).exclusiveHero || cfg(c.id).faction)).toBe(true);
  });
  it('新牌花色点数合法', () => {
    const rng = seeded(3);
    for (let i = 0; i < 30; i++) {
      const s = rollSuit(rng, 'B001');
      expect(['S', 'H', 'C', 'D']).toContain(s.suit);
      expect(s.rank).toBeGreaterThanOrEqual(1);
      expect(s.rank).toBeLessThanOrEqual(13);
    }
  });
});

describe('价格（14.2）', () => {
  it('±10% 取整到 5；T002 基价 40 同样浮动；断袖香囊 −20%', () => {
    const rng = seeded(4);
    const inv = demoInventory();
    for (let i = 0; i < 40; i++) {
      const p = jitter(rng, 60, inv);
      expect(p % 5).toBe(0);
      expect(p).toBeGreaterThanOrEqual(55);
      expect(p).toBeLessThanOrEqual(65);
    }
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const p = cardPrice(rng, 'T002', inv);
      expect(p % 5).toBe(0);
      expect(p).toBeGreaterThanOrEqual(35);
      expect(p).toBeLessThanOrEqual(45);
      seen.add(p);
    }
    expect(seen.size).toBeGreaterThan(1);
    inv.relics.push('R09');
    for (let i = 0; i < 20; i++) expect(cardPrice(rng, 'T002', inv)).toBeLessThanOrEqual(35);
  });
});

describe('战斗奖励', () => {
  it('铜钱按章区间并自动入账；精英给 1 件宝物', () => {
    const inv = demoInventory();
    const o = rollReward(seeded(5), inv, 'elite');
    expect(o.gold).toBeGreaterThanOrEqual(40);
    expect(o.gold).toBeLessThanOrEqual(55);
    expect(o.relics).toHaveLength(1);
    const st = enterReward(inv, o);
    expect(inv.gold).toBe(60 + o.gold);
    expect(takeRelic(inv, st, o.relics[0])).toBe(true);
    expect(takeRelic(inv, st, o.relics[0])).toBe(false);
  });
  it('Boss：宝物三选一只出 Boss 级，不足用 E 补', () => {
    for (let s = 1; s < 30; s++) {
      const o = rollReward(seeded(s), demoInventory(), 'boss');
      expect(o.relics).toHaveLength(3);
      const rs = o.relics.map((id) => RELICS.find((r) => r.id === id)!.rarity);
      expect(rs.every((r) => r === 'Boss' || r === 'E')).toBe(true);
      expect(rs).toContain('Boss');
    }
  });
  it('Boss：宝物三选一、铜钱 80', () => {
    const o = rollReward(seeded(6), demoInventory(), 'boss');
    expect(o.relics).toHaveLength(3);
    expect(o.relicPick).toBe('choose');
    expect(o.gold).toBe(80);
  });
  it('丹药栏满：进入 full；替换或放弃', () => {
    const inv = demoInventory({ potions: 3 });
    expect(potionsFull(inv)).toBe(true);
    const o = { ...rollReward(seeded(7), inv, 'normal'), potion: 'P10' };
    const st = enterReward(inv, o);
    expect(st.potion).toBe('full');
    expect(resolvePotion(inv, st, 1)).toBe(true);
    expect(inv.potions[1]).toBe('P10');
    const st2 = enterReward(inv, { ...o });
    expect(resolvePotion(inv, st2, null)).toBe(true);
    expect(inv.potions[1]).toBe('P10');
  });
  it('选牌入卷一次', () => {
    const inv = demoInventory();
    const rng = seeded(8);
    const st = enterReward(inv, rollReward(rng, inv, 'normal'));
    const n = inv.deck.length;
    expect(takeCard(inv, st, 0)).toBe(true);
    expect(takeCard(inv, st, 1)).toBe(false);
    expect(inv.deck).toHaveLength(n + 1);
    expect(inv.deck[n].id).toBe(st.offer.cards[0].id);
  });
});

describe('背包', () => {
  it('addPotion：空位优先', () => {
    const inv = demoInventory({ potions: 1 });
    expect(addPotion(inv, 'P05')).toBe(true);
    expect(inv.potions[1]).toBe('P05');
  });
});

describe('经济并入 RunSession（#122 PR2）', () => {
  it('run.inventory：同一对象原地修改；新牌 uid 取 RunState.nextUid，写档时折回 RunState', async () => {
    const { RunSession } = await import('../src/game/run');
    const { addCard, removeCard } = await import('../src/game/economy/inventory');
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 1 });
    const next = run.state.nextUid;
    const inv = run.inventory;
    expect(run.inventory).toBe(inv);
    const c = addCard(inv, 'B001', 'S', 7);
    expect(c.uid).toBe(next);
    inv.gold += 5;
    const s = run.state;
    expect(s.nextUid).toBe(next + 1);
    expect(s.deck.map((x) => x.uid)).toContain(c.uid);
    expect(s.gold).toBe(inv.gold);
    expect(removeCard(inv, c.uid)).toBe(true);
    expect(run.state.deck.map((x) => x.uid)).not.toContain(c.uid);
  });
  it('经济随机流 = economy 流（runSeed ^ 0x45a5）', async () => {
    const { RunSession } = await import('../src/game/run');
    const { seeded } = await import('../src/core/rng');
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 9 });
    const ref = seeded((9 ^ 0x45a5) >>> 0);
    expect(run.rng('economy')()).toBe(ref());
  });
});
