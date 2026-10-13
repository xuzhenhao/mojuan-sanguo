/** #169 结果数值色对齐 main/#105：上涨/得牌 goldHi，体力下降 cinnHi */
import { describe, expect, it } from 'vitest';
import { changeColor } from '../src/game/scenes/event';
import { T } from '../src/game/scenes/p4-kit';

describe('event changeColor', () => {
  it('gains use goldHi', () => {
    expect(changeColor({ kind: 'card+', text: '+ 杀' })).toBe(T.goldHi);
    expect(changeColor({ kind: 'armor', text: '护甲 +5' })).toBe(T.goldHi);
    expect(changeColor({ kind: 'hp', text: '体力 5→7' })).toBe(T.goldHi);
    expect(changeColor({ kind: 'gold', text: '铜钱 10→30' })).toBe(T.goldHi);
  });
  it('hp loss uses cinnHi', () => {
    expect(changeColor({ kind: 'hp', text: '体力 7→5' })).toBe(T.cinnHi);
  });
  it('removed card stays paper', () => {
    expect(changeColor({ kind: 'card-', text: '- 闪' })).toBe(T.paper);
  });
});

describe('event result page glyphs (#169)', () => {
  it('no text arrow/minus or SANS in result drawing', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/game/scenes/event.ts', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('private drawResult'), src.indexOf('/** 情景 / 选项副文案色'));
    expect(body).not.toMatch(/SANS\(/);
    expect(body).not.toMatch(/[^y]label\(/);
    expect(body).toMatch(/glyphLabel\(c, ch\.text/);
  });
});
