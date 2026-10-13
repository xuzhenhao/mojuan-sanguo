import { describe, expect, it } from 'vitest';
import { FONT } from '../src/game/scenes/battle/paint';

describe('战斗页书法字体', () => {
  it('只用霞鹜文楷（Brush），未就绪时按 #202 回退 serif，不回退系统楷体', () => {
    expect(FONT.brush).toBe('"Brush", serif');
    expect(FONT.num).toBe('"Brush", sans-serif');
    expect(FONT.body).toBe('"Brush", sans-serif');
    expect(FONT.brush).not.toMatch(/Kai|Ma Shan/);
  });
});
