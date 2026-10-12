/** 锦囊 → 无懈可击决策点（PRD 5.9.2） */
import { describe, expect, it } from 'vitest';
import type { RespondKind } from '../src/core/battle';
import { CARDS } from '../src/data/cards';
import { CONFIG } from '../src/data/config';
import { heroWuxie } from '../src/sim/hero-ai';
import { runBattle } from '../src/sim/autoplay';
import { card, mkGame } from './helpers';

function setup(answer: 'use' | 'pass') {
  const calls: { text: string; pass: string; timed: boolean; kind?: RespondKind }[] = [];
  const r = mkGame(
    {
      respond: async (text, legal, pass, timed, kind) => {
        calls.push({ text, pass, timed, kind });
        return answer === 'use' ? (r.g.hand.find(legal) ?? null) : null;
      },
    },
    1,
    { main: 'H01', sub: 'H04' },
  );
  const g = r.g;
  g.startBattle();
  g.en.forEach((e) => (e.pat = [['闪']]));
  g.en[0].pat = [['咒']];
  return { g, calls };
}

describe('T009 无懈可击', () => {
  it('配置：0 费 R 锦囊，带 wuxie 标记，不在任何起始牌组', () => {
    expect(CARDS.T009).toMatchObject({ cost: 0, trick: true, wuxie: true });
    expect(CONFIG.cards.T009.rarity).toBe('R');
    for (const h of Object.values(CONFIG.heroes)) expect(h.starterDeck.map((c) => c.card)).not.toContain('T009');
  });
  it('不能主动打出', () => {
    const { g } = setup('pass');
    const w = card('T009');
    g.hand.push(w);
    expect(g.checkPlay(w)).toBe('无懈可击只能在响应窗口打出');
  });
});

describe('妖咒 → 无懈决策点', () => {
  it('手里有无懈：经 BattleIO.respond 询问（kind=wuxie，timed）；打出则妖咒无效', async () => {
    const { g, calls } = setup('use');
    const w = card('T009');
    const keep = card('B001');
    g.hand = [w, keep];
    await g.endTurn([]);
    const q = calls.find((c) => c.kind === 'wuxie')!;
    expect(q).toMatchObject({ pass: '不出无懈', timed: true });
    expect(q.text).toContain('妖咒');
    expect(g.discard).toContain(w);
    expect(g.discard).not.toContain(keep);
    expect(g.logs.some((l) => l.includes('妖咒被无懈可击抵消'))).toBe(true);
  });
  it('放弃：妖咒照常弃 1 张', async () => {
    const { g, calls } = setup('pass');
    const w = card('T009');
    g.hand = [w, card('B001')];
    await g.endTurn([]);
    expect(calls.filter((c) => c.kind === 'wuxie')).toHaveLength(1);
    expect(g.logs.some((l) => l.includes('妖咒：你弃置了'))).toBe(true);
  });
  it('手里没有无懈：不开窗口', async () => {
    const { g, calls } = setup('use');
    g.hand = [card('B001')];
    await g.endTurn([]);
    expect(calls.some((c) => c.kind === 'wuxie')).toBe(false);
  });
  it('闪/濒死决策点也带上 kind', async () => {
    const { g, calls } = setup('pass');
    g.en[0].pat = [['杀']];
    g.hand = [card('B004')];
    g.effects.used.enemy_turn.set('sub:huzhu', 1);
    await g.enemySha(g.en[0], 1);
    expect(calls.at(-1)!.kind).toBe('shan');
  });
});

describe('自动试玩 AI', () => {
  it('heroWuxie：有其他手牌时打出，只剩无懈时不出', () => {
    const { g } = setup('pass');
    const w = card('T009');
    const legal = (c: { id: string }) => c.id === 'T009';
    g.hand = [w, card('B001')];
    expect(heroWuxie(g, legal)).toBe(w);
    g.hand = [w];
    expect(heroWuxie(g, legal)).toBeNull();
  });
  it.each(['hero', 'greedy'] as const)('%s AI：起始牌组带无懈、打有咒师的战斗，决策点被处理且不卡死', async (ai) => {
    const deck = CONFIG.heroes.H03.starterDeck;
    const orig = deck.slice();
    deck.push({ card: 'T009', suit: 'S', rank: 11 }, { card: 'T009', suit: 'C', rank: 12 });
    try {
      let used = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const r = await runBattle({ battleIdx: 1, seed, main: 'H03', sub: 'H04', ai });
        expect(r.timeout).toBe(false);
        used += r.wuxie ?? 0;
      }
      expect(used).toBeGreaterThan(0);
    } finally {
      deck.splice(0, deck.length, ...orig);
    }
  });
});
