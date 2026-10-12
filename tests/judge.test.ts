/** #52 离间 / #53 护主 / #54 离魂：判定牌数据结构与表现层契约回归（M1 天机签筒 = 线上默认） */
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { judgeFromCard, standardJudgeDeck } from '../src/core/effects';
import { RANK_CH, SUIT_CH } from '../src/core/rules';
import type { JudgeCard, JudgeEvent, Suit } from '../src/core/types';
import { checkJudgeEvent, checkSnapshot, withContract, type ContractReport } from '../src/sim/io-contract';
import { runChapter } from '../src/sim/autoplay';
import { ROSTER } from '../src/data/heroes';
import { card, mkGame } from './helpers';

const M0 = { ...CONFIG.rules.mechanics };
afterEach(() => Object.assign(CONFIG.rules.mechanics, M0));

/** 模拟表现层：只读事件字段渲染判定，拿到的数据不合格就像真实 UI 一样抛错 */
function presenter() {
  const shown: JudgeEvent[] = [];
  const texts: string[] = [];
  return {
    shown,
    texts,
    showJudge: async (ev: JudgeEvent) => {
      const bad = checkJudgeEvent(ev);
      if (bad.length) throw new TypeError(bad.join('; '));
      shown.push(ev);
      texts.push(`判定·${ev.reason} ${SUIT_CH[ev.card.suit]}${RANK_CH[ev.card.rank]} ${ev.card.name}`);
    },
  };
}
const sign = (suit: Suit, rank: number): JudgeCard => standardJudgeDeck().find((j) => j.suit === suit && j.rank === rank)!;

function setup(main: string, sub: string) {
  const p = presenter();
  const r = mkGame({ showJudge: p.showJudge }, 1, { main, sub });
  r.g.startBattle();
  r.g.en.forEach((e) => (e.pat = [['闪']]));
  expect(CONFIG.rules.mechanics.judgeSource).toBe('pool');
  return { g: r.g, p };
}

describe('判定牌数据结构', () => {
  it('签筒：52 张独立签，花色/点数/颜色齐全，没有 cardId、uid 唯一', () => {
    const d = standardJudgeDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d.map((j) => j.uid)).size).toBe(52);
    for (const j of d) {
      expect(j).toMatchObject({ kind: 'judge', source: 'pool', name: '天机签' });
      expect(j.cardId).toBeUndefined();
      expect(j.color).toBe(j.suit === 'H' || j.suit === 'D' ? 'red' : 'black');
      expect(checkJudgeEvent({ type: 'judge', reason: 'x', card: j })).toEqual([]);
    }
  });
  it('摸牌堆判定：带 cardId 与卡牌名', () => {
    const j = judgeFromCard(card('B001', 'C', 12), '杀');
    expect(j).toMatchObject({ kind: 'judge', source: 'deck', cardId: 'B001', suit: 'C', rank: 12, color: 'black', name: '杀' });
  });
  it('旧格式（id=JUDGE 的 CardInst）会被契约拒绝', () => {
    const legacy = { uid: -1, id: 'JUDGE', suit: 'S', rank: 1, mods: [] } as unknown as JudgeCard;
    expect(checkJudgeEvent({ type: 'judge', reason: 'x', card: legacy }).length).toBeGreaterThan(0);
    const g = mkGame().g;
    g.startBattle();
    g.discard.push(legacy as never);
    expect(checkSnapshot(g).some((v) => v.includes('JUDGE'))).toBe(true);
  });
  it('g.judge 在签筒模式下推送完整判定事件', async () => {
    const { g, p } = setup('H02', 'H04');
    g.judgeDeck = [sign('D', 11)];
    const r = await g.judge('测试');
    expect(p.shown[0]).toEqual({ type: 'judge', reason: '测试', card: r });
    expect(r).toMatchObject({ suit: 'D', rank: 11, color: 'red', source: 'pool' });
    expect(p.texts[0]).toBe('判定·测试 ♦J 天机签');
  });
});

describe('#52 貂蝉·离间（签筒）', () => {
  it('非 ♥：判定展示成功且敌人的杀改打友军', async () => {
    const { g, p } = setup('H02', 'H04');
    g.judgeDeck = [sign('S', 3)];
    await g.activate('lijian', undefined, g.en[0]);
    expect(p.shown).toHaveLength(1);
    expect(p.shown[0].reason).toBe('离间');
    expect(g.en[0].redirect).toBe(true);
  });
  it('♥：不改向', async () => {
    const { g, p } = setup('H02', 'H04');
    g.judgeDeck = [sign('H', 3)];
    await g.activate('lijian', undefined, g.en[0]);
    expect(p.shown).toHaveLength(1);
    expect(g.en[0].redirect).toBeFalsy();
  });
});

describe('#53 赵云·护主（签筒，敌方回合不再卡死）', () => {
  it('红色：杀无效', async () => {
    const { g, p } = setup('H01', 'H03');
    g.judgeDeck = [sign('D', 9)];
    expect(await g.enemySha(g.en[0], 1)).toBe('huzhu');
    expect(p.shown[0].card.color).toBe('red');
  });
  it('黑色：正常受伤；整个敌方回合能走完', async () => {
    const { g, p } = setup('H01', 'H03');
    g.judgeDeck = [sign('C', 9)];
    const hp = g.p.hp + g.p.armor;
    expect(await g.enemySha(g.en[0], 1)).toBe('hit');
    expect(g.p.hp + g.p.armor).toBe(hp - 1);
    expect(p.shown).toHaveLength(1);
    g.effects.reset('enemy_turn');
    g.en.forEach((e) => (e.pat = [['杀']]));
    const t = g.turn;
    await g.endTurn();
    expect(g.turn > t || g.over).toBe(true);
  });
});

describe('#54 貂蝉·离魂（签筒）', () => {
  it('非 ♥：目标不出杀并受 1 伤', async () => {
    const { g, p } = setup('H02', 'H04');
    const c = card('X201', 'S', 5);
    g.hand.push(c);
    g.p.ling = 9;
    g.judgeDeck = [sign('S', 1)];
    const e = g.en[0];
    const hp = e.hp + e.armor;
    await g.play(c, e);
    expect(p.shown).toHaveLength(1);
    expect(p.shown[0].reason).toBe('离魂');
    expect(e.hp + e.armor).toBe(hp - 1);
  });
});

describe('CI 门禁：全武将整章自动试玩经 headless 表现层契约 0 违约', () => {
  it.each(ROSTER)('%s', async (main) => {
    const rep: ContractReport = { events: {}, violations: [] };
    for (const seed of [1, 2, 3]) await runChapter(seed, { main }, rep);
    expect(rep.violations).toEqual([]);
    expect(rep.events.update ?? 0).toBeGreaterThan(0);
  });
  it('判定路径确实被覆盖（貂蝉/赵云副将）', async () => {
    const rep: ContractReport = { events: {}, violations: [] };
    for (const seed of [1, 2, 3, 4, 5]) {
      await runChapter(seed, { main: 'H02', sub: 'H03' }, rep);
    }
    expect(rep.events.judge ?? 0).toBeGreaterThan(0);
    expect(rep.violations).toEqual([]);
  });
  it('withContract 能捕获旧版判定数据', async () => {
    const rep: ContractReport = { events: {}, violations: [] };
    const { io } = withContract(mkGame().io, () => undefined, rep);
    await io.showJudge({ type: 'judge', reason: 'x', card: { uid: -1, id: 'JUDGE', suit: 'S', rank: 1, mods: [] } as unknown as JudgeCard });
    expect(rep.violations.length).toBeGreaterThan(0);
  });
});
