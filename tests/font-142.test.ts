import { describe, expect, it, beforeEach } from 'vitest';
import { FONTS } from '../src/data/config';
import { brushFont, brushStack, fontStack, sansFont, setFontPlatform } from '../src/game/fonts';
import { body, brush, num } from '../src/game/result/paint';

describe('#142/#228 字体栈来自配置，未就绪仅回退通用 serif / sans-serif', () => {
  beforeEach(() => setFontPlatform(FONTS, 'web'));
  it('brushFont / sansFont 与 fontStack(web) 一致', () => {
    expect(brushStack()).toBe(fontStack(FONTS, 'web', 'brush'));
    expect(brushFont(14)).toBe('14px "Brush", serif');
    expect(brushFont(18, true)).toBe('bold 18px "Brush", serif');
    expect(sansFont(12)).toBe('14px "Brush", sans-serif'.replace('14', '12'));
  });
  it('结算页：书法走 brush，正文与数字走 sans', () => {
    expect(brush(20)).toBe(brushFont(20));
    expect(body(12)).toBe(sansFont(12));
    expect(num(28)).toBe(sansFont(28, true));
  });
});
