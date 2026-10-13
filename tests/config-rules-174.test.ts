/** #174 config 化：事件开局护甲上限（rules.event.startArmorCap）与将魂结算系数（rules.settlement） */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { START_ARMOR_CAP, applyOption, eventDef, type EventRun } from '../src/game/event/logic';
import { SETTLEMENT_CONFIG, computeSoul, lastChapter, type RunOutcome } from '../src/game/result/settlement';
import { emptyStats } from '../src/game/run/stats';

const st = (o: Partial<EventRun> = {}): EventRun => ({
  hp: 5,
  maxHp: 8,
  gold: 100,
  deck: [],
  nextUid: 100,
  heroMain: 'H01',
  heroSub: 'H03',
  nextBattleArmor: 0,
  ...o,
});
const outcome = (o: Partial<RunOutcome> = {}): RunOutcome =>
  ({ win: true, tianming: 0, chaptersCleared: 1, stats: { ...emptyStats(), elitesKilled: 2, battlesWon: 7, bossKilled: 1 }, ...o }) as RunOutcome;

describe('#174 rules.event.startArmorCap', () => {
  it('值来自 config，PRD 定稿 4', () => {
    expect(CONFIG.rules.event.startArmorCap).toBe(4);
    expect(START_ARMOR_CAP).toBe(CONFIG.rules.event.startArmorCap);
  });
  it('事件收编护甲叠加不超过上限', () => {
    const s = st({ nextBattleArmor: 3 });
    applyOption(eventDef('V13')!, 0, s, () => 0);
    expect(s.nextBattleArmor).toBe(CONFIG.rules.event.startArmorCap);
  });
  it('源码里不再有魔法数字 4', () => {
    expect(readFileSync('src/core/battle.ts', 'utf8')).not.toMatch(/Math\.max\(this\.p\.armor, 4\)/);
    expect(readFileSync('src/game/event/logic.ts', 'utf8')).not.toMatch(/START_ARMOR_CAP = 4/);
  });
});

describe('#174 rules.settlement', () => {
  it('SETTLEMENT_CONFIG 就是 config 里的值，且等于 PRD 14.5 定稿', () => {
    expect(SETTLEMENT_CONFIG).toBe(CONFIG.rules.settlement);
    expect(SETTLEMENT_CONFIG).toEqual({
      soul: { perChapter: 30, perElite: 8, perWin: 2, perBoss: 40, defeatMul: 0.5, tianmingStep: 0.1 },
      maxTianming: 10,
    });
  });
  it('computeSoul 默认用 config 系数：30+16+14+40=100，天命 3 → 130；败北 ×0.5', () => {
    expect(computeSoul(outcome()).base).toBe(100);
    expect(computeSoul(outcome({ tianming: 3 })).total).toBe(130);
    expect(computeSoul(outcome({ win: false, chaptersCleared: 0 })).afterDefeat).toBe(35);
  });
  it('settlement 不再有 lastChapter，最后一章读 rules.run.chapters', () => {
    expect('lastChapter' in CONFIG.rules.settlement).toBe(false);
    expect(lastChapter()).toBe(CONFIG.rules.run!.chapters);
  });
  it('改 run.chapters 即改最后一章（调用时读取）', () => {
    const run = CONFIG.rules.run!;
    const old = run.chapters;
    try {
      run.chapters = 3;
      expect(lastChapter()).toBe(3);
    } finally {
      run.chapters = old;
    }
    expect(lastChapter({ run: { chapters: 2 } })).toBe(2);
    expect(lastChapter({})).toBe(1);
  });
  it('改系数即改结果（不再写死）', () => {
    const cfg = { ...CONFIG.rules.settlement.soul, perWin: 5 };
    expect(computeSoul(outcome(), cfg).base).toBe(121);
  });
});
