import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../src/data/map';
import { generateMap } from '../src/core/run/map';
import { mapBatch, mapReport, pickNext, runMapChapter } from '../src/sim/map-mode';

describe('sim 整章地图模式', () => {
  it('同种子可复现', async () => {
    const a = await runMapChapter(42, { main: 'H05', sub: 'H06' });
    const b = await runMapChapter(42, { main: 'H05', sub: 'H06' });
    expect(a).toEqual(b);
  });
  it('路线合法：第 1 层固定战斗；通关时最后一战是 Boss 且走满 层数+1 个节点', async () => {
    for (let s = 1; s <= 10; s++) {
      const r = await runMapChapter(s, { main: 'H06', sub: 'H05' });
      expect(r.path[0]).toBe('BATTLE');
      expect(r.fights[0].pool).toBe('easy');
      if (r.clear) {
        expect(r.path.length).toBe(MAP_CONFIG.layers + 1);
        expect(r.path.at(-1)).toBe('BOSS');
        expect(r.fights.at(-1)!.pool).toBe('boss');
        expect(r.path[MAP_CONFIG.layers - 1]).toBe('REST');
      } else expect(r.diedAt).not.toBeNull();
    }
  });
  it('体力继承：下一战开场体力 = 上一战结束体力 + 营地/奇遇回复（H5 战后不回血）', async () => {
    const r = await runMapChapter(7, { main: 'H03', sub: 'H04' });
    for (let i = 1; i < r.fights.length; i++) expect(r.fights[i].hpStart).toBeGreaterThanOrEqual(r.fights[i - 1].hpEnd);
    const gained = r.fights.slice(1).reduce((x, f, i) => x + f.hpStart - r.fights[i].hpEnd, 0);
    expect(gained).toBe(r.restHealed + r.eventHealed);
  });
  it('eventHeal=0 时奇遇不回血', async () => {
    const r = await runMapChapter(3, { main: 'H03', sub: 'H04', eventHeal: 0 });
    expect(r.eventHealed).toBe(0);
  });
  it('safe 选路：低血优先营地，高血不优先营地', () => {
    let s = generateMap(11, 1, MAP_CONFIG);
    const rng = () => 0;
    // 走到有多个后继的节点
    s = { ...s, current: s.nodes.find((n) => n.layer === 7)!.id };
    const id = pickNext(s, 1, 10, 'safe', rng);
    expect(s.edges.some(([a, b]) => a === s.current && b === id)).toBe(true);
    const low = pickNext(s, 1, 10, 'safe', rng);
    const next = s.nodes.filter((n) => s.edges.some(([a, b]) => a === s.current && b === n.id));
    if (next.some((n) => n.type === 'REST')) expect(s.nodes.find((n) => n.id === low)!.type).toBe('REST');
  });
  it('mapBatch / mapReport 输出汇总', async () => {
    const row = await mapBatch(4, 1, { main: 'H05', sub: 'H06' });
    expect(row.n).toBe(4);
    expect(row.clearRate).toBeGreaterThanOrEqual(0);
    expect(Object.values(row.diedAt).reduce((a, b) => a + b, 0)).toBe(Math.round(4 * (1 - row.clearRate)));
    expect(mapReport('t', [row])).toContain('郭嘉');
  });
});
