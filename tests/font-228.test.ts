/**
 * #228：字体族名只从 rules.fonts 经 game/fonts 读取；按 UI 清单区分 BRUSH / SANS。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { FONTS } from '../src/data/config';
import { activeFontStack, brushFont, brushStack, fontStack, sansFont, sansStack, setFontPlatform } from '../src/game/fonts';
import { FONT } from '../src/game/scenes/battle/paint';
import { BRUSH, SANS } from '../src/game/scenes/p4-kit';
import { body, brush, num } from '../src/game/result/paint';
import { NOTICE_FONT } from '../src/game/overlays/notice';
import { TITLE_FONT, BODY_FONT } from '../src/game/overlays/detail';

const SRC = join(__dirname, '../src');
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|css)$/.test(n) ? [p] : [];
  });

describe('#228 字体族名统一从配置读取', () => {
  beforeEach(() => setFontPlatform(FONTS, 'web'));

  it('brushFont / sansFont / FONT / BRUSH / SANS / 结算 / 提示 / 详情 都走 activeFontStack', () => {
    expect(brushStack()).toBe(fontStack(FONTS, 'web', 'brush'));
    expect(sansStack()).toBe(fontStack(FONTS, 'web', 'sans'));
    expect(brushFont(20)).toBe(`20px ${brushStack()}`);
    expect(sansFont(14, true)).toBe(`bold 14px ${sansStack()}`);
    expect(FONT.brush).toBe(brushStack());
    expect(FONT.num).toBe(sansStack());
    expect(FONT.body).toBe(sansStack());
    expect(BRUSH(18)).toBe(brushFont(18));
    expect(SANS(12)).toBe(sansFont(12));
    expect(brush(20)).toBe(brushFont(20));
    expect(body(12)).toBe(sansFont(12));
    expect(num(28)).toBe(sansFont(28, true));
    expect(NOTICE_FONT()).toBe(sansFont(16));
    expect(TITLE_FONT()).toBe(brushFont(24)); // DETAIL.titlePx
    expect(BODY_FONT()).toMatch(new RegExp(`^\\d+px ${sansStack().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  });

  it('切换平台后栈立即更新（微信 sans 为系统字体）', () => {
    setFontPlatform(FONTS, 'wechat');
    expect(sansStack()).toBe('sans-serif');
    expect(SANS(14)).toBe('14px sans-serif');
    expect(FONT.num).toBe('sans-serif');
    expect(brushStack()).toBe(fontStack(FONTS, 'wechat', 'brush'));
    setFontPlatform(FONTS, 'web');
  });

  it('src 内除 fonts.ts 与注释外，不得出现硬编码 "Brush" 族名字符串', () => {
    const bad: string[] = [];
    for (const file of walk(SRC)) {
      if (file.includes('/platform/web/debug/')) continue;
      if (file.endsWith('/game/fonts.ts')) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          // CSS font-family: 'Brush' in debug style is ok to skip via path filter
          if (/"Brush"|'Brush'/.test(line) && !/FontFace|族名|霞鹜|注释/.test(line)) {
            // allow loadBrush / refitAfterBrush identifiers, and comments already skipped
            if (/Brush/.test(line) && /"Brush"|'Brush'/.test(line)) bad.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(bad).toEqual([]);
  });

  it('代表性 SANS 位点：提示条、详情正文、战斗数字栈', () => {
    expect(NOTICE_FONT()).toContain(sansStack());
    expect(BODY_FONT()).toContain(sansStack());
    expect(FONT.num).toBe(sansStack());
    expect(activeFontStack('sans')).toBe(sansStack());
  });

  it('代表性 BRUSH 位点：按钮默认、竖排名、卡名标题', () => {
    expect(FONT.brush).toBe(brushStack());
    expect(TITLE_FONT()).toContain(brushStack());
    expect(BRUSH(24)).toContain(brushStack());
  });
});
