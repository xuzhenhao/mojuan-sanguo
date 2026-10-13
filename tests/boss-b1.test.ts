/** 第 1 章 Boss B1 张角·墨魇：阶段切换、召唤、闪电（PRD 11.2 / design-v1 10.7） */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { ENEMIES } from '../src/data/enemies';
import { enemyIntent } from '../src/core/rules';
import { standardJudgeDeck } from '../src/core/effects';
import type { EnemyPhaseEvent, EnemySummonEvent, PlayerDelayedEvent } from '../src/core/battle';
import { withContract, type ContractReport } from '../src/sim/io-contract';
import { encounterBatch, runChapter } from '../src/sim/autoplay';
import { mkGame, mkIO } from './helpers';
import { Game } from '../src/core/battle';
import { seeded } from '../src/core/rng';

function boss(over = {}, seed = 1) {
  const r = mkGame(over, seed, { main: 'H03', sub: 'H04' });
  r.g.encounter = { name: '张角·墨魇', en: ['B1'] };
  r.g.startBattle();
  return { ...r, b: r.g.en[0] };
}
const judgeAs = (g: Game, suit: 'S' | 'H', rank: number) => {
  const j = standardJudgeDeck().find((x) => x.suit === suit && x.rank === rank)!;
  g.judgeDeck.push(j); // 下一次签筒判定
};

describe('B1 配置', () => {
  it('启用；HP 20 前排；闪标记每回合 0；阶段 2 阈值 50% + 召唤 E102 后排', () => {
    expect(CONFIG.enemies.B1.enabled).not.toBe(false);
    const d = ENEMIES.B1;
    expect([d.hp, d.row, d.flash]).toEqual([20, 'front', 0]);
    expect(d.pat).toEqual([['杀+', '杀'], ['锦囊:D003'], ['闪', '杀+'], ['杀+', '杀', '杀']]);
    expect(d.phases).toEqual([
      {
        hpAtMost: 0.5,
        pat: [
          ['杀+', '杀', '杀'],
          ['锦囊:D003', '杀+'],
          ['杀+', '杀+', '杀'],
        ],
        summon: [{ enemy: 'E102', row: 'back' }],
      },
    ]);
    expect(d.trickOverrides).toEqual({ D003: { amount: 2 } });
    expect(JSON.stringify(CONFIG.enemies.B1)).not.toMatch(/连环/); // O36 删除全场连环
  });
  it('意图栏能显示锦囊意图（不计入伤害）', () => {
    const { b } = boss();
    b.step = 1;
    const it = enemyIntent(b);
    expect(it.dmg).toBe(0);
    expect(it.txt).toContain('闪电');
    expect(it.tip).toContain('2点雷电伤害');
  });
});

describe('B1 阶段切换与召唤', () => {
  it('体力 11 不切；体力 ≤ 10 在张角回合开始切换：换意图表、步数归零、召唤 1 名后排弓手；只触发一次', async () => {
    const phases: EnemyPhaseEvent[] = [];
    const sums: EnemySummonEvent[] = [];
    const { g, b } = boss({ enemyPhase: (e: EnemyPhaseEvent) => phases.push(e), enemySummon: (e: EnemySummonEvent) => sums.push(e) });
    b.hp = 11;
    b.step = 2;
    expect(g.checkPhase(b)).toBe(false);
    b.hp = 10;
    expect(g.checkPhase(b)).toBe(true);
    expect(b.phase).toBe(1);
    expect(b.step).toBe(0);
    expect(enemyIntent(b).acts).toEqual(['杀+', '杀', '杀']);
    expect(g.en.map((e) => [e.id, e.row])).toEqual([
      ['B1', 'front'],
      ['E102', 'back'],
    ]);
    expect(g.en[1].summonedBy).toBe(b.uid);
    expect(phases).toHaveLength(1);
    expect(phases[0].phase).toBe(2);
    expect(sums[0].summoned).toBe(g.en[1]);
    b.hp = 3;
    expect(g.checkPhase(b)).toBe(false); // 不会重复召唤
    expect(g.en).toHaveLength(2);
  });
  it('被一击打到 ≤10 后：切换发生在张角自己的回合，召唤的弓手本回合不行动', async () => {
    const { g, b } = boss();
    b.hp = 5;
    g.hand = [];
    g.p.hp = 99;
    g.p.maxHp = 99;
    const before = g.p.hp;
    await g.endTurn();
    expect(b.phase).toBe(1);
    expect(g.en[1].step).toBe(0); // 弓手没出牌
    expect(before - g.p.hp).toBeLessThanOrEqual(4); // 阶段 2 第 1 步 [杀+,杀,杀] = 4
    expect(b.step).toBe(1);
  });
  it('场上存活敌人达到上限时召唤落空', () => {
    const sums: EnemySummonEvent[] = [];
    const { g, b } = boss({ enemySummon: (e: EnemySummonEvent) => sums.push(e) });
    g.en.push(g.spawnEnemy('E101'), g.spawnEnemy('E101'));
    b.hp = 9;
    g.checkPhase(b);
    expect(b.phase).toBe(1);
    expect(g.alive()).toHaveLength(3);
    expect(sums[0].summoned).toBeNull();
  });
  it('前排全灭时召唤的后排敌人前移', () => {
    const r = mkGame({}, 1, { main: 'H03', sub: 'H04' });
    r.g.encounter = { name: 't', en: ['B1'] };
    r.g.startBattle();
    const b = r.g.en[0];
    b.row = 'back';
    r.g.summon(b, 'E102', 'back');
    expect(r.g.en.every((e) => e.row === 'front')).toBe(true);
  });
});

describe('B1 闪电（玩家判定区）', () => {
  it('意图放置闪电：2 点雷伤、最多 4 次；同时最多 1 张', async () => {
    const evs: PlayerDelayedEvent[] = [];
    const { g, b } = boss({ playerDelayed: (e: PlayerDelayedEvent) => evs.push(e) });
    await g.enemyTrick(b, 'D003');
    await g.enemyTrick(b, 'D003');
    expect(g.pJudge).toEqual([{ id: 'D003', name: '闪电', from: b.uid, amount: 2, left: 4 }]);
    expect(evs.map((e) => e.action)).toEqual(['place']);
  });
  it('♠2–9 命中：受 2 点雷伤并移除', async () => {
    const { g, b } = boss();
    await g.enemyTrick(b, 'D003');
    g.p.armor = 0;
    const hp = g.p.hp;
    judgeAs(g, 'S', 5);
    await g.resolvePlayerJudge(b);
    expect(hp - g.p.hp).toBe(2);
    expect(g.pJudge).toEqual([]);
    expect(g.logs.some((l) => l.includes('2点雷伤害'))).toBe(true);
  });
  it('未命中保留，第 4 次未命中后移除；♠10 / ♥5 都不命中', async () => {
    const evs: PlayerDelayedEvent[] = [];
    const { g, b } = boss({ playerDelayed: (e: PlayerDelayedEvent) => evs.push(e) });
    await g.enemyTrick(b, 'D003');
    const hp = g.p.hp;
    for (const [s, r] of [
      ['S', 10],
      ['H', 5],
      ['S', 1],
      ['S', 13],
    ] as const) {
      judgeAs(g, s, r);
      await g.resolvePlayerJudge(b);
    }
    expect(g.p.hp).toBe(hp);
    expect(g.pJudge).toEqual([]);
    expect(evs.map((e) => e.action)).toEqual(['place', 'expire']);
  });
  it('张角阵亡时闪电移除', async () => {
    const { g, b } = boss();
    await g.enemyTrick(b, 'D003');
    g.summon(b, 'E102');
    await g.dmgEnemy(b, 99, '普通');
    expect(g.pJudge).toEqual([]);
    expect(g.over).toBe(false); // 弓手还在
  });
  it('张角每回合开始只判定自己放的闪电', async () => {
    const { g, b } = boss();
    await g.enemyTrick(b, 'D003');
    const a = g.summon(b, 'E102')!;
    judgeAs(g, 'H', 1);
    await g.resolvePlayerJudge(a);
    expect(g.pJudge[0].left).toBe(4);
  });
});

describe('B1 自动对局', () => {
  it('八将单场契约 0 违约，不超时，阶段 2 / 召唤 / 闪电都实际发生', async () => {
    const rep: ContractReport = { events: {}, violations: [] };
    for (const main of ['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08']) {
      const r = await encounterBatch(['B1'], 6, 11, { main }, rep);
      expect(r.timeouts).toBe(0);
    }
    expect(rep.violations).toEqual([]);
    expect(rep.events.enemyPhase).toBeGreaterThan(0);
    expect(rep.events.enemySummon).toBeGreaterThan(0);
    expect(rep.events.playerDelayed).toBeGreaterThan(0);
  });
  it('三战基线不受影响：BATTLES 仍是 3 战，不含 B1', async () => {
    const r = await runChapter(5, { main: 'H03' });
    expect(r.res.length).toBeLessThanOrEqual(3);
    expect(CONFIG.encounters.ch1.battles.flatMap((b) => b.enemies)).not.toContain('B1');
  });
  it('未设 encounter 时 Game.battle 回落到 BATTLES', () => {
    const g = new Game(seeded(1), mkIO(), { autoShan: true });
    expect(g.battle.en).toEqual(CONFIG.encounters.ch1.battles[0].enemies);
    void withContract;
  });
});
