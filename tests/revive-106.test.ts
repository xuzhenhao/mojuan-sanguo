import { describe, expect, it } from 'vitest';
import { mkGame } from './helpers';
import { enemyIntent, reviveAllowed, reviveHp } from '../src/core/rules';
import { CONFIG } from '../src/data/config';
import { MAX_FLASH_MARKS } from '../src/data/enemies';
import type { ReviveEvent } from '../src/core/battle';

function setup(answer: boolean | undefined, reviveLeft = 1, tianming = 0) {
  const asked: ReviveEvent[] = [];
  const { g, io } = mkGame(answer === undefined ? {} : { revive: async (ev) => (asked.push(ev), answer) });
  g.startBattle();
  g.reviveLeft = reviveLeft;
  g.tianming = tianming;
  g.en = [g.spawnEnemy('E101'), g.spawnEnemy('E101')];
  for (const e of g.en) {
    e.pat = [['杀', '杀'], ['杀']];
    e.step = 0;
    e.marks = 0;
    e.flash = 0;
  }
  g.hand = [];
  g.p.hp = 1;
  g.p.armor = 0;
  return { g, io, asked };
}

describe('#106 复活规则（rules.revive）', () => {
  it('体力 = max(hpMin, ceil(maxHp × hpRatio))：7/8 → 2，9 → 3', () => {
    expect(CONFIG.rules.revive).toEqual({ count: 1, hpRatio: 0.25, hpMin: 2, armor: 3 });
    expect([7, 8, 9, 10, 12].map((m) => reviveHp(m))).toEqual([2, 2, 3, 3, 3]);
    expect(reviveHp(9, { hpRatio: 0.5, hpMin: 1 })).toBe(5);
  });
  it('有次数且天命 < 5 才可复活', () => {
    expect(reviveAllowed(1, 0)).toBe(true);
    expect(reviveAllowed(1, 4)).toBe(true);
    expect(reviveAllowed(1, 5)).toBe(false);
    expect(reviveAllowed(0, 0)).toBe(false);
  });
});

describe('#106 core：复活流程', () => {
  it('敌方回合中复活：扣次数、回体力+护甲，剩余出牌取消，不战败', async () => {
    const { g, io, asked } = setup(true);
    const [a, b] = g.en;
    await g.enemyTurn();
    expect(asked).toEqual([{ left: 1, hp: reviveHp(g.p.maxHp), armor: 3 }]);
    expect(g.reviveLeft).toBe(0);
    expect(g.over).toBe(false);
    expect(io.ended).toEqual([]);
    expect(g.p.hp).toBe(reviveHp(g.p.maxHp)); // 同一敌人的第二张杀与后面敌人都被取消
    expect(a.step).toBe(1); // 正在出牌的敌人本步算用掉
    expect(b.step).toBe(0); // 未行动的敌人不推进
  });
  it('复活后意图栏立即显示 [闪]；下一敌方回合只出闪（+1 闪标记，上限 2），之后从原意图继续', async () => {
    const { g } = setup(true);
    await g.enemyTurn();
    for (const e of g.alive()) expect(enemyIntent(e).acts).toEqual(['闪']);
    const steps = g.alive().map((e) => e.step);
    const hp = g.p.hp;
    g.alive()[0].marks = MAX_FLASH_MARKS;
    await g.enemyTurn();
    expect(g.p.hp).toBe(hp); // 不出杀
    expect(g.alive().map((e) => e.marks)).toEqual([MAX_FLASH_MARKS, 1]);
    expect(g.alive().map((e) => e.step)).toEqual(steps.map((s) => s + 1)); // 被替换的一步不补打
    for (const e of g.alive()) {
      expect(e.reviveFlash).toBeFalsy();
      expect(enemyIntent(e).acts).toEqual(e.pat[e.step % e.pat.length]);
    }
  });
  it('选「放弃」：战败，次数不扣', async () => {
    const { g, io } = setup(false);
    await g.enemyTurn();
    expect(g.over).toBe(true);
    expect(io.ended).toEqual([false]);
    expect(g.reviveLeft).toBe(1);
  });
  it('无次数 / 天命 ≥5 / 无复活 IO：不弹层，直接战败', async () => {
    for (const [left, tm, ans] of [
      [0, 0, true],
      [1, 5, true],
      [1, 0, undefined],
    ] as const) {
      const { g, io, asked } = setup(ans, left, tm);
      await g.enemyTurn();
      expect(asked).toEqual([]);
      expect(io.ended).toEqual([false]);
    }
  });
  it('玩家回合内（如自伤）复活：不取消敌方回合，下一敌方回合只出闪', async () => {
    const { g } = setup(true);
    g.p.hp = 1;
    await g.dmgPlayer(1);
    expect(g.p.hp).toBe(reviveHp(g.p.maxHp));
    for (const e of g.alive()) expect(e.reviveFlash).toBe(true);
    const hp = g.p.hp;
    await g.enemyTurn();
    expect(g.p.hp).toBe(hp);
    expect(g.alive().every((e) => e.marks === 1)).toBe(true);
  });
});
