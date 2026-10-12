import { describe, expect, it } from 'vitest';
import { ARMOR, RULES } from '../src/data/heroes';
import { CARDS } from '../src/data/cards';
import { AFFIXES } from '../src/data/affixes';
import { card, mkGame } from './helpers';

function setup() {
  const r = mkGame({}, 1);
  r.g.startBattle();
  r.g.en.forEach((e) => (e.pat = [['闪']]));
  return r;
}

describe('难度方案 D 第 1 轮：护甲保留上限', () => {
  it('首回合保留龙虎会开场 3 护甲', () => {
    const { g } = setup();
    expect(g.p.armor).toBe(3);
  });
  it('回合开始护甲超过 2 点时削到 2', async () => {
    const { g } = setup();
    g.p.armor = 7;
    await g.endTurn();
    expect(g.turn).toBe(2);
    expect(g.p.armor).toBe(RULES.armorKeep);
    expect(RULES.armorKeep).toBe(2);
  });
  it('护甲不足 2 点时原样保留', async () => {
    const { g } = setup();
    g.p.armor = 1;
    await g.endTurn();
    expect(g.p.armor).toBe(1);
  });
});

describe('难度方案 D 第 1 轮：护甲牌数值', () => {
  it('数值表', () => {
    expect(ARMOR).toEqual({ yiyidailao: 3, gushou: 3, jinchuangyao: 4, qijinqichu: 3, affixJiangu: 2, affixHuichun: 2 });
    expect(CARDS.T012.desc).toContain('3');
    expect(AFFIXES.find((a) => a.id === 'E_W01')!.d).toContain('2');
    expect(AFFIXES.find((a) => a.id === 'E_P02')!.d).toContain('2');
  });
  it('以逸待劳 +3 护甲', async () => {
    const { g } = setup();
    g.p.armor = 0;
    const c = card('T012');
    g.hand.push(c);
    await g.play(c, null);
    expect(g.p.armor).toBe(3);
  });
  it('坚固装备 +2 护甲；回春桃 +2 护甲', async () => {
    const { g } = setup();
    g.p.armor = 0;
    const eq = card('A001', 'S', 7, ['E_W01']);
    g.hand.push(eq);
    await g.play(eq, null);
    expect(g.p.armor).toBe(2);
    g.p.hp = 5;
    const t = card('B005', 'H', 7, ['E_P02']);
    g.hand.push(t);
    await g.play(t, null);
    expect(g.p.armor).toBe(4);
  });
});
