import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_FAMILY, font } from '../src/engine/fonts';
import { body, brush, num } from '../src/game/result/paint';

const SRC = join(__dirname, '../src');
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|css|html)$/.test(n) ? [p] : [];
  });
const FORBIDDEN =
  /\b(sans-serif|serif|monospace|system-ui|Georgia|Times New Roman|PingFang|Noto|Source Han|Songti|STSong|STKaiti|KaiTi|Kaiti SC|Ma Shan Zheng|Arial|Helvetica)\b/;

describe('#142 字体只用霞鹜文楷（Brush），不回退系统字体', () => {
  it('font() 只产出 Brush 族名', () => {
    expect(FONT_FAMILY).toBe('"Brush"');
    expect(font(14)).toBe('14px "Brush"');
    expect(font(18, true)).toBe('bold 18px "Brush"');
  });
  it('结算页正文/数字/书法字体栈都只有 Brush', () => {
    for (const f of [body(12), body(12, true), num(28), brush(20)]) expect(f).toMatch(/^(bold )?\d+px "Brush"$/);
  });
  it('src 内字体声明不含任何系统字体名', () => {
    const bad: string[] = [];
    for (const file of walk(SRC)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          if (/font/i.test(line) && FORBIDDEN.test(line)) bad.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(bad).toEqual([]);
  });
});
