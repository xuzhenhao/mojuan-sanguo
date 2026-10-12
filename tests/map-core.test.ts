import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../scripts/config-lib';
import { availableNodes, BOSS_ID, generateMap, getNode, mapSeedOf, moveTo, violations, walkedEdges, type MapState } from '../src/core/run/map';
import { drawEncounter, newEncounterState, type EncounterState } from '../src/core/run/encounters';
import { autosaveAfterBattle, enterBattle, resumeRun, VERSION_DIALOG_TEXT, type RunSave } from '../src/core/run/save';
import { MAP_CONFIG, poolsOf } from '../src/data/map';
import { seeded } from '../src/core/rng';

const cfg = MAP_CONFIG;

function randomWalk(m: MapState, r: () => number) {
  const seen: string[] = [];
  let s = m;
  for (;;) {
    const a = availableNodes(s);
    if (!a.length) break;
    s = moveTo(s, a[Math.floor(r() * a.length)]);
    seen.push(s.current!);
  }
  return { s, seen };
}

describe('地图生成（PRD 10.1–10.4）', () => {
  it('配置：8 层 × 4 列、4 条路线、固定层与 Boss', () => {
    expect([cfg.layers, cfg.columns, cfg.paths]).toEqual([8, 4, 4]);
    expect(cfg.fixedLayers).toEqual({ 1: 'BATTLE', 8: 'REST' });
    expect(cfg.boss[1]).toBe('B1');
  });
  it('同种子同图；mapSeed = hash(runSeed, "map", chapter)', () => {
    expect(generateMap(42, 1, cfg)).toEqual(generateMap(42, 1, cfg));
    expect(generateMap(42, 1, cfg).seed).toBe(mapSeedOf(42, 1));
    expect(generateMap(43, 1, cfg)).not.toEqual(generateMap(42, 1, cfg));
  });
  it('结构约束（500 张图）：固定层、只连下一层、不交叉、第 8 层全连 Boss、入口 ≥2、10.4 约束（③可放宽）', () => {
    for (let seed = 0; seed < 500; seed++) {
      const m = generateMap(seed, 1, cfg);
      const by = new Map(m.nodes.map((n) => [n.id, n]));
      const boss = m.nodes.filter((n) => n.type === 'BOSS');
      expect(boss.map((b) => [b.id, b.layer])).toEqual([[BOSS_ID, 9]]);
      for (const n of m.nodes) {
        if (n.layer === 1) expect(n.type).toBe('BATTLE');
        if (n.layer === 8) expect(n.type).toBe('REST');
        if (n.layer < 4) expect(['ELITE', 'REST']).not.toContain(n.type);
        const per = m.nodes.filter((x) => x.layer === n.layer).length;
        if (n.layer <= 8) expect(per).toBeGreaterThanOrEqual(n.layer === 1 ? 2 : 1);
      }
      expect(new Set(m.edges.map((e) => e.join('>'))).size).toBe(m.edges.length);
      for (const [a, b] of m.edges) {
        const A = by.get(a)!;
        const B = by.get(b)!;
        expect(B.layer).toBe(A.layer + 1);
        if (B.type !== 'BOSS') expect(Math.abs(B.col - A.col)).toBeLessThanOrEqual(1);
      }
      for (const [a, b] of m.edges) {
        const A = by.get(a)!;
        const B = by.get(b)!;
        if (B.type === 'BOSS' || A.col === B.col) continue;
        const cross = m.edges.some(
          ([c, d]) => by.get(c)!.layer === A.layer && by.get(c)!.col === B.col && by.get(d)!.col === A.col && by.get(d)!.type !== 'BOSS',
        );
        expect(cross).toBe(false);
      }
      for (const n of m.nodes.filter((x) => x.layer === 8)) expect(m.edges).toContainEqual([n.id, BOSS_ID]);
      expect(violations(m.nodes, m.edges, cfg, { relaxSiblings: true })).toEqual([]);
      if (!m.relaxed) expect(violations(m.nodes, m.edges, cfg)).toEqual([]);
    }
  });
  it('每局均值（随机走）接近 PRD 参照：普通战 3.8、精英 0.72、奇遇 0.9、商店 0.5、宝箱 0.35', () => {
    const N = 1500;
    const sum: Record<string, number> = {};
    const r = seeded(99);
    for (let i = 0; i < N; i++) {
      const { s, seen } = randomWalk(generateMap(i, 1, cfg), r);
      expect(walkedEdges(s).length).toBe(8);
      for (const id of seen) {
        const n = getNode(s, id)!;
        if (n.layer >= 8) continue;
        sum[n.type] = (sum[n.type] ?? 0) + 1;
      }
    }
    const avg = (t: string) => (sum[t] ?? 0) / N;
    expect(avg('BATTLE')).toBeGreaterThan(3.3);
    expect(avg('BATTLE')).toBeLessThan(4.1);
    expect(Math.abs(avg('ELITE') - 0.72)).toBeLessThan(0.15);
    expect(Math.abs(avg('EVENT') - 0.9)).toBeLessThan(0.4);
    expect(Math.abs(avg('SHOP') - 0.5)).toBeLessThan(0.35);
    expect(Math.abs(avg('CHEST') - 0.35)).toBeLessThan(0.2);
    expect(avg('REST')).toBeLessThan(1.0);
  });
  it('只能沿连线向下走，不能回头或跳层', () => {
    const m = generateMap(5, 1, cfg);
    const first = availableNodes(m);
    expect(first.every((id) => getNode(m, id)!.layer === 1)).toBe(true);
    const m1 = moveTo(m, first[0]);
    expect(() => moveTo(m1, first[0])).toThrow(/不可达/);
    const l3 = m.nodes.find((n) => n.layer === 3)!;
    expect(() => moveTo(m1, l3.id)).toThrow();
    expect(availableNodes(m1).every((id) => getNode(m1, id)!.layer === 2)).toBe(true);
  });
});

describe('战斗组包（PRD 10.5）', () => {
  const pools = poolsOf(1);
  it('池内容按总策划确认', () => {
    expect(pools.pools.easy.map((g) => g.enemies)).toEqual([
      ['E101', 'E101', 'E102'],
      ['E101', 'E104'],
    ]);
    expect(pools.pools.normal.map((g) => g.enemies)).toEqual([
      ['E104', 'E101', 'E103'],
      ['E104', 'E101', 'E102'],
      ['E101', 'E101', 'E103'],
    ]);
    expect(pools.pools.elite.map((g) => g.enemies)).toEqual([['E1E1', 'E102']]);
    expect(pools.pools.boss.map((g) => g.enemies)).toEqual([['B1']]);
    for (const p of Object.values(pools.pools)) for (const g of p) expect(g.name).toBeTruthy();
    expect(pools.rules).toEqual({ easyBattles: 2, noRepeatInPool: true });
    expect(MAP_CONFIG.betweenBattleHeal).toBe(0);
  });
  it('前 2 场普通战用 easy，第 3 场起 normal；同池不连续同组；确定性', () => {
    for (let seed = 0; seed < 200; seed++) {
      let st: EncounterState = newEncounterState();
      const got: string[] = [];
      for (let i = 0; i < 6; i++) {
        const d = drawEncounter(seed, 1, 'BATTLE', st, pools);
        st = d.state;
        got.push(d.encounterId);
      }
      expect(got.slice(0, 2).every((x) => x.startsWith('easy:'))).toBe(true);
      expect(got.slice(2).every((x) => x.startsWith('normal:'))).toBe(true);
      for (let i = 1; i < got.length; i++) if (got[i].split(':')[0] === got[i - 1].split(':')[0]) expect(got[i]).not.toBe(got[i - 1]);
    }
    const a = drawEncounter(1, 1, 'ELITE', newEncounterState(), pools);
    expect(a.encounterId).toBe('elite:0');
    expect(drawEncounter(1, 1, 'BOSS', a.state, pools).group.enemies).toEqual(['B1']);
    expect(drawEncounter(9, 1, 'BATTLE', newEncounterState(), pools)).toEqual(drawEncounter(9, 1, 'BATTLE', newEncounterState(), pools));
  });
});

describe('存档与续玩（PRD 21.4）', () => {
  const base = (): RunSave => ({
    schema: 1,
    version: '0.2.0',
    configVersion: 'c1',
    runSeed: 1,
    chapter: 1,
    heroMain: 'H03',
    heroSub: 'H04',
    nodePath: [],
    hp: 7,
    maxHp: 7,
    gold: 50,
    deck: ['a'],
    relics: [],
    potions: [],
    mapState: generateMap(1, 1, cfg),
    encounters: newEncounterState(),
    battleState: null,
    battleStartSnapshot: null,
    timestamp: 0,
  });
  it('版本一致：原样恢复', () => {
    expect(resumeRun(base(), 'c1').kind).toBe('ok');
  });
  it('不在战斗中且版本不一致：静默升级', () => {
    const r = resumeRun(base(), 'c2');
    expect(r.kind).toBe('silent_upgrade');
    expect(r.save.configVersion).toBe('c2');
  });
  it('战斗中版本不一致：退回本场战斗开始前（体力/牌组/铜钱/地图路线），弹 version 对话框', () => {
    let s = enterBattle(base(), 1);
    s = { ...s, hp: 2, gold: 0, deck: [], battleState: { turn: 5 } };
    const r = resumeRun(s, 'c2');
    expect(r.kind).toBe('rollback_battle');
    expect([r.save.hp, r.save.gold, r.save.deck]).toEqual([7, 50, ['a']]);
    expect(r.save.battleState).toBeNull();
    expect(VERSION_DIALOG_TEXT).toContain('本场战斗将从头开始');
  });
  it('每场结算后自动存档：清掉战斗快照', () => {
    const s = autosaveAfterBattle(enterBattle(base(), 1), { hp: 5, gold: 80 }, 2);
    expect([s.hp, s.gold, s.battleStartSnapshot, s.timestamp]).toEqual([5, 80, null, 2]);
  });
});

describe('配置校验：map / pools / icon 枚举', () => {
  const ROOT = resolve(__dirname, '../config');
  const withEdit = (file: string, edit: (s: string) => string) => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    try {
      cpSync(ROOT, dir, { recursive: true });
      const p = join(dir, file);
      writeFileSync(p, edit(readFileSync(p, 'utf8')));
      return loadConfig(dir).errors;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  it('当前配置通过', () => {
    expect(loadConfig(ROOT).errors).toEqual([]);
  });
  it('icon 不在 PRD 19.1.2 枚举中则失败', () => {
    const errs = withEdit('rules.yaml', (s) => s.replace('BATTLE: battle,', 'BATTLE: sword,'));
    expect(errs.join('\n')).toMatch(/nodeIcons|icon/);
  });
  it('组包引用不存在的敌人则失败', () => {
    const errs = withEdit('encounters/ch1.yaml', (s) => s.replace('enemies: [B1]', 'enemies: [B9]'));
    expect(errs.join('\n')).toMatch(/pools\.boss.*B9/);
  });
  it('map.weights 缺类型则失败', () => {
    const errs = withEdit('rules.yaml', (s) => s.replace('CHEST: 10 }', '}'));
    expect(errs.length).toBeGreaterThan(0);
  });
});
