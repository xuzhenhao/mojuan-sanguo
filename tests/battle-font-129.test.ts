import { describe, expect, it } from 'vitest';
import { FONT } from '../src/game/scenes/battle/paint';

describe('战斗页书法字体', () => {
  it('只用霞鹜文楷（Brush），不回退系统楷体', () => {
    expect(FONT.brush).toBe('"Brush"');
    expect(FONT.brush).not.toMatch(/Kai|Ma Shan|serif/);
  });
});
