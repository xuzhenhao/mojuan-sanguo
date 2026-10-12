import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { card, mkGame } from './helpers';

const M0 = { ...CONFIG.rules.mechanics };
afterEach(() => Object.assign(CONFIG.rules.mechanics, M0));

function setup(over = {}, seed = 1) {
  CONFIG.rules.mechanics.judgeSource = 'deck'; // 预置判定牌；M1 签筒见 effects.test
  const r = mkGame(over, seed);
  r.g.startBattle();
  return r;
}

describe('回合与摸牌', () => {
  it('首回合摸 5，军令 3；之后每回合摸 3', async () => {
    const { g } = setup();
    expect(g.hand.length).toBe(5);
    expect(g.p.ling).toBe(3);
    expect(g.p.armor).toBe(3); // 龙虎会
    g.en.forEach((e) => (e.pat = [['闪']]));
    await g.endTurn();
    expect(g.turn).toBe(2);
    expect(g.hand.length).toBe(8);
  });
  it('超出手牌上限需弃牌', () => {
    const { g } = setup();
    g.p.hp = 3;
    expect(g.discardNeeded()).toBe(2);
  });
});

describe('判定', () => {
  it('judgeSource=deck：从摸牌堆顶亮牌并进入弃牌堆', async () => {
    const { g } = setup();
    const top = card('B001', 'H', 5);
    g.draw.push(top);
    const r = await g.judge('测试');
    expect(r).toMatchObject({ kind: 'judge', source: 'deck', cardId: 'B001', uid: top.uid, suit: 'H', rank: 5, color: 'red' });
    expect(g.discard).toContain(top);
  });
});

describe('敌人杀 → 闪响应', () => {
  it('护主红色判定使杀无效（V1：红色）', async () => {
    const { g } = setup();
    g.draw.push(card('B001', 'H', 9));
    expect(await g.enemySha(g.en[0], 1)).toBe('huzhu');
    expect(g.p.hp).toBe(8);
  });
  it('护主失败后可出闪抵消', async () => {
    const { g } = setup();
    g.io.respond = async (_t, legal) => g.hand.find(legal) ?? null;
    const shan = card('B004', 'D', 2);
    g.hand.push(shan);
    g.draw.push(card('B001', 'S', 9));
    expect(await g.enemySha(g.en[0], 1)).toBe('shan');
    expect(g.hand).not.toContain(shan);
  });
  it('不出闪：受 1 点伤害，先扣护甲', async () => {
    const { g } = setup();
    g.hand = g.hand.filter((c) => c.id !== 'B004');
    g.effects.used.enemy_turn.set('sub:huzhu', 1);
    expect(await g.enemySha(g.en[0], 1)).toBe('hit');
    expect(g.p.armor).toBe(2);
    expect(g.p.hp).toBe(8);
  });
  it('玩家杀被敌人闪标记抵消，不触发灵光一闪', async () => {
    const { g } = setup();
    g.settings.epiphanyRate = 1;
    const s = card('B001');
    g.hand.push(s);
    g.en[0].marks = 1;
    await g.play(s, g.en[0]);
    expect(g.en[0].hp).toBe(g.en[0].max);
    expect(g.epiCount).toBe(0);
  });
  it('玩家杀命中 1 点并可触发灵光一闪写入词条', async () => {
    const { g } = setup();
    g.settings.epiphanyRate = 1;
    const s = card('B001');
    g.hand.push(s);
    await g.play(s, g.en[0]);
    expect(g.en[0].hp).toBe(g.en[0].max - 1);
    expect(g.epiCount).toBe(1);
    expect(s.mods.length).toBe(1);
  });
});

describe('距离', () => {
  it('后排距离 2，基础范围 1 打不到；前排清空后前移', () => {
    const { g } = setup();
    const back = g.en.find((e) => e.row === 'back')!;
    expect(g.inRange(back, card('B001'))).toBe(false);
    g.front().forEach((e) => (e.hp = 0));
    g.fixRows();
    expect(back.row).toBe('front');
  });
});
