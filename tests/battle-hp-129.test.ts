/** #129 / render-spec §8.8.2：武将 / 敌人体力不溢出卡框 */
import { CARDS } from '../src/data/cards';
import { describe, expect, it } from 'vitest';
import { enemyHpView, heroHpView, BEAD_D } from '../src/game/scenes/battle/hpview';
import { OverlayStack } from '../src/engine/modal';
import { BattleScene } from '../src/game/scenes/battle/scene';

const within = (a: { x: number; w: number }, b: { x: number; w: number }) => a.x >= b.x && a.x + a.w <= b.x + b.w;

describe('武将体力（§8.8.2）', () => {
  it('上限 ≤6：勾玉 17⌀，间距 clamp(…,2,4)，整排居中且不超出内窗', () => {
    for (let n = 1; n <= 6; n++) {
      const v = heroHpView(n, n, 100, 116);
      expect(v.mode).toBe('dots');
      if (v.mode !== 'dots') continue;
      expect(v.r * 2).toBe(BEAD_D);
      const left = v.xs[0] - v.r;
      const right = v.xs[n - 1] + v.r;
      expect(left).toBeGreaterThanOrEqual(100 - 58);
      expect(right).toBeLessThanOrEqual(100 + 58);
      expect((left + right) / 2).toBeCloseTo(100);
      if (n > 1) expect(v.xs[1] - v.xs[0] - BEAD_D).toBeGreaterThanOrEqual(2);
      if (n > 1) expect(v.xs[1] - v.xs[0] - BEAD_D).toBeLessThanOrEqual(4);
    }
  });
  it('上限 >6：紧凑式，满血 ×N、掉血 cur/max、0 体力空珠', () => {
    expect(heroHpView(10, 10, 0, 116)).toMatchObject({ mode: 'compact', full: true, max: 10 });
    expect(heroHpView(7, 9, 0, 116)).toMatchObject({ mode: 'compact', full: false, cur: 7, max: 9 });
    expect(heroHpView(-2, 8, 0, 116)).toMatchObject({ mode: 'compact', cur: 0, empty: true });
  });
  it('体力 1–10 的主将在 360×640 / 465×780 / 390×844 下不溢出卡框', () => {
    for (const [w, h] of [
      [360, 640],
      [465, 780],
      [390, 844],
    ]) {
      const sc = new BattleScene({ overlays: new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} }), debugDefaults: true });
      sc.enter({ width: w, height: h, invalidate() {} }, { seed: 7 });
      const card = sc.layout().main;
      for (let max = 1; max <= 10; max++)
        for (const hp of [0, 1, max - 1, max]) {
          const r = sc.heroHpRect(card, hp, max);
          expect(within(r, card), `${w}×${h} ${hp}/${max}`).toBe(true);
          expect(r.y + r.h).toBeLessThanOrEqual(card.y + card.h);
        }
    }
  });
});

describe('敌人体力（§8.8.2）', () => {
  it('一律数字：普通 / 精英小牌，Boss 或 >10 血条', () => {
    expect(enemyHpView(3, 5, false)).toEqual({ mode: 'plate', text: '3/5' });
    expect(enemyHpView(18, 18, true)).toMatchObject({ mode: 'bar', text: '18/18', ratio: 1 });
    expect(enemyHpView(6, 12, false)).toMatchObject({ mode: 'bar', ratio: 0.5 });
    expect(enemyHpView(-1, 8, false).text).toBe('0/8');
  });
});

describe('敌人体力 18 不溢出（360×640 / 465×780）', () => {
  it('每个敌人卡：体力 18/18、9/18、0/18 的数字牌 / 血条都在卡框内', () => {
    for (const [w, h] of [
      [360, 640],
      [465, 780],
    ]) {
      const sc = new BattleScene({ overlays: new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} }), debugDefaults: true });
      sc.enter({ width: w, height: h, invalidate() {} }, { seed: 7 });
      expect(sc.g.en.length).toBeGreaterThan(0);
      for (const e of sc.g.en) {
        const card = sc.enemyRect(e)!;
        for (const hp of [18, 9, 0])
          for (const boss of [false, true]) {
            const r = sc.enemyHpRect(card, { hp, max: 18 }, boss);
            expect(within(r, card), `${w}×${h} ${e.id} ${hp}/18`).toBe(true);
            expect(r.y + r.h).toBeLessThanOrEqual(card.y + card.h);
          }
        const r5 = sc.enemyHpRect(card, { hp: 3, max: 5 }, false);
        expect(within(r5, card)).toBe(true);
      }
    }
  });
});

describe('#129 Boss 判定看节点类型', () => {
  const mk = (nodeType?: () => string | undefined) => {
    const sc = new BattleScene({ overlays: new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} }), debugDefaults: true, nodeType });
    sc.enter({ width: 390, height: 844, invalidate() {} }, { seed: 7 });
    return sc;
  };
  it('最后一战但节点不是 BOSS：不显示 Boss 血条', () => {
    const sc = mk(() => 'NORMAL');
    Object.defineProperty(sc.g, 'isLast', { get: () => true });
    const e = { ...sc.g.en[0], hp: 5, max: 8, tier: 'Boss' };
    expect(sc.isBoss(e)).toBe(false);
    const card = sc.enemyRect(sc.g.en[0])!;
    expect(sc.enemyHpRect(card, e).h).toBe(16); // 小牌，不是 h=10 血条
  });
  it('BOSS 节点：血条', () => {
    const sc = mk(() => 'BOSS');
    const e = { ...sc.g.en[0], hp: 5, max: 8 };
    expect(sc.isBoss(e)).toBe(true);
    expect(sc.enemyHpRect(sc.enemyRect(sc.g.en[0])!, e).h).toBe(10);
  });
  it('无节点（直达调试）：看敌人 tier', () => {
    const sc = mk();
    expect(sc.isBoss({ tier: 'Boss' })).toBe(true);
    expect(sc.isBoss({ tier: '精英' })).toBe(false);
  });
});

describe('#129 开发调试参数 applyDev', () => {
  const mk = (dev: object) => {
    const ov = new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
    const sc = new BattleScene({ overlays: ov, debugDefaults: true, dev });
    sc.enter({ width: 390, height: 844, invalidate() {} }, { seed: 7 });
    return { sc, ov };
  };
  it('hp/maxHp/ehp', () => {
    const { sc } = mk({ hp: 6, maxHp: 10, ehp: 18 });
    expect([sc.g.p.hp, sc.g.p.maxHp]).toEqual([6, 10]);
    expect(sc.g.en.every((e) => e.hp === 18 && e.max === 18)).toBe(true);
    const { sc: s4 } = mk({ hp: 4 });
    expect([s4.g.p.hp, s4.g.p.maxHp]).toEqual([4, 4]);
  });
  it('boss=1 强制 Boss 血条', () => {
    const { sc } = mk({ boss: true });
    expect(sc.isBoss({ tier: '小怪' })).toBe(true);
  });
  it('longName 把最长牌名放进手牌', () => {
    const { sc } = mk({ longName: true });
    const L = Math.max(...Object.values(CARDS).map((c) => c.name.length));
    expect(sc.g.hand.some((c) => CARDS[c.id].name.length === L)).toBe(true);
  });
});
