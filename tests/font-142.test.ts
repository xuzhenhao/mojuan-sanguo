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
/** #202：字体栈只允许 "Brush", serif / "Brush", sans-serif（未就绪时的通用系统回退），不得点名任何具体系统字体 */
const FORBIDDEN =
  /\b(monospace|system-ui|Georgia|Times New Roman|PingFang|Noto|Source Han|Songti|STSong|STKaiti|KaiTi|Kaiti SC|Ma Shan Zheng|Arial|Helvetica)\b/;

describe('#142/#202 字体只用霞鹜文楷（Brush），未就绪仅回退通用 serif / sans-serif', () => {
  it('font() 只产出 Brush 族名', () => {
    expect(FONT_FAMILY).toBe('"Brush", serif');
    expect(font(14)).toBe('14px "Brush", serif');
    expect(font(18, true)).toBe('bold 18px "Brush", serif');
  });
  it('结算页正文/数字/书法字体栈都只有 Brush', () => {
    for (const f of [body(12), body(12, true), num(28), brush(20)]) expect(f).toMatch(/^(bold )?\d+px "Brush", (serif|sans-serif)$/);
  });
  it('src 内字体声明不含任何系统字体名', () => {
    const bad: string[] = [];
    for (const file of walk(SRC)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          if (/font/i.test(line) && (FORBIDDEN.test(line) || /\b(serif|sans-serif)\b/.test(line.replace(/"Brush", (sans-)?serif/g, ''))))
            bad.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(bad).toEqual([]);
  });
});
