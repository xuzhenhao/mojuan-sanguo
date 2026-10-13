/** #230 军令循环：留令 / 费用护栏 / 出牌顶 / 章稀有度门控 */
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { loopCardAllowedInChapter, zeroCostPerTurn } from '../src/core/juling';
import { rewardPool } from '../src/data/reward-pool';
import { cardPool } from '../src/game/economy/pools';
import { card, mkGame } from './helpers';

const snap = {
  juling: structuredClone(CONFIG.rules.juling),
  cost: structuredClone(CONFIG.rules.cost),
  loop: structuredClone(CONFIG.rules.loop),
  mechanics: { ...CONFIG.rules.mechanics },
};
afterEach(() => {
  CONFIG.rules.juling = structuredClone(snap.juling);
  CONFIG.rules.cost = structuredClone(snap.cost);
  CONFIG.rules.loop = structuredClone(snap.loop);
  Object.assign(CONFIG.rules.mechanics, snap.mechanics);
});

function setup(heroes: { main?: string; sub?: string; preset?: string } = { preset: 'legacy_guanyu_zhaoyun' }) {
  CONFIG.rules.mechanics.judgeSource = 'deck';
  const r = mkGame({}, 1, heroes);
  r.g.startBattle();
  r.g.en.forEach((e) => (e.pat = [['闪']]));
  return r.g;
}

describe('#230 配置落盘', () => {
  it('juling / cost / loop 与数值草稿一致', () => {
    expect(CONFIG.rules.juling).toEqual({ perTurn: 3, carryMax: 2, hardCap: 6, maxGainPerTurn: 2 });
    expect(CONFIG.rules.cost?.floor).toBe(0);
    expect(CONFIG.rules.cost?.zeroCostPerTurn).toBe(1);
    expect(CONFIG.rules.cost?.reduceStackMax).toBe(1);
    expect(CONFIG.rules.cost?.zeroCostExemptTags).toContain('m4_exempt');
    expect(CONFIG.rules.loop?.maxPlaysPerTurn).toBe(8);
    expect(CONFIG.rules.loop?.chapterRarity?.[1] ?? CONFIG.rules.loop?.chapterRarity?.['1' as unknown as number]).toEqual(['N', 'R']);
  });
  it('循环件覆盖产令/费减两档，史诗带 loop', () => {
    const loop = Object.values(CONFIG.cards).filter((c) => (c.tags ?? []).includes('loop'));
    expect(loop.length).toBeGreaterThanOrEqual(8);
    expect(loop.some((c) => c.id === 'T014' && c.rarity === 'N')).toBe(true); // G1
    expect(loop.some((c) => c.id === 'T017' && c.rarity === 'R')).toBe(true); // G2
    expect(loop.some((c) => c.id === 'T018' && c.rarity === 'N')).toBe(true); // C1
    expect(loop.some((c) => c.id === 'T020' && c.rarity === 'R')).toBe(true); // C2
    expect(
      loop
        .filter((c) => c.rarity === 'E')
        .map((c) => c.id)
        .sort(),
    ).toEqual(['T022', 'T023']);
  });
});

describe('#230 回合结束保留 ≤ carryMax', () => {
  it('余量超过 carryMax 时压到 2，下回合 = 保留 + 地板', async () => {
    const g = setup();
    expect(g.p.ling).toBe(3);
    g.p.ling = 5; // 模拟产令后余量
    g.turnEnd();
    expect(g.p.ling).toBe(2);
    await g.endTurn([]);
    expect(g.p.ling).toBe(2 + 3); // carry + perTurn
  });
  it('余量不足 carryMax 时原样保留', async () => {
    const g = setup();
    g.p.ling = 1;
    g.turnEnd();
    expect(g.p.ling).toBe(1);
    await g.endTurn([]);
    expect(g.p.ling).toBe(1 + 3);
  });
});

describe('#230 费用下限 floor=0 与 reduceStackMax', () => {
  it('cost.floor 为 0：诸葛弩可将杀降到 0', () => {
    const g = setup();
    expect(CONFIG.rules.cost?.floor).toBe(0);
    g.p.equip.weapon = card('W001', 'D', 1);
    expect(g.costOf(card('B001'))).toBe(0);
  });
  it('reduceStackMax=1：轻招 + 诸葛弩合计最多 −1', () => {
    const g = setup();
    g.p.equip.weapon = card('W001', 'D', 1);
    const sha = card('B001', 'S', 7, ['E_S02']); // 轻招 card_cost -1
    // 基价 1，两路 −费各 −1，合计封顶 −1 → 仍为 0
    expect(g.costOf(sha)).toBe(0);
    // 基价 2 的杀（武圣斩）：封顶 −1 → 1，不会到 0
    const wusheng = card('X004', 'H', 5, ['E_S02']);
    if (CONFIG.cards.X004) {
      expect(g.costOf(wusheng)).toBe(Math.max(0, CONFIG.cards.X004.cost - 1));
    }
  });
  it('轻杀：下一张杀 −1，打出后消费', async () => {
    const g = setup();
    const buff = card('T018');
    const sha = card('B001');
    g.hand.push(buff, sha);
    g.p.ling = 5;
    expect(g.checkPlay(buff)).toBeNull();
    await g.play(buff, null);
    expect(g.p.status.sha_cost_next).toBe(1);
    expect(g.costOf(sha)).toBe(0);
    await g.play(sha, g.en[0]);
    expect(g.p.status.sha_cost_next).toBeUndefined();
    expect(g.costOf(card('B001'))).toBe(1);
  });
});

describe('#230 zeroCostPerTurn 与 m4 白名单', () => {
  it('普通 0 费仍限 1；号角带 m4_exempt 不限', async () => {
    expect(zeroCostPerTurn()).toBe(1);
    const g = setup();
    const a = card('T013');
    const b = card('T013');
    g.hand.push(a, b);
    await g.play(a, g.en[0]);
    expect(g.checkPlay(b)).toMatch(/0 费牌每回合限/);
    const h1 = card('T016');
    const h2 = card('T016');
    g.hand.push(h1, h2);
    g.p.ling = 5;
    expect(g.checkPlay(h1)).toBeNull();
    await g.play(h1, null);
    expect(g.checkPlay(h2)).toBeNull(); // 白名单
  });
});

describe('#230 maxPlaysPerTurn', () => {
  it('达到 8 次后不能再主动出牌', async () => {
    const g = setup();
    CONFIG.rules.loop!.maxPlaysPerTurn = 3;
    g.p.ling = 9;
    for (let i = 0; i < 3; i++) {
      const c = card('T014');
      g.hand.push(c);
      expect(g.checkPlay(c)).toBeNull();
      await g.play(c, null);
    }
    const blocked = card('T014');
    g.hand.push(blocked);
    expect(g.checkPlay(blocked)).toMatch(/本回合最多出 3 张牌/);
  });
});

describe('#230 hardCap / maxGainPerTurn', () => {
  it('额外产令受 maxGainPerTurn，总量受 hardCap', () => {
    const g = setup();
    g.p.ling = 3;
    g.lingGainedThisTurn = 0;
    expect(g.addLing(2)).toBe(2);
    expect(g.p.ling).toBe(5);
    expect(g.addLing(2)).toBe(0); // 已达 maxGainPerTurn 2
    expect(g.p.ling).toBe(5);
    g.lingGainedThisTurn = 0;
    g.p.ling = 5;
    expect(g.addLing(2)).toBe(1); // hardCap 6
    expect(g.p.ling).toBe(6);
  });
});

describe('#230 待令 pending_ling', () => {
  it('打出后下回合开始再 +1', async () => {
    const g = setup();
    const c = card('T017');
    g.hand.push(c);
    g.p.ling = 5;
    await g.play(c, null);
    expect(g.p.status.pending_ling).toBe(1);
    g.hand = [];
    await g.endTurn([]);
    // carry 后 + perTurn + pending（计额外产令）+ 无谦逊
    expect(g.p.status.pending_ling).toBeUndefined();
    expect(g.p.ling).toBeGreaterThanOrEqual(3);
  });
});

describe('#230 第 1 章稀有度门控', () => {
  it('loopCardAllowedInChapter：史诗 loop 卡第 1 章禁、第 2 章开', () => {
    const epic = CONFIG.cards.T022;
    const rare = CONFIG.cards.T017;
    expect(loopCardAllowedInChapter(rare, 1)).toBe(true);
    expect(loopCardAllowedInChapter(epic, 1)).toBe(false);
    expect(loopCardAllowedInChapter(epic, 2)).toBe(true);
  });
  it('rewardPool / cardPool 第 1 章不含史诗 loop 卡', () => {
    const ids = rewardPool('E', 1).map((x) => x.id);
    expect(ids).not.toContain('T022');
    expect(ids).not.toContain('T023');
    const pool = cardPool({ main: 'H03', sub: 'H04', chapter: 1 });
    expect(pool.some((c) => c.id === 'T022')).toBe(false);
    const pool2 = cardPool({ main: 'H03', sub: 'H04', chapter: 2 });
    expect(pool2.some((c) => c.id === 'T022')).toBe(true);
  });
});

describe('#230 lingSlot 只读 API（供 #231）', () => {
  it('锁定字段：current/cap/hardCap/overflow/carryMax/delta/full', () => {
    const g = setup();
    g.p.ling = 5;
    g.lingDelta = 2;
    const s = g.lingSlot();
    expect(s).toEqual({
      current: 5,
      cap: 3,
      hardCap: 6,
      overflow: true,
      carryMax: 2,
      delta: 2,
      full: false,
    });
    g.p.ling = 6;
    expect(g.lingSlot().full).toBe(true);
  });
  it('maxGainPerTurn 截断不置 full；触 hardCap 才 full', () => {
    const g = setup();
    g.p.ling = 3;
    g.lingGainedThisTurn = 0;
    expect(g.addLing(2)).toBe(2);
    expect(g.lingSlot().full).toBe(false);
    expect(g.lingSlot().delta).toBe(2);
    expect(g.addLing(2)).toBe(0); // 静默截断
    expect(g.lingSlot().delta).toBe(0);
    expect(g.lingSlot().full).toBe(false);
    g.lingGainedThisTurn = 0;
    g.p.ling = 5;
    expect(g.addLing(2)).toBe(1); // 触 hardCap
    expect(g.lingSlot().full).toBe(true);
    expect(g.lingSlot().delta).toBe(1);
  });
});
