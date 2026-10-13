import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { battleTitle } from '../src/game/scenes/battle/title';

describe('#216 战斗标题读配置', () => {
  it('Boss 战用 rules.battleTitle.boss，不显示「第N战」', () => {
    const t = battleTitle('BOSS', 5, '张角·墨魇');
    expect(t).not.toMatch(/第\d+战/);
    expect(t).toBe(CONFIG.rules.battleTitle.boss.replace('{name}', '张角·墨魇'));
    expect(t).toContain('张角·墨魇');
  });
  it('普通 / 精英战按模板填序号与组包名', () => {
    expect(battleTitle('BATTLE', 3, '黄巾贼')).toBe(CONFIG.rules.battleTitle.normal.replace('{n}', '3').replace('{name}', '黄巾贼'));
    expect(battleTitle(undefined, 2, 'x')).toContain('2');
    expect(battleTitle('ELITE', 4, '精英·张宝')).toBe(CONFIG.rules.battleTitle.elite.replace('{n}', '4').replace('{name}', '精英·张宝'));
  });
  it('模板可替换（只改 yaml 即生效）', () => {
    expect(battleTitle('BOSS', 1, 'B', { normal: '{name}', elite: '{name}', boss: 'X{name}' })).toBe('XB');
  });
});
