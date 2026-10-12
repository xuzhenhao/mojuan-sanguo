import { describe, expect, it } from 'vitest';
import { applyDamage, enemyDodges, enemyIntent, epiphanyRoll, handLimit, playerShaDamage, affixPool, addAffix, pick3 } from '../src/core/rules';
import { ENEMIES } from '../src/data/enemies';
import { seeded } from '../src/core/rng';
import { card } from './helpers';
import type { Enemy } from '../src/core/types';

const enemy = (id: string, over: Partial<Enemy> = {}): Enemy => ({
  ...ENEMIES[id],
  id,
  uid: 1,
  max: ENEMIES[id].hp,
  armor: 0,
  step: 0,
  marks: 0,
  judge: [],
  ...over,
});
const noBuff = { jiu: 0, aogu: 0, yiyong: 0 };

describe('伤害', () => {
  it('护甲先抵扣再扣体力', () => {
    const t = { hp: 8, armor: 2 };
    expect(applyDamage(t, 3)).toEqual({ absorbed: 2, hpLoss: 1 });
    expect(t).toEqual({ hp: 7, armor: 0 });
  });
  it('杀基础 1 点；锋锐/酒/傲骨/义勇叠加', () => {
    expect(playerShaDamage(card('B001'), noBuff)).toBe(1);
    expect(playerShaDamage(card('B001', 'S', 7, ['E_S01']), { jiu: 2, aogu: 1, yiyong: 1 }, 0, 1)).toBe(6);
    expect(playerShaDamage(card('X004'), noBuff, 1)).toBe(2);
  });
});

describe('敌人意图（无攻击力：伤害全部来自牌）', () => {
  it('普通杀 = 1 点，杀×2 = 2 点', () => {
    const e = enemy('E101');
    expect(enemyIntent(e)).toMatchObject({ dmg: 2, txt: '🗡杀×2' });
    e.step = 1;
    expect(enemyIntent(e)).toMatchObject({ dmg: 1, txt: '🗡杀' });
  });
  it('精英进化杀[锋锐] = 2 点并显示词条', () => {
    const e = enemy('E1E1');
    const i = enemyIntent(e);
    expect(i.dmg).toBe(4); // 平衡 v2：[杀+, 杀, 杀]
    expect(i.txt).toContain('杀[锋锐]');
  });
  it('意图循环、乐不思蜀跳过伤害、备闪/咒无伤害', () => {
    let e = enemy('E1E1', { step: 1 });
    expect(enemyIntent(e).acts).toEqual(['闪', '杀+', '杀']);
    expect(enemyIntent(e).dmg).toBe(3);
    e = enemy('E102', { step: 3 });
    expect(enemyIntent(e).acts).toEqual(['杀']);
    expect(enemyIntent(e, true).dmg).toBe(0);
    expect(enemyIntent(enemy('E103')).dmg).toBe(0);
  });
  it('所有敌人单张杀伤害均为 1（除进化词条外）', () => {
    for (const d of Object.values(ENEMIES))
      for (const acts of d.pat) for (const a of acts) if (a === '杀') expect(enemyIntent(enemy('E101', { pat: [[a]] })).dmg).toBe(1);
  });
});

describe('闪标记', () => {
  it('有标记自动抵消并消耗；无影不可闪', () => {
    const e = enemy('E103', { marks: 1 });
    expect(enemyDodges(e, true)).toBe(false);
    expect(enemyDodges(e, false)).toBe(true);
    expect(e.marks).toBe(0);
    expect(enemyDodges(e, false)).toBe(false);
  });
  it('无俦：需 2 枚标记，不足时不消耗', () => {
    const e = enemy('E103', { marks: 1 });
    expect(enemyDodges(e, false, 2)).toBe(false);
    expect(e.marks).toBe(1);
    e.marks = 2;
    expect(enemyDodges(e, false, 2)).toBe(true);
    expect(e.marks).toBe(0);
  });
});

describe('手牌上限', () => {
  it('max(2, 体力)', () => {
    expect(handLimit(8)).toBe(8);
    expect(handLimit(1)).toBe(2);
    expect(handLimit(-1)).toBe(2);
  });
});

describe('灵光一闪', () => {
  it('每场最多 2 次', () => expect(epiphanyRoll(() => 0, 2, 1)).toBe(false));
  it('8% 基础率', () => {
    expect(epiphanyRoll(() => 0.079, 0, 1)).toBe(true);
    expect(epiphanyRoll(() => 0.08, 0, 1)).toBe(false);
  });
  it('累计 12 张未触发 → 第 13 张必触发', () => {
    expect(epiphanyRoll(() => 0.99, 0, 12)).toBe(false);
    expect(epiphanyRoll(() => 0.99, 0, 13)).toBe(true);
    expect(epiphanyRoll(() => 0.99, 2, 13)).toBe(false);
  });
  it('词条池按类型过滤：火杀不出烈焰，扩写只给无中生有', () => {
    expect(affixPool(card('B002')).map((a) => a.n)).not.toContain('烈焰');
    expect(affixPool(card('T001')).map((a) => a.n)).toContain('扩写');
    expect(affixPool(card('T012')).map((a) => a.n)).not.toContain('扩写');
  });
  it('锋锐 maxPerDeck=2：牌组已有 2 张锋锐杀时不再出现在候选里', () => {
    const deck = [card('B001', 'S', 1, ['E_S01']), card('B001', 'S', 2, ['E_S01'])];
    expect(affixPool(card('B001'), deck.slice(0, 1)).map((a) => a.id)).toContain('E_S01');
    expect(affixPool(card('B001'), deck).map((a) => a.id)).not.toContain('E_S01');
  });
  it('三选一不重复；最多 2 条，满则替换最早', () => {
    const o = pick3(seeded(3), affixPool(card('B001')));
    expect(new Set(o.map((a) => a.id)).size).toBe(3);
    const c = card('B001');
    addAffix(c, 'A');
    addAffix(c, 'B');
    addAffix(c, 'C');
    expect(c.mods).toEqual(['B', 'C']);
  });
});
