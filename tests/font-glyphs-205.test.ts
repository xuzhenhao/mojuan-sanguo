import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { brushChars, checkCoverage, collectFromTs, collectFromYaml, collectGlyphs, isSystemSymbol, readCmap, type GlyphSources } from '../scripts/font-glyphs';
import { WECHAT_FONT_SRC } from '../scripts/build-wechat';

const ROOT = resolve(import.meta.dirname, '..');

describe('#205 收字', () => {
  it('yaml 收所有字符串值并记录 文件#键路径', () => {
    const g: GlyphSources = new Map();
    collectFromYaml(g, 'name: 张角·墨魇\nshortName: 张角\nlist: [甲]\nn: 3\n', 'config/x.yaml');
    expect(g.get('魇')).toEqual(['config/x.yaml#name']);
    expect(g.get('角')).toEqual(['config/x.yaml#name', 'config/x.yaml#shortName']);
    expect(g.get('甲')).toEqual(['config/x.yaml#list[0]']);
    expect(g.has('3')).toBe(false);
  });

  it('ts 只收字符串/模板字面量，不收注释', () => {
    const g: GlyphSources = new Map();
    collectFromTs(g, "// 注释里的字\nconst a = '提示';\nconst b = `第${n}战`;\n", 'src/a.ts');
    expect(g.has('注')).toBe(false);
    expect(g.get('提')).toEqual(['src/a.ts:2']);
    expect(g.get('战')).toEqual(['src/a.ts:3']);
  });

  it('真实仓库：包含坏档提示、shortName 与 Boss 名；图标符号不入子集', () => {
    const g = collectGlyphs(ROOT);
    const chars = new Set(brushChars(g));
    for (const ch of '存档已损坏，请重新点将出征张角墨魇首领·') expect(chars.has(ch), ch).toBe(true);
    expect(g.get('损')!.some((s) => s.startsWith('src/game/result/abandon.ts'))).toBe(true);
    expect(isSystemSymbol('⚔')).toBe(true);
    expect(isSystemSymbol('🛡')).toBe(true);
    expect(isSystemSymbol('张')).toBe(false);
  });

  it('入库的小游戏 ttf 覆盖全部收集字形（缺字时报告列出字与出处）', () => {
    const g = collectGlyphs(ROOT);
    const cmap = readCmap(readFileSync(resolve(ROOT, WECHAT_FONT_SRC)));
    const r = checkCoverage(g, cmap, 'x');
    expect(r.missing).toEqual([]);
    cmap.delete('损'.codePointAt(0)!);
    const bad = checkCoverage(g, cmap, 'x');
    expect(bad.missing.map((m) => [m.char, m.code])).toEqual([['损', 'U+635F']]);
    expect(bad.missing[0].sources.length).toBeGreaterThan(0);
  });
});
