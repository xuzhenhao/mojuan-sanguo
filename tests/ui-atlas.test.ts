import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import type { AtlasJson, BitmapFontJson } from '../src/engine/atlas';
import { measureNumber } from '../src/engine/atlas';

const atlas: AtlasJson = JSON.parse(readFileSync('public/assets/atlases/ui_sharp.json', 'utf8'));
const spec = readFileSync('docs/ui/render-spec.md', 'utf8');
const sec14 = spec.slice(spec.indexOf('## 14.'), spec.indexOf('## 附'));

describe('ui_sharp 图集（render-spec §14）', () => {
  it('§14 每个 PRD 图标 id 都有帧（缺图视为构建错误）', () => {
    const table = sec14.split('不在 PRD 表中')[0];
    const ids = [...table.matchAll(/^\| (.+?) \|/gm)].flatMap((m) => [...m[1].matchAll(/`([a-z_]+)`/g)].map((x) => x[1]));
    expect(ids.length).toBeGreaterThanOrEqual(38);
    for (const id of ids) expect(atlas.frames[id], id).toBeTruthy();
  });
  it('帧不越界、源 SVG 与帧一一对应', () => {
    for (const f of Object.values(atlas.frames)) expect(f.frame.y + f.frame.h).toBeLessThanOrEqual(atlas.meta.size.h);
    const svgs = readdirSync('art/src/icons')
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.slice(0, -4))
      .sort();
    expect(Object.keys(atlas.frames).sort()).toEqual(svgs);
  });
  it('位图数字 2 套，含 0-9 与符号', () => {
    for (const n of ['num_w', 'num_gold']) {
      const f: BitmapFontJson = JSON.parse(readFileSync(`public/assets/fonts/${n}.json`, 'utf8'));
      for (const face of [f, f.small!])
        for (const c of '0123456789+-−/%×:')
          expect(
            face.chars.some((g) => g.char === c),
            `${n} ${c}`,
          ).toBe(true);
      expect(measureNumber(f, '12', 34)).toBeGreaterThan(measureNumber(f, '1', 34));
    }
  });
});
