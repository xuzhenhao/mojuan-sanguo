import { describe, expect, it } from 'vitest';
import { mkGame } from './helpers';
import { CONFIG } from '../src/data/config';
import { legalTargets } from '../src/core/battle';

function setup(main: string, sub = 'H04') {
  const r = mkGame({}, 1, { main, sub });
  r.g.startBattle();
  r.g.en.forEach((e) => (e.pat = [['闪']]));
  return r.g;
}

describe('主动技发动条件与目标合法性（配置化）', () => {
  it('离间的条件写在配置里', () => {
    const ab = CONFIG.heroes.H02.mainSkills.find((a) => a.id === 'lijian')!;
    expect(ab.if).toContainEqual({ type: 'alive_enemies_at_least', value: 2 });
    expect(ab.targets).toEqual({ hasAlly: true });
  });
  it('离间：≥2 名敌人存活时可发动，只剩 1 名时 canActivate 为假且无合法目标', () => {
    const g = setup('H02');
    expect(g.alive().length).toBeGreaterThanOrEqual(2);
    expect(g.canActivate('lijian')).toBe(true);
    expect(g.legalTargets('lijian')).toEqual(g.alive());
    g.alive()
      .slice(1)
      .forEach((e) => (e.hp = 0));
    expect(g.alive().length).toBe(1);
    expect(g.legalTargets('lijian')).toEqual([]);
    expect(g.canActivate('lijian')).toBe(false);
  });
  it('非法目标不会生效；导出的 legalTargets 与引擎一致', async () => {
    const g = setup('H02');
    const [a, ...rest] = g.alive();
    expect(legalTargets(g, 'lijian')).toContain(a);
    rest.forEach((e) => (e.hp = 0));
    await g.activate('lijian', undefined, a);
    expect(a.redirect).toBeFalsy();
    expect(legalTargets(g, 'lijian')).toEqual([]);
  });
  it('targets 筛选：row / armorAtLeast 生效；不需选敌人的技能返回 []', () => {
    const g = setup('H02');
    const ab = CONFIG.heroes.H02.mainSkills.find((x) => x.id === 'lijian')!;
    const old = ab.targets;
    try {
      ab.targets = { row: 'front' };
      expect(g.legalTargets('lijian').every((e) => e.row === 'front')).toBe(true);
      ab.targets = { armorAtLeast: 99 };
      expect(g.legalTargets('lijian')).toEqual([]);
    } finally {
      ab.targets = old;
    }
    const c = setup('H06', 'H05');
    expect(c.legalTargets('xieling')).toEqual([]);
  });
});
