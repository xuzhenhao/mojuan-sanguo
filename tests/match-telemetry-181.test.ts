/** #181 对局埋点：事件字段白名单、战斗标签取敌人 config tier、每回合出牌 / 循环牌计数、经微信 transport 剥 PII */
import { describe, expect, it } from 'vitest';
import { RunSession, NULL_IO } from '../src/game/run';
import { CONFIG } from '../src/data/config';
import { battleEndFields, battleTagOf, MATCH_EVENTS, pickFields, trackMatch, bindTelemetry, flushTelemetry, resetTelemetry } from '../src/game/telemetry';
import { createWechatTelemetry } from '../src/platform/wechat/telemetry';
import { cardHasTag } from '../src/core/juling';

const mem = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};
const enemyIds = (tier: string) =>
  Object.entries(CONFIG.enemies as Record<string, { tier?: string }>)
    .filter(([, e]) => e.tier === tier)
    .map(([id]) => id);
const node = (id: string, enemies: string[], nodeType: 'BATTLE' | 'ELITE' | 'BOSS' = 'BATTLE') => ({ nodeId: id, nodeType, encounterName: 't', enemies });
const collect = () => {
  const evs: { ev: string; d: Record<string, unknown> }[] = [];
  return { evs, sink: (ev: string, d: Record<string, unknown>) => void evs.push({ ev, d }) };
};

describe('#181 字段白名单', () => {
  it('不在白名单的字段（含 openid）一律丢弃，undefined 不上报', () => {
    expect(pickFields('run_start', { hero_main: 'H03', openid: 'o', tianming: undefined })).toEqual({ hero_main: 'H03' });
  });
  it('总策划字段齐全：天命 / 章节 / Boss 节点 / 胜负 / 死亡节点；回合数 / 每回合出牌 / 循环牌 / 战斗标签', () => {
    expect(MATCH_EVENTS.run_end).toEqual(expect.arrayContaining(['tianming', 'chapter', 'boss_node', 'result', 'death_node', 'duration_ms']));
    expect(MATCH_EVENTS.battle_end).toEqual(expect.arrayContaining(['turns', 'plays_per_turn', 'loop_plays', 'battle_tag']));
    expect(MATCH_EVENTS.card_pick).toEqual(expect.arrayContaining(['card_id', 'skipped']));
  });
});

describe('#181 战斗标签取 config tier', () => {
  it('按敌人 yaml tier 最高档：小怪 → minion，含精英 → elite，含 Boss → boss', () => {
    expect(battleTagOf([{ tier: '小怪' }])).toBe('minion');
    expect(battleTagOf([{ tier: '小怪' }, { tier: '精英' }])).toBe('elite');
    expect(battleTagOf([{ tier: '精英' }, { tier: 'Boss' }])).toBe('boss');
    expect(battleTagOf([{}])).toBe('minion');
  });
  it('config 里每个敌人都有 tier（schema 必填），实战 Game.en 带出 tier', () => {
    for (const e of Object.values(CONFIG.enemies as Record<string, { tier?: string }>)) expect(['小怪', '精英', 'Boss']).toContain(e.tier);
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 3 });
    const c = collect();
    run.sink = c.sink;
    const elite = enemyIds('精英')[0];
    run.buildBattle(NULL_IO, node('L2C0', [elite], 'BATTLE')); // 节点类型故意写 BATTLE：标签只看敌人 tier
    run.settleBattle(true);
    expect(c.evs.find((e) => e.ev === 'battle_end')?.d.battle_tag).toBe('elite');
  });
});

describe('#181 战斗字段', () => {
  it('battleEndFields：回合数 / 每回合出牌 / 循环牌次数 / 伤害', () => {
    const f = battleEndFields(
      { turn: 3, playsByTurn: [2, 0, 4], loopPlays: 3, en: [{ id: 'E1', hp: 0, max: 10, tier: '小怪' }], p: { hp: 7 } },
      { win: true, tag: 'minion', hpBefore: 10 },
    );
    expect(f).toMatchObject({ turns: 3, plays_per_turn: [2, 0, 4], loop_plays: 3, dmg_taken: 3, dmg_dealt: 10, enemies: ['E1'], win: true });
  });
  it('Game.play 计每回合出牌与 loop tag 牌（tag 取 config）', async () => {
    const loopId = Object.keys(CONFIG.cards).find((id) => cardHasTag(id, 'loop'));
    expect(loopId).toBeTruthy();
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 4 });
    const g = run.buildBattle(NULL_IO, node('L1C0', [enemyIds('小怪')[0]]));
    g.p.ling = 99;
    const card = { uid: 9001, id: loopId!, suit: 'S', rank: 1, mods: [] } as unknown as Parameters<typeof g.play>[0];
    g.hand.push(card);
    await g.play(card, g.en[0] ?? null).catch(() => {});
    expect(g.playsByTurn[g.turn - 1]).toBe(1);
    expect(g.loopPlays).toBe(1);
  });
  it('战败：battle_end + damage_taken(source=敌人 id) + death（节点 / 层 / 天命）', () => {
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 7 });
    const c = collect();
    run.sink = c.sink;
    const g = run.buildBattle(NULL_IO, node('L1C0', [enemyIds('小怪')[0]]));
    g.turn = 2;
    g.p.hp = 0;
    run.settleBattle(false);
    const names = c.evs.map((e) => e.ev);
    expect(names).toEqual(['battle_end', 'damage_taken', 'death']);
    const death = c.evs[2].d;
    expect(death).toMatchObject({ node_id: 'L1C0', node_type: 'BATTLE', source: g.en[0].id });
    expect(death).toHaveProperty('tianming');
    expect(c.evs[0].d).toMatchObject({ turns: 2, win: false, battle_tag: 'minion' });
  });
  it('run_start / node_enter 埋点', () => {
    const run = new RunSession();
    const c = collect();
    run.sink = c.sink;
    run.begin({ main: 'H03', sub: 'H04', seed: 1 }, mem());
    run.enterNode({ id: 'L1C0', type: 'BATTLE' });
    expect(c.evs[0]).toMatchObject({ ev: 'run_start', d: { hero_main: 'H03', hero_sub: 'H04', chapter: 1 } });
    expect(c.evs[0].d).toHaveProperty('tianming');
    expect(c.evs[1]).toMatchObject({ ev: 'node_enter', d: { node_id: 'L1C0', node_type: 'BATTLE' } });
  });
});

describe('#181 接微信 RealtimeLogManager', () => {
  it('trackMatch → flush → 实时日志，事件名可检索、无 PII', () => {
    resetTelemetry();
    const infos: unknown[][] = [];
    const log = { info: (...a: unknown[]) => void infos.push(a), warn() {}, error() {} };
    bindTelemetry(createWechatTelemetry(log), () => 1);
    trackMatch('run_end', { result: 'victory', chapter: 1, tianming: 2, boss_node: 'L9C0', duration_ms: 5, openid: 'x' } as never);
    flushTelemetry();
    expect(infos).toHaveLength(1);
    expect(infos[0][1]).toBe('run_end');
    expect(JSON.stringify(infos[0])).not.toContain('openid');
    expect((infos[0][2] as { data: object }).data).toEqual({ result: 'victory', chapter: 1, tianming: 2, boss_node: 'L9C0', duration_ms: 5 });
    resetTelemetry();
  });
});
