import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { card, mkGame } from './helpers';

function setup(main = 'H01', sub = 'H02') {
  const r = mkGame({}, 1, { main, sub });
  r.g.startBattle();
  r.g.en.forEach((e) => (e.pat = [['闪']]));
  return r.g;
}

describe('第 1 章平衡 v2：T002 顺手牵羊', () => {
  it('有闪标记：只去 1 枚闪标记，不去护甲，摸 1', async () => {
    const g = setup();
    const e = g.en[0];
    e.marks = 1;
    e.armor = 3;
    g.p.ling = 3;
    const c = card('T002');
    g.hand = [c];
    await g.play(c, e);
    expect(e.marks).toBe(0);
    expect(e.armor).toBe(3);
    expect(g.hand.length).toBe(1);
  });
  it('无闪标记：去至多 3 甲，摸 1', async () => {
    const g = setup();
    const e = g.en[0];
    e.marks = 0;
    e.armor = 4;
    g.p.ling = 3;
    const c = card('T002');
    g.hand = [c];
    await g.play(c, e);
    expect(e.armor).toBe(1);
    expect(g.hand.length).toBe(1);
  });
  it('无视距离：后排敌人也可作为目标', () => {
    const g = setup();
    const back = g.en.find((x) => x.row === 'back');
    if (back) expect(g.canTarget(back, card('T002'))).toBe(true);
  });
});

describe('第 1 章平衡 v2：配置', () => {
  it('T003 删去清除增益；奉孝遗策只剩手牌上限；受到伤害文案', () => {
    expect(CONFIG.cards.T003.desc).not.toContain('增益');
    const fx = CONFIG.heroes.H06.combos!.find((c) => c.name === '奉孝遗策')!;
    expect(fx.abilities.flatMap((a) => a.do.map((d) => d.stat))).toEqual(['hand_limit']);
    expect(CONFIG.heroes.H05.mainSkills[0].desc).toContain('受到伤害（失去体力）后');
    expect(CONFIG.heroes.H06.mainSkills[0].desc).toContain('受到伤害（失去体力）后');
  });
  it('护甲完全吸收不触发天策', async () => {
    const g = setup('H05', 'H06');
    g.p.armor = 5;
    const n = g.hand.length;
    await g.dmgPlayer(1);
    expect(g.hand.length).toBe(n);
    g.p.armor = 0;
    await g.dmgPlayer(1);
    expect(g.hand.length).toBe(n + 1);
  });
  it('陆逊：每回合 +1 军令、手牌打空摸 2、体力 9', async () => {
    const g = setup('H08', 'H07');
    expect(g.p.maxHp).toBe(9);
    const ab = CONFIG.heroes.H08.mainSkills.find((a) => a.id === 'qianxun_ling')!;
    expect(ab.if ?? []).toEqual([]);
    const lian = CONFIG.heroes.H08.mainSkills.find((a) => a.id === 'lianying')!;
    expect(lian.trigger.when).toBe('hand_empty');
    expect(lian.limit).toEqual({ per: 'turn', times: 2 });
  });
});
