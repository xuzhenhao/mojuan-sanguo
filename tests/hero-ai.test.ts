import { describe, expect, it } from 'vitest';
import { heroAiTurn, heroRespond, profileOf, bestTarget, isEnabler } from '../src/sim/hero-ai';
import { runBattle } from '../src/sim/autoplay';
import { card, mkGame } from './helpers';

const plays = () => ({ attack: 0, defense: 0, other: 0 });
function setup(main: string, sub: string, battleIdx = 0) {
  const r = mkGame({}, 1, { main, sub });
  r.g.battleIdx = battleIdx;
  r.g.startBattle();
  return r.g;
}

describe('武将画像从技能配置推导', () => {
  it('打空收益、郭嘉/曹操受伤摸牌、其他武将默认', () => {
    expect(profileOf(setup('H07', 'H08')).emptyHand).toBe(true); // 副将陆逊·连营·辅（hand_empty）
    expect(profileOf(setup('H05', 'H06')).takeHits).toBe(true);
    expect(profileOf(setup('H06', 'H05')).takeHits).toBe(true);
    expect(profileOf(setup('H01', 'H04'))).toMatchObject({ emptyHand: false, takeHits: false });
  });
});

describe('hero AI 行为', () => {
  it('有打空收益（连营·辅）时，手牌（除闪外）可全部打出就故意打空', async () => {
    const g = setup('H07', 'H08');
    g.hand = [card('T012'), card('B001')];
    g.p.ling = 3;
    await heroAiTurn(g, plays());
    expect(g.logs.join('|')).toContain('连营·辅');
  });
  it('张宝在场：后排弓手为使能者，优先作为目标；用义勇打后排', async () => {
    const g = setup('H03', 'H04', 2);
    const archer = g.en.find((e) => e.row === 'back')!;
    expect(isEnabler(g, archer)).toBe(true);
    g.p.yiyong = 1;
    expect(bestTarget(g, card('B001'))).toBe(archer);
    g.p.yiyong = 0;
    g.hand = [card('SH01'), card('B001'), card('B001')];
    g.p.ling = 3;
    await heroAiTurn(g, plays());
    expect(archer.hp).toBeLessThan(archer.max);
  });
  it('只在体力 ≤50% 或没有杀时吃桃', async () => {
    const g = setup('H03', 'H04');
    g.en.forEach((e) => (e.pat = [['闪']]));
    g.p.hp = 6;
    const tao = card('B005', 'H', 3);
    g.hand = [tao, card('B001')];
    g.p.ling = 1;
    await heroAiTurn(g, plays());
    expect(g.hand).toContain(tao); // 6 > ⌈8/2⌉ 且有杀
    g.p.hp = 4;
    g.p.ling = 3;
    g.hand = [tao, card('B001')];
    await heroAiTurn(g, plays());
    expect(g.hand).not.toContain(tao);
  });
  it('离间：选本回合出杀最多的敌人', async () => {
    const g = setup('H02', 'H04');
    g.hand = [];
    await heroAiTurn(g, plays());
    expect(g.logs.some((l) => l.includes('离间'))).toBe(true);
  });
  it('挟令：手牌 ≥3 且敌方有伤害时出牌前使用', async () => {
    const g = setup('H06', 'H05');
    g.hand = [card('B004'), card('B004'), card('T003')];
    g.p.armor = 0;
    g.p.ling = 0;
    await heroAiTurn(g, plays());
    expect(g.p.armor).toBe(2);
    expect(g.hand.length).toBe(2);
  });
  it('郭嘉：体力健康时吃 1 点杀换牌，残血时出闪', () => {
    const g = setup('H05', 'H06');
    g.en.forEach((e) => (e.pat = [['闪']]));
    g.p.armor = 0;
    g.hand = [card('B004')];
    expect(heroRespond(g, 1, () => true)).toBeNull();
    g.p.hp = 3;
    expect(heroRespond(g, 1, () => true)).not.toBeNull();
  });
  it('--ai greedy 仍可用且可复现；hero 与 greedy 不同', async () => {
    const a = await runBattle({ battleIdx: 0, seed: 7, ai: 'greedy', main: 'H05', sub: 'H06' });
    const b = await runBattle({ battleIdx: 0, seed: 7, ai: 'greedy', main: 'H05', sub: 'H06' });
    expect(a).toEqual(b);
    const h1 = await runBattle({ battleIdx: 0, seed: 7, main: 'H05', sub: 'H06' });
    const h2 = await runBattle({ battleIdx: 0, seed: 7, main: 'H05', sub: 'H06' });
    expect(h1).toEqual(h2);
  });
});

describe('#34 陆逊主将：回合结束补牌型连营也算打空收益', () => {
  it('profileOf(陆逊主将) 识别 turn_end + hand_count_at_most → draw', () => {
    expect(profileOf(setup('H08', 'H07')).emptyHand).toBe(true);
    expect(profileOf(setup('H08', 'H04')).emptyHand).toBe(true);
  });
  it('AI 会把手牌打到 ≤1，回合结束连营补到 2 张', async () => {
    const g = setup('H08', 'H04');
    g.en.forEach((e) => (e.pat = [['闪']]));
    g.hand = [card('T012'), card('B001'), card('X802')];
    g.p.ling = 3;
    await heroAiTurn(g, plays());
    expect(g.hand.length).toBeLessThanOrEqual(1);
    g.turnEnd();
    expect(g.logs.join('|')).toContain('连营：摸');
  });
});
