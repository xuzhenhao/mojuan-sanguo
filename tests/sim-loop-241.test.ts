import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { cardScore, discardValue, isLoopCard, pickRewardCard, rewardCfg, shanCfg } from '../src/sim/loop-ai';
import { K0, mapBatch } from '../src/sim/map-run';
import { runBattle } from '../src/sim/autoplay';

const starter = Array(12).fill('B001');

describe('#241 sim 留闪开关 / 循环牌 AI / 奖励模拟', () => {
  it('config：sim.shan / sim.reward 字段存在且合法', () => {
    const s = CONFIG.rules.sim.shan;
    expect(['legacy', 'budget']).toContain(s.mode);
    expect(s.keepMax).toBeGreaterThanOrEqual(0);
    expect(s.takeHitHpRatio).toBeGreaterThanOrEqual(0);
    expect(s.takeHitHpRatio).toBeLessThanOrEqual(1);
    const r = CONFIG.rules.sim.reward;
    expect(r.skipBelow).toBeGreaterThan(0);
    expect(r.shopMaxCards).toBeGreaterThanOrEqual(0);
    expect(shanCfg({ mode: 'budget' }).mode).toBe('budget');
    expect(rewardCfg().skipBelow).toBe(r.skipBelow);
  });

  it('循环牌识别：T014–T023 都是循环牌，基础牌不是', () => {
    for (let i = 14; i <= 23; i++) expect(isLoopCard(`T0${i}`)).toBe(true);
    expect(isLoopCard('B001')).toBe(false);
  });

  it('选牌：自我替换循环牌（鼓进/连谋）优先；纯产令牌、稀释牌跳过；noLoop 不拿循环牌', () => {
    expect(cardScore('T015', starter)).toBeGreaterThan(cardScore('T014', starter));
    expect(pickRewardCard(['T014', 'T015', 'B001'], starter)).toBe(1);
    expect(pickRewardCard(['T014', 'T018', 'B001'], starter)).toBe(-1);
    expect(pickRewardCard(['T015', 'T021'], starter, { noLoop: true })).toBe(-1);
  });

  it('弃牌：budget 超过 keepMax 的闪降价，legacy 不降', () => {
    const shan = (uid: number) => ({ uid, id: 'B004', suit: 'H', rank: 2, mods: [] }) as never;
    const hand = [shan(1), shan(2), shan(3)];
    const g = { hand } as never;
    const v = (mode: 'legacy' | 'budget', i: number) => discardValue(g, hand[i], shanCfg({ mode, keepMax: 2 }));
    expect(v('legacy', 2)).toBe(v('legacy', 0));
    expect(v('budget', 2)).toBeLessThan(v('budget', 0));
  });

  it('两种留闪在同一种子上都能跑且可复现', async () => {
    for (const mode of ['legacy', 'budget'] as const) {
      const a = await runBattle({ battleIdx: 2, seed: 11, ai: 'hero', shan: { mode } });
      const b = await runBattle({ battleIdx: 2, seed: 11, ai: 'hero', shan: { mode } });
      expect(a).toEqual(b);
      expect(a.timeout).toBe(false);
    }
  });

  it('地图模式：全跳过奖励 = 不拿奖励；带循环牌每回合出牌更多', async () => {
    const base = await mapBatch(20, 777, {}, K0, {});
    const skip = await mapBatch(20, 777, {}, K0, { rewards: true, noLoop: true });
    const loop = await mapBatch(20, 777, {}, K0, { extraCards: ['T015', 'T015', 'T021', 'T021'] });
    expect(skip.deckSize).toBeGreaterThanOrEqual(12);
    if (skip.deckSize === 12) expect(skip.clear).toBe(base.clear);
    expect(loop.playsPerTurn).toBeGreaterThan(base.playsPerTurn + 0.5);
  }, 60000);
});
