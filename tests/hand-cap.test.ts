/** PRD §5.4 手牌硬上限 10：超出时新摸到的牌直接进弃牌堆（reason hand_overflow），不触发弃置类效果 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { ATOMS } from '../src/core/effects';
import type { HandOverflowEvent } from '../src/core/battle';
import { checkSnapshot, withContract, type ContractReport } from '../src/sim/io-contract';
import { card, mkGame, mkIO } from './helpers';

const CAP = CONFIG.rules.handHardCap;
const fill = (n: number) => Array.from({ length: n }, (_, i) => card('B001', 'S', (i % 13) + 1));

function setup() {
  const evs: HandOverflowEvent[] = [];
  const logs: string[] = [];
  const { g } = mkGame({ handOverflow: (e) => evs.push(e), log: (t) => logs.push(t) });
  g.startBattle();
  return { g, evs, logs };
}

describe('手牌硬上限（PRD §5.4）', () => {
  it('配置为 10', () => expect(CAP).toBe(10));

  it('drawN：摸到满 10 张为止，其余进弃牌堆并逐张提示', () => {
    const { g, evs, logs } = setup();
    g.hand = fill(8);
    g.draw = fill(5);
    g.discard = [];
    g.drawN(5);
    expect(g.hand.length).toBe(CAP);
    expect(g.discard.length).toBe(3);
    expect(evs.map((e) => e.reason)).toEqual(['hand_overflow', 'hand_overflow', 'hand_overflow']);
    expect(evs.every((e) => g.discard.includes(e.card) && e.cap === CAP)).toBe(true);
    expect(logs.filter((t) => t.startsWith('手满，弃置')).length).toBe(3);
  });

  it('未满时不触发', () => {
    const { g, evs } = setup();
    g.hand = fill(3);
    g.draw = fill(3);
    g.drawN(3);
    expect(g.hand.length).toBe(6);
    expect(evs.length).toBe(0);
  });

  it('技能/锦囊摸牌（draw 原子）同样受限', async () => {
    const { g, evs } = setup();
    g.hand = fill(CAP);
    g.draw = fill(4);
    g.discard = [];
    const ab = { id: 't', name: '测试', trigger: { when: 'play' }, do: [] } as never;
    await ATOMS.draw(g, { do: 'draw', target: 'self', amount: 2 } as never, {} as never, { ab } as never);
    expect(g.hand.length).toBe(CAP);
    expect(g.discard.length).toBe(2);
    expect(evs.length).toBe(2);
  });

  it('addToHand（获得牌入口）满时进弃牌堆', () => {
    const { g, evs } = setup();
    g.hand = fill(CAP);
    g.discard = [];
    const c = card('B002');
    expect(g.addToHand(c)).toBe(false);
    expect(g.discard).toContain(c);
    expect(evs[0].card).toBe(c);
  });

  it('io-contract：handOverflow 事件与快照校验', () => {
    const { g } = mkGame();
    g.startBattle();
    const rep: ContractReport = { events: {}, violations: [] };
    const { io } = withContract(mkIO(), () => g, rep);
    (g as unknown as { io: typeof io }).io = io;
    g.hand = fill(CAP);
    g.draw = fill(1);
    g.drawN(1);
    expect(rep.events.handOverflow).toBe(1);
    expect(rep.violations).toEqual([]);
    g.hand = fill(CAP + 1);
    expect(checkSnapshot(g).some((v) => v.includes('硬上限'))).toBe(true);
  });
});
