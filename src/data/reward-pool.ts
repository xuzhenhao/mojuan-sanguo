import { CONFIG, rewardWeight } from './config';
import { loopCardAllowedInChapter } from '../core/juling';

/** 奖励池（PRD 6.8 第 3 条）：同稀有度内按 rewardWeight 抽取；专属牌与权重 0 的牌不进池；loop 卡按章稀有度门控（#230） */
export function rewardPool(rarity: string, chapter = 1): { id: string; weight: number }[] {
  return Object.values(CONFIG.cards)
    .filter((c) => c.rarity === rarity && !(c as { exclusiveHero?: string }).exclusiveHero && rewardWeight(c.id) > 0 && loopCardAllowedInChapter(c, chapter))
    .map((c) => ({ id: c.id, weight: rewardWeight(c.id) }));
}

/** 按权重抽一张；rng 返回 [0,1) */
export function pickReward(rarity: string, rng: () => number, chapter = 1): string | null {
  const pool = rewardPool(rarity, chapter);
  const total = pool.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return null;
  let x = rng() * total;
  for (const p of pool) {
    x -= p.weight;
    if (x < 0) return p.id;
  }
  return pool[pool.length - 1].id;
}
