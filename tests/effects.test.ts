import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIG, type Ability } from '../src/data/config';
import { ATOMS, cardMatches, standardJudgeDeck, type Source } from '../src/core/effects';
import { card, mkGame } from './helpers';

const M0 = { ...CONFIG.rules.mechanics };
afterEach(() => Object.assign(CONFIG.rules.mechanics, M0));

function setup() {
  CONFIG.rules.mechanics.judgeSource = 'deck'; // 用 g.draw 预置判定牌（M1 单独测试）
  const r = mkGame({}, 1);
  r.g.startBattle();
  r.g.en.forEach((e) => (e.pat = [['闪']]));
  return r.g;
}
const ab = (over: Partial<Ability>): Ability => ({ id: 't_ab', name: '测试', desc: '', trigger: { when: 'play' }, do: [], ...over });
const src = (a: Ability, key = 'k'): Source => ({ ab: a, key });
const run = (g: ReturnType<typeof setup>, d: Ability['do'][number], ctx = {}) => ATOMS[d.do](g, d, ctx, src(ab({ do: [d] })));

describe('效果原子', () => {
  let g: ReturnType<typeof setup>;
  beforeEach(() => (g = setup()));

  it('damage：asSha 指定目标走杀流程', async () => {
    const c = card('B001');
    const ctx = { card: c, chosen: g.en[0] };
    await run(g, { do: 'damage', target: 'chosen', amount: 2, asSha: true }, ctx);
    expect(g.en[0].hp).toBe(g.en[0].max - 2);
    expect((ctx as { hit?: boolean }).hit).toBe(true);
  });
  it('damage：全体（视为杀，闪标记可闪）与对玩家', async () => {
    g.en[1].marks = 1;
    await run(g, { do: 'damage', target: 'all_enemies', amount: 1, asSha: true }, { card: card('T005') });
    expect(g.en.map((e) => e.max - e.hp)).toEqual([1, 0, 1]);
    expect(g.en[1].marks).toBe(0);
    g.p.armor = 0;
    await run(g, { do: 'damage', target: 'self', amount: 2 }, { card: card('T005') });
    expect(g.p.hp).toBe(6);
  });
  it('lose_hp / heal', async () => {
    await run(g, { do: 'lose_hp', target: 'self', amount: 3 });
    expect(g.p.hp).toBe(5);
    await run(g, { do: 'heal', target: 'self', amount: 1 }, { card: card('B005', 'H', 3, ['E_P01']) });
    expect(g.p.hp).toBe(7);
  });
  it('armor / remove_armor', async () => {
    g.p.armor = 0;
    await run(g, { do: 'armor', target: 'self', amount: 3 });
    expect(g.p.armor).toBe(3);
    g.en[0].armor = 3;
    await run(g, { do: 'remove_armor', target: 'chosen', amount: 2 }, { chosen: g.en[0] });
    expect(g.en[0].armor).toBe(1);
  });
  it('draw / discard / gain_ling', async () => {
    const n = g.hand.length;
    await run(g, { do: 'draw', target: 'self', amount: 2 });
    expect(g.hand.length).toBe(n + 2);
    const c = g.hand[0];
    await run(g, { do: 'discard', target: 'self', amount: 1 }, { card: c });
    expect(g.hand).not.toContain(c);
    expect(g.discard).toContain(c);
    await run(g, { do: 'gain_ling', amount: 1 });
    expect(g.p.ling).toBe(4);
  });
  it('judge：成功走 then、失败走 else；negate_sha 记录抵消者', async () => {
    const d = { do: 'judge', success: { color: 'red' }, then: [{ do: 'negate_sha', target: 'current_sha' }], else: [{ do: 'gain_ling', amount: 1 }] };
    g.draw.push(card('B001', 'D', 5));
    const ctx: { negatedBy?: string } = {};
    await run(g, d, ctx);
    expect(ctx.negatedBy).toBe('t_ab');
    g.draw.push(card('B001', 'S', 5));
    const ctx2: { negatedBy?: string } = {};
    await run(g, d, ctx2);
    expect(ctx2.negatedBy).toBeUndefined();
    expect(g.p.ling).toBe(4);
  });
  it('judge 条件：suit / rankRange / not', async () => {
    const hit = async (success: object, c: ReturnType<typeof card>) => {
      g.draw.push(c);
      const ctx: { negatedBy?: string } = {};
      await run(g, { do: 'judge', success, then: [{ do: 'negate_sha' }] }, ctx);
      return !!ctx.negatedBy;
    };
    expect(await hit({ suit: ['H'] }, card('B001', 'H', 1))).toBe(true);
    expect(await hit({ suit: ['H'] }, card('B001', 'D', 1))).toBe(false);
    expect(await hit({ suit: ['S'], rankRange: [2, 9] }, card('B001', 'S', 9))).toBe(true);
    expect(await hit({ suit: ['S'], rankRange: [2, 9] }, card('B001', 'S', 10))).toBe(false);
    expect(await hit({ suit: ['H'], not: true }, card('B001', 'C', 1))).toBe(true);
  });
  it('apply_status：jiu（仙酿 +2）/ aogu / yiyong / lebu；未知状态报错', async () => {
    await run(g, { do: 'apply_status', status: 'jiu' }, { card: card('B006', 'S', 9, ['E_P03']) });
    expect(g.p.jiu).toBe(2);
    await run(g, { do: 'apply_status', status: 'aogu' });
    expect(g.p.aogu).toBe(1);
    await run(g, { do: 'apply_status', status: 'yiyong' });
    expect(g.p.yiyong).toBe(1);
    const lb = card('D001');
    g.discard.push(lb);
    await run(g, { do: 'apply_status', status: 'lebu', target: 'chosen' }, { card: lb, chosen: g.en[0] });
    expect(g.en[0].judge).toContain(lb);
    expect(g.discard).not.toContain(lb);
    expect(() => run(g, { do: 'apply_status', status: 'nope' })).toThrow(/未实现的状态/);
  });
  it('reveal_intent / remove_flash_mark / add_enemy_acts', async () => {
    g.en[0].pat = [['杀'], ['闪'], ['咒']];
    await run(g, { do: 'reveal_intent', target: 'chosen', amount: 2 }, { chosen: g.en[0] });
    expect(g.logs.at(-1)).toContain('闪 → 咒');
    g.en[0].marks = 2;
    await run(g, { do: 'remove_flash_mark', target: 'chosen', amount: 1 }, { chosen: g.en[0] });
    expect(g.en[0].marks).toBe(1);
    await run(g, { do: 'add_enemy_acts', acts: ['杀'] }, { owner: g.en[0] });
    expect(g.extraActs.get(g.en[0])).toEqual(['杀']);
  });
  it('modify（static 汇总）与 convert 无即时效果', async () => {
    expect(g.effects.stat('sha_cost')).toBe(0);
    g.p.equip.weapon = card('W001', 'D', 1);
    g.p.equip.minus = card('M001', 'H', 5);
    expect(g.effects.stat('sha_cost')).toBe(-1);
    expect(g.attackRange()).toBe(2);
    expect(g.costOf(card('B001'))).toBe(0);
    g.effects.stat('sha_cost', true);
    g.effects.stat('sha_cost', true);
    expect(g.costOf(card('B001'))).toBe(1); // 诸葛弩每回合限 2 次
    await run(g, { do: 'modify', stat: 'x', amount: 1 });
    await run(g, { do: 'convert', as: 'B001' });
  });
});

describe('事件总线：limit / if / 配额 / 筛选', () => {
  it('limit 每回合计数，回合开始清零', async () => {
    const g = setup();
    const a = ab({ limit: { per: 'turn', times: 1 }, do: [{ do: 'gain_ling', amount: 1 }] });
    await g.effects.emit('play', [src(a)]);
    await g.effects.emit('play', [src(a)]);
    expect(g.p.ling).toBe(4);
    g.effects.reset('turn');
    await g.effects.emit('play', [src(a)]);
    expect(g.p.ling).toBe(5);
  });
  it('if 条件（含 not）', async () => {
    const g = setup();
    const a = ab({ if: [{ type: 'hp_full' }], do: [{ do: 'gain_ling', amount: 1 }] });
    const b = ab({ id: 'b', if: [{ type: 'hp_full', not: true }], do: [{ do: 'gain_ling', amount: 10 }] });
    await g.effects.emit('play', [src(a), src(b, 'k2')]);
    expect(g.p.ling).toBe(4);
  });
  it('被动免伤配额（M2）：开启后每敌方回合合计上限', async () => {
    const g = setup();
    CONFIG.rules.mechanics.passiveQuotaPerEnemyTurn = 1;
    const a = ab({ limit: { passiveQuota: true }, do: [{ do: 'gain_ling', amount: 1 }] });
    await g.effects.emit('play', [src(a), src(a, 'k2')]);
    expect(g.p.ling).toBe(4);
    g.effects.reset('enemy_turn');
    await g.effects.emit('play', [src(a)]);
    expect(g.p.ling).toBe(5);
  });
  it('V1 配额：每敌方回合 2 次', async () => {
    const g = setup();
    const a = ab({ limit: { passiveQuota: true }, do: [{ do: 'gain_ling', amount: 1 }] });
    await g.effects.emit('play', [src(a), src(a, 'k2'), src(a, 'k3')]);
    expect(g.p.ling).toBe(5);
  });
  it('cardMatches 筛选', () => {
    expect(cardMatches(card('B001'), { tag: 'sha' })).toBe(true);
    expect(cardMatches(card('B004'), { tag: 'shan' })).toBe(true);
    expect(cardMatches(card('T001', 'H'), { color: 'red' })).toBe(true);
    expect(cardMatches(card('T001', 'S'), { color: 'red' })).toBe(false);
    expect(cardMatches(card('T005'), { tag: 'aoe' })).toBe(true);
    expect(cardMatches(undefined, { tag: 'sha' })).toBe(false);
  });
  it('未实现的原子报错；emitSync 拒绝异步原子', async () => {
    const g = setup();
    await expect(g.effects.emit('play', [src(ab({ do: [{ do: 'summon' }] }))])).rejects.toThrow(/未实现的效果原子 summon/);
    expect(() => g.effects.emitSync('play', [src(ab({ do: [{ do: 'judge', success: {} }] }))])).toThrow(/只支持同步原子/);
  });
});

describe('配置驱动的现有效果', () => {
  it('龙虎会开场护甲来自配置；傲骨为主动技（限 1、需红牌）', () => {
    const g = setup();
    expect(g.p.armor).toBe(3);
    const red = card('T001', 'H', 7);
    g.hand.push(red);
    expect(g.canAogu()).toBe(true);
    g.aogu(card('B001', 'S'));
    expect(g.p.aogu).toBe(0);
    g.aogu(red);
    expect(g.p.aogu).toBe(1);
    expect(g.aoguUsed).toBe(true);
  });
  it('八卦阵：红色视为闪', async () => {
    const g = setup();
    g.effects.used.enemy_turn.set('sub:huzhu', 1);
    g.p.equip.armor = card('A001', 'S', 2);
    g.draw.push(card('B001', 'D', 3));
    expect(await g.enemySha(g.en[0], 1)).toBe('bagua');
  });
  it('黄天庇佑来自敌人配置', async () => {
    const r = mkGame({}, 1);
    r.g.battleIdx = 2;
    r.g.startBattle();
    r.g.en.forEach((e) => (e.pat = [['闪']]));
    await r.g.endTurn();
    expect(r.g.en[0].armor).toBe(1);
  });
});

describe('机制开关（V1 定稿）', () => {
  it('默认值', () => expect(M0).toEqual({ judgeSource: 'pool', passiveQuotaPerEnemyTurn: 2, moying: false, zeroCostPerTurn: 1 }));
  it('M1 天机签筒：52 张、红 50%，判定不消耗牌组', async () => {
    const d = standardJudgeDeck();
    expect(d.length).toBe(52);
    expect(d.filter((c) => c.suit === 'H' || c.suit === 'D').length).toBe(26);
    const g = setup();
    CONFIG.rules.mechanics.judgeSource = 'pool';
    const n = g.draw.length;
    await g.judge('测试');
    expect(g.draw.length).toBe(n);
    expect(g.judgeDeck.length).toBe(51);
  });
  it('M3 墨影：精英在玩家满血时多出 1 张杀', async () => {
    CONFIG.rules.mechanics.moying = true;
    const r = mkGame({}, 1);
    r.g.battleIdx = 2;
    r.g.startBattle();
    r.g.en.forEach((e) => (e.pat = [['闪']]));
    await r.g.endTurn();
    expect(r.g.logs.some((l) => l.includes('墨影'))).toBe(true);
    expect(r.g.logs.filter((l) => l.includes('对你出【杀】')).length).toBe(1);
  });
  it('M4 0 费牌每回合限次', async () => {
    CONFIG.rules.mechanics.zeroCostPerTurn = 1;
    const g = setup();
    const a = card('T013');
    const b = card('T013');
    g.hand.push(a, b);
    expect(g.checkPlay(a)).toBeNull();
    await g.play(a, g.en[0]);
    expect(g.checkPlay(b)).toMatch(/0 费牌每回合限 1 次/);
  });
});
