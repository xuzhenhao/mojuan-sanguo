import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { nextSkillStep, skillButtons, skillCardOk, skillTargetOk } from '../src/platform/web/skills';
import { card, mkGame } from './helpers';

function setup(main: string, sub: string) {
  const { g } = mkGame({}, 1, { main, sub });
  g.startBattle();
  g.en.forEach((e) => (e.pat = [['闪']]));
  return g;
}
const activeIds = (main: string, sub: string) =>
  [...CONFIG.heroes[main].mainSkills, CONFIG.heroes[sub].subSkill].filter((a) => a?.trigger.when === 'active').map((a) => a.id);

describe('Web 主动技按钮（配置生成）', () => {
  it('按钮列表与当前主将/副将配置中的主动技一致', () => {
    for (const [m, s] of [
      ['H02', 'H04'],
      ['H06', 'H04'],
      ['H09', 'H03'],
      ['H01', 'H02'],
    ]) {
      const g = setup(m, s);
      const ids = skillButtons(g).map((b) => b.id);
      for (const id of activeIds(m, s)) expect(ids).toContain(id);
      expect(ids).toEqual(g.effects.activeAbilities().map((x) => x.ab.id));
    }
  });
  it('离间：需要选目标，不需要弃牌；用完后置灰', async () => {
    const g = setup('H02', 'H04');
    const b = skillButtons(g).find((x) => x.id === 'lijian')!;
    expect(b).toMatchObject({ needTarget: true, needCard: false, disabled: false, remaining: 1, name: '离间' });
    expect(nextSkillStep(b, {})).toBe('target');
    expect(skillTargetOk(g, 'lijian', g.en[0])).toBe(true);
    expect(nextSkillStep(b, { target: g.en[0] })).toBeNull();
    await g.activate('lijian', undefined, g.en[0]);
    const after = skillButtons(g).find((x) => x.id === 'lijian')!;
    expect(after).toMatchObject({ disabled: true, remaining: 0, reason: '次数已用完' });
  });
  it('挟令：需要弃牌；无手牌时置灰；弃牌后生效并置灰', async () => {
    const g = setup('H06', 'H04');
    const b = skillButtons(g).find((x) => x.id === 'xieling')!;
    expect(b).toMatchObject({ needCard: true, needTarget: false });
    expect(nextSkillStep(b, {})).toBe('card');
    const c = card('B001', 'S', 7);
    g.hand = [c];
    expect(skillCardOk(g, 'xieling', c)).toBe(true);
    const armor = g.p.armor;
    await g.activate('xieling', c);
    expect(g.p.armor).toBe(armor + 2);
    expect(skillButtons(g).find((x) => x.id === 'xieling')!.disabled).toBe(true);
    const g2 = setup('H06', 'H04');
    g2.hand = [];
    expect(skillButtons(g2).find((x) => x.id === 'xieling')).toMatchObject({ disabled: true, reason: '没有可弃置的牌' });
  });
  it('傲骨：只能选红色牌（来自配置 from 筛选）', () => {
    const g = setup('H09', 'H03');
    const red = card('B001', 'H', 5);
    const black = card('B001', 'S', 5);
    g.hand = [red, black];
    expect(skillCardOk(g, 'aogu', red)).toBe(true);
    expect(skillCardOk(g, 'aogu', black)).toBe(false);
    g.hand = [black];
    expect(skillButtons(g).find((x) => x.id === 'aogu')!.disabled).toBe(true);
  });
  it('非空闲状态（locked）时全部置灰', () => {
    const g = setup('H02', 'H04');
    expect(skillButtons(g, true).every((b) => b.disabled)).toBe(true);
  });
});
