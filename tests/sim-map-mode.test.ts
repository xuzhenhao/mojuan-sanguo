import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../src/data/map';
import { generateMap } from '../src/core/run/map';
import { COEF_SPEC, COEF_ZERO, mapBatch, mapReport, nodeDeviation, pickNext, routeRank, runMapChapter, stochRound } from '../src/sim/map-mode';

const GJ = { main: 'H05', sub: 'H06' };

describe('sim 整章地图模式（docs/specs/sim-map-mode.md）', () => {
  it('验收 1：同一 seed 跑两次完全一致', async () => {
    expect(await runMapChapter(777, GJ)).toEqual(await runMapChapter(777, GJ));
    expect(await mapBatch(5, 777, { ...GJ, coef: COEF_SPEC })).toEqual(await mapBatch(5, 777, { ...GJ, coef: COEF_SPEC }));
  });
  it('路线合法：第 1 层战斗（easy）、第 8 层营地、通关时最后是 Boss', async () => {
    for (let s = 1; s <= 10; s++) {
      const r = await runMapChapter(s, { main: 'H06', sub: 'H05' });
      expect(r.path[0]).toBe('BATTLE');
      expect(r.fights[0].pool).toBe('easy');
      if (r.bossHpStart !== null) {
        expect(r.path[MAP_CONFIG.layers - 1]).toBe('REST');
        expect(r.path.length).toBe(MAP_CONFIG.layers + 1);
      }
      if (r.clear) expect(r.fights.at(-1)!.pool).toBe('boss');
      else expect(r.diedLayer).not.toBeNull();
    }
  });
  it('§3 路线优先级：≤40% 营地第一；其他情况战斗≈奇遇优先、营地最后；精英 <70% 不主动选', () => {
    expect(routeRank('REST', 3, 10)).toBeLessThan(routeRank('EVENT', 3, 10));
    expect(routeRank('ELITE', 3, 10)).toBeGreaterThan(routeRank('BATTLE', 3, 10));
    expect(routeRank('BATTLE', 8, 10)).toBe(routeRank('EVENT', 8, 10));
    expect(routeRank('REST', 8, 10)).toBeGreaterThan(routeRank('ELITE', 8, 10));
    expect(routeRank('ELITE', 6, 10)).toBeGreaterThan(routeRank('REST', 6, 10));
    const s = generateMap(11, 1, MAP_CONFIG);
    const id = pickNext(s, 8, 8, () => 0);
    expect(s.nodes.find((n) => n.id === id)!.layer).toBe(1);
  });
  it('复活：每局最多 1 次；不含复活通关率 ≤ 含复活', async () => {
    const row = await mapBatch(20, 1, GJ);
    expect(row.clearNoReviveRate).toBeLessThanOrEqual(row.clearRate);
    for (let s = 1; s <= 10; s++) {
      const r = await runMapChapter(s, GJ);
      expect(r.fights.filter((f) => !f.win).length).toBeLessThanOrEqual(r.clear ? 1 : 2);
    }
  });
  it('§5：k=0 时没有开场护甲加成（复活 / V13 收编除外）；系数版护甲封顶 4 且第 4 层前为 0', async () => {
    for (let s = 1; s <= 10; s++) {
      const z = await runMapChapter(s, { ...GJ, coef: COEF_ZERO });
      expect(z.bonus).toBe(0);
      const c = await runMapChapter(s, { ...GJ, coef: COEF_SPEC });
      for (const f of c.fights) {
        expect(f.armor).toBeLessThanOrEqual(4);
        if (f.layer < 4 && f.hpStart > 2) expect(f.armor).toBe(0);
      }
    }
  });
  it('stochRound 期望值取整', () => {
    expect(stochRound(1, () => 0.99)).toBe(1);
    expect(stochRound(0.6, () => 0.5)).toBe(1);
    expect(stochRound(0.6, () => 0.7)).toBe(0);
  });
  it('报告：节点偏差 >30% 标 ⚠、偏离均值 >10% 加粗', async () => {
    expect(Math.abs(nodeDeviation(1, 0.7))).toBeGreaterThan(0.3);
    const a = await mapBatch(6, 2, GJ);
    const b = { ...a, main: 'H06', sub: 'H05', clearRate: a.clearRate + 0.5 };
    const md = mapReport('t', [a, b]);
    expect(md).toContain('郭嘉');
    expect(md).toContain('**');
    expect(md).toContain('PRD §10.4 期望');
  });
});
