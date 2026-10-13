import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { ENEMIES } from '../src/data/enemies';
import { battleTitle, enemyShortName, titleName } from '../src/game/scenes/battle/title';

describe('#216 跟进：Boss 短名来自 yaml shortName', () => {
  it('张角 Boss 的 shortName = 张角，name 保持不变', () => {
    expect(CONFIG.enemies.B1.shortName).toBe('张角');
    expect(ENEMIES.B1.short).toBe('张角');
    expect(CONFIG.enemies.B1.name).toBe('张角·墨魇');
  });
  it('没有 shortName 时回退 name', () => {
    expect(enemyShortName({ name: '黄巾步卒' })).toBe('黄巾步卒');
  });
  it('所有敌人的竖排名 ≤4 字（超长名必须配 shortName，不截断）', () => {
    for (const e of Object.values(ENEMIES)) expect([...enemyShortName(e)].length).toBeLessThanOrEqual(4);
  });
  it('Boss 顶条 =「首领 · 张角」', () => {
    const t = battleTitle('BOSS', 5, titleName('BOSS', '张角·墨魇', [{ ...ENEMIES.B1 }]));
    expect(t).toBe('首领 · 张角');
    expect(titleName('BATTLE', '弓手掩护', [{ ...ENEMIES.B1 }])).toBe('弓手掩护');
  });
});
