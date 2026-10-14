/** #176：敌方锦囊/延时锦囊结算通用化（去 D001/D003 id 特判） */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { delayTrickCombat, formatJudgeSuccess, trickTip, enemyIntent } from '../src/core/rules';
import { judgeOk, standardJudgeDeck } from '../src/core/effects';
import { ENEMIES } from '../src/data/enemies';
import { mkGame, card } from './helpers';
import type { Enemy } from '../src/core/types';
import type { Game } from '../src/core/battle';

const judgeAs = (g: Game, suit: 'S' | 'H' | 'C' | 'D', rank: number) => {
  g.judgeDeck.push(standardJudgeDeck().find((x) => x.suit === suit && x.rank === rank)!);
};

function withEnemy(id: string, over: Partial<Enemy> = {}): Enemy {
  return {
    ...ENEMIES[id],
    id,
    uid: 1,
    max: ENEMIES[id].hp,
    armor: 0,
    step: 0,
    marks: 0,
    judge: [],
    ...over,
  };
}

describe('#176 延时锦囊配置驱动', () => {
  it('D003 / D001 的判定条件与数值从 yaml 读出，不再写死', () => {
    const sd = delayTrickCombat(CONFIG.cards.D003)!;
    expect(sd).toMatchObject({ amount: 3, duration: 4, element: 'thunder', hasDamage: true });
    expect(sd.success).toEqual({ suit: ['S'], rankRange: [2, 9] });
    expect(formatJudgeSuccess(sd.success)).toBe('♠2–9');

    const lb = delayTrickCombat(CONFIG.cards.D001)!;
    expect(lb).toMatchObject({ duration: 2, hasSkip: true, hasDamage: false });
    expect(lb.success).toEqual({ suit: ['H'], not: true });
    expect(formatJudgeSuccess(lb.success)).toBe('不为 ♥');
  });

  it('trickTip 文案由配置生成；张角覆盖 amount=2', () => {
    const tip = trickTip({ trickOverrides: { D003: { amount: 2 } } }, 'D003');
    expect(tip).toBe('闪电：放入你的判定区，其每回合开始判定 ♠2–9 则你受2点雷电伤害，最多判定 4 次');
    expect(tip).not.toMatch(/D003/);
    // 无覆盖时用卡牌默认 3
    expect(trickTip({}, 'D003')).toContain('受3点雷电伤害');
    // 非延时伤害锦囊走兜底
    expect(trickTip({}, 'T009')).toMatch(/：锦囊$/);
  });

  it('B1 意图 tip 不再依赖 id 特判', () => {
    const e = withEnemy('B1');
    e.step = 1; // 锦囊:D003
    const tip = enemyIntent(e).tip;
    expect(tip).toContain('♠2–9');
    expect(tip).toContain('受2点雷电伤害');
    expect(tip).toContain('最多判定 4 次');
  });

  it('judgeOk 与卡牌 success 一致：♠2–9 / 不为 ♥', () => {
    const sd = delayTrickCombat(CONFIG.cards.D003)!;
    expect(judgeOk({ suit: 'S', rank: 5 }, sd.success)).toBe(true);
    expect(judgeOk({ suit: 'S', rank: 10 }, sd.success)).toBe(false);
    const lb = delayTrickCombat(CONFIG.cards.D001)!;
    expect(judgeOk({ suit: 'C', rank: 1 }, lb.success)).toBe(true);
    expect(judgeOk({ suit: 'H', rank: 1 }, lb.success)).toBe(false);
  });
});

describe('#176 敌方判定区通用结算（乐不思蜀）', () => {
  it('不为 ♥：跳过杀/锦囊；持续 2 回合后移除（无 D001 id 分支）', async () => {
    const { g } = mkGame({}, 1, { main: 'H03', sub: 'H04' });
    g.encounter = { name: 't', en: ['E101'] };
    g.startBattle();
    const e = g.en[0];
    e.pat = [['杀'], ['杀']];
    // 清掉同场其他干扰：只留这一只
    g.en = [e];
    const lb = card('D001');
    g.hand.push(lb);
    await g.play(lb, e);
    expect(e.judge).toContain(lb);

    const hp = g.p.hp;
    g.p.armor = 0;
    judgeAs(g, 'S', 5); // 不为 ♥ → skip
    await g.endTurn();
    expect(g.p.hp).toBe(hp);
    expect(g.logs.some((l) => l.includes('乐不思蜀生效'))).toBe(true);
    expect(e.judge).toContain(lb);

    judgeAs(g, 'H', 1); // ♥ → 不 skip；第 2 次判定后按 duration 移除
    g.hand.push(card('B004'));
    g.settings.autoShan = true;
    await g.endTurn();
    expect(e.judge).not.toContain(lb);
  });

  it('闪电命中：走 remove_delayed，不再靠 judged 特判', async () => {
    const prev = CONFIG.rules.mechanics.judgeSource;
    CONFIG.rules.mechanics.judgeSource = 'deck';
    try {
      const { g } = mkGame({}, 1, { main: 'H03', sub: 'H04' });
      g.encounter = { name: 't', en: ['E101'] };
      g.startBattle();
      const e = g.en[0];
      e.hp = e.max = 9;
      e.pat = [['闪']];
      const sd = card('D003');
      g.hand.push(sd);
      await g.play(sd, e);
      g.draw.push(card('B001', 'S', 5));
      await g.endTurn();
      expect(e.hp).toBe(6);
      expect(e.judge).not.toContain(sd);
    } finally {
      CONFIG.rules.mechanics.judgeSource = prev;
    }
  });
});

describe('#176 敌方锦囊放入玩家判定区（无 D003 id 特判）', () => {
  it('按配置放置；未知/无伤害延时锦囊跳过', async () => {
    const { g } = mkGame({}, 1, { main: 'H03', sub: 'H04' });
    g.encounter = { name: 't', en: ['B1'] };
    g.startBattle();
    const b = g.en[0];
    await g.enemyTrick(b, 'D003');
    expect(g.pJudge).toEqual([{ id: 'D003', name: '闪电', from: b.uid, amount: 2, left: 4 }]);

    await g.enemyTrick(b, 'D001'); // 乐不思蜀无对玩家伤害原子 → 未实装
    expect(g.logs.some((l) => l.includes('乐不思蜀') && l.includes('未实装'))).toBe(true);
    expect(g.pJudge).toHaveLength(1);

    await g.enemyTrick(b, 'NOPE');
    expect(g.logs.some((l) => l.includes('未实装'))).toBe(true);
  });

  it('resolvePlayerJudge 命中条件读配置', async () => {
    const { g } = mkGame({}, 1, { main: 'H03', sub: 'H04' });
    g.encounter = { name: 't', en: ['B1'] };
    g.startBattle();
    const b = g.en[0];
    await g.enemyTrick(b, 'D003');
    g.p.armor = 0;
    const hp = g.p.hp;
    judgeAs(g, 'S', 5);
    await g.resolvePlayerJudge(b);
    expect(hp - g.p.hp).toBe(2);
    expect(g.pJudge).toEqual([]);
  });
});
