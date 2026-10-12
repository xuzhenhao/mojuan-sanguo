/** #56 战间回血 / #58 陆逊谦逊重复展示 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { betweenBattleHeal } from '../src/core/battle';
import { HEROES } from '../src/data/heroes';
import { runChapter } from '../src/sim/autoplay';
import { mkGame } from './helpers';

describe('#56 战间回复 1 点体力', () => {
  it('规则值 = 1', () => expect(CONFIG.rules.betweenBattleHeal).toBe(1));
  it('nextBattle：胜利进入下一场时回 1，不超过上限', () => {
    const { g } = mkGame({}, 1, { main: 'H06', sub: 'H04' });
    g.startBattle();
    g.p.hp = g.p.maxHp - 2;
    g.nextBattle();
    expect(g.battleIdx).toBe(1);
    expect(g.p.hp).toBe(g.p.maxHp - 1);
    g.p.hp = g.p.maxHp;
    g.nextBattle();
    expect(g.p.hp).toBe(g.p.maxHp);
  });
  it('core 与自动试玩共用同一函数', async () => {
    expect(betweenBattleHeal(3, 9)).toBe(4);
    expect(betweenBattleHeal(9, 9)).toBe(9);
    const r = await runChapter(3, { main: 'H03' });
    for (let i = 1; i < r.res.length; i++) expect(r.res[i].hpStart).toBe(betweenBattleHeal(r.res[i - 1].hpEnd, r.res[i - 1].maxHp));
  });
});

describe('#58 陆逊·谦逊只展示一次、只 +1 军令', () => {
  it('技能列表无重名', () => {
    for (const h of Object.values(HEROES)) {
      const names = h.mainSkills.map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
    }
    expect(HEROES.H08.mainSkills.filter((s) => s.name === '谦逊')).toHaveLength(1);
    expect(HEROES.H08.mainSkills.find((s) => s.name === '谦逊')!.desc).toContain('每回合 +1 军令');
  });
  it('每回合军令 = 上限 + 1（不叠加两次）', async () => {
    const { g } = mkGame({}, 1, { main: 'H08', sub: 'H07' });
    g.startBattle();
    expect(g.p.ling).toBe(g.p.maxLing + 1);
    g.hand = [];
    g.turnEnd();
    await g.endTurn([]);
    expect(g.p.ling).toBe(g.p.maxLing + 1);
  });
});
