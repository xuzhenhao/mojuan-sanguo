import { describe, expect, it } from 'vitest';
import { costDisplay, createLingFx, lingViewFromSlot, onLingDelta, slotCountOf, slotKind, FULL_BADGE_MS } from '../src/game/scenes/battle/ling';
import {
  advanceTutorial,
  createLingTutorial,
  LING_TUTORIAL_TEXT,
  onTutorialPlay,
  skipTutorial,
  tutorialCopyOk,
  tutorialHandHighlightIndex,
  tutorialStep,
  ensureTutorialHand,
  TUTORIAL_GAIN_CARD_ID,
} from '../src/game/scenes/battle/ling-tutorial';
import type { LingSlotSnapshot } from '../src/core/juling';
import { Game, type BattleIO } from '../src/core/battle';
import { seeded } from '../src/core/rng';

const io: BattleIO = {
  log: () => {},
  update: () => {},
  sleep: async () => {},
  showJudge: async () => {},
  respond: async () => null,
  epiphany: async () => null,
  onBattleEnd: () => {},
};

function slot(p: Partial<LingSlotSnapshot>): LingSlotSnapshot {
  const current = p.current ?? 0;
  const cap = p.cap ?? 3;
  const hardCap = p.hardCap ?? 6;
  return {
    current,
    cap,
    hardCap,
    overflow: p.overflow ?? current > cap,
    carryMax: p.carryMax ?? 2,
    delta: p.delta ?? 0,
    full: p.full ?? current >= hardCap,
  };
}

describe('#231 虎符 UI', () => {
  it('slotKind：自下而上点亮、溢出、保留预告', () => {
    const v = lingViewFromSlot(slot({ current: 2, cap: 3 }), 1);
    expect(slotCountOf(v)).toBe(3);
    expect(slotKind(v, 0, 3)).toBe('empty'); // 顶
    expect(slotKind(v, 1, 3)).toBe('full');
    expect(slotKind(v, 2, 3)).toBe('carry'); // 底有保留预告
    const ov = lingViewFromSlot(slot({ current: 4, cap: 3, overflow: true }));
    expect(slotKind(ov, 0, 3)).toBe('overflow');
  });

  it('「满」仅 full=true（hardCap）；maxGain 截断不出满', () => {
    const fx = createLingFx();
    const tally = { x: 18, y: 530, w: 30, h: 140 };
    const soft = lingViewFromSlot(slot({ current: 3, cap: 3, hardCap: 6, full: false, delta: 2 }));
    onLingDelta(fx, soft, 2, tally, 1000, false);
    expect(fx.float?.text).toBe('+2');
    expect(fx.fullMs).toBe(0);
    const hard = lingViewFromSlot(slot({ current: 6, cap: 3, hardCap: 6, full: true, delta: 1 }));
    onLingDelta(fx, hard, 1, tally, 2000, false);
    expect(fx.fullMs).toBe(FULL_BADGE_MS);
  });

  it('费用角标：减费 / 0 费', () => {
    const c = { uid: 1, id: 'B001', suit: 'S' as const, rank: 1, mods: [] };
    expect(costDisplay(c, 0)).toMatchObject({ display: 0, reduced: true });
    expect(costDisplay(c, 1).reduced).toBe(false);
  });

  it('教程文案禁「只能出3张」；可跳过；产令连打推进', () => {
    for (const st of LING_TUTORIAL_TEXT.steps) expect(tutorialCopyOk(st.body)).toBe(true);
    expect(tutorialCopyOk('每回合只能出3张')).toBe(false);
    let t = createLingTutorial();
    expect(tutorialStep(t)?.id).toBe('highlight-tally');
    t = advanceTutorial(t);
    t = onTutorialPlay(t, 'gain');
    expect(tutorialStep(t)?.id).toBe('play-again');
    t = onTutorialPlay(t, 'action');
    expect(tutorialStep(t)?.id).toBe('wrap');
    expect(skipTutorial(createLingTutorial()).done).toBe(true);
  });

  it('教程手牌强制待令，步骤2高亮产令而非杀', () => {
    let uid = 1;
    const hand = ensureTutorialHand(
      [
        { uid: uid++, id: 'B001', suit: 'S', rank: 7, mods: [] },
        { uid: uid++, id: 'B004', suit: 'H', rank: 2, mods: [] },
      ],
      () => uid++,
    );
    expect(hand[0].id).toBe(TUTORIAL_GAIN_CARD_ID);
    expect(tutorialHandHighlightIndex(hand, 'gain-card')).toBe(0);
    expect(hand[tutorialHandHighlightIndex(hand, 'gain-card')].id).not.toBe('B001');
    const ai = tutorialHandHighlightIndex(hand, 'action-card');
    expect(hand[ai].id).toBe('B001');
  });

  it('Game.lingSlot 供 UI；R02 虎符回合 +1 令写 lingDelta；P03 提神剂同', () => {
    const g = new Game(seeded(1), io, { autoShan: false, main: 'H01', sub: 'H02', relics: ['R02'] });
    g.startBattle();
    const snap = g.lingSlot();
    expect(snap).toMatchObject({ cap: expect.any(Number), hardCap: expect.any(Number), carryMax: 2 });
    expect(snap.current).toBeGreaterThanOrEqual(3); // 地板 + 虎符
    expect(g.lingDelta).toBeGreaterThan(0);
    expect(g.handLimit()).toBe(Math.max(2, g.p.hp) - 1);

    const g2 = new Game(seeded(2), io, { autoShan: false, main: 'H01', sub: 'H02' });
    g2.startBattle();
    const before = g2.p.ling;
    expect(g2.usePotion('P03')).toBeNull();
    expect(g2.p.ling).toBeGreaterThanOrEqual(before);
    expect(g2.lingSlot().delta).toBeGreaterThan(0);
  });
});
