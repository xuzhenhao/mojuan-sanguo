/** #55 / #57 回归（修复见 #100） */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/battle';
import { seeded } from '../src/core/rng';
import { CONFIG } from '../src/data/config';
import { comboOf } from '../src/game/select/model';
import { CARD_W, HAND_MIN_STEP, layoutHand } from '../src/game/scenes/battle/hand';
import { silentIO } from '../src/sim/autoplay';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('#57 手牌 ≥6 张最右侧不被裁切', () => {
  const areas = [
    { x: 12, y: 700, w: 366, h: 110 }, // 390 宽屏
    { x: 8, y: 600, w: 304, h: 110 }, // 320 窄屏
  ];
  for (const area of areas)
    for (let n = 6; n <= 10; n++)
      it(`宽 ${area.w}、${n} 张：不滚动时全部在区域内，或滚到底时末张完整可见`, () => {
        const l = layoutHand(n, area);
        const right = area.x + area.w;
        if (l.maxScroll === 0) {
          for (const r of l.rects) {
            expect(r.x).toBeGreaterThanOrEqual(area.x - 1e-6);
            expect(r.x + r.w).toBeLessThanOrEqual(right + 1e-6);
          }
        } else {
          expect(l.step).toBe(HAND_MIN_STEP);
          const end = layoutHand(n, area, l.maxScroll).rects.at(-1)!;
          expect(end.x + end.w).toBeLessThanOrEqual(right + 1e-6);
          expect(end.w).toBe(CARD_W);
        }
      });
  it('调试版：≥6 张加 crowded 压缩、手牌区右侧留白', () => {
    const css = read('src/platform/web/debug/style.css');
    expect(css).toMatch(/#hand\.crowded\s*\.card\s*{[^}]*width:\s*52px/);
    expect(css).toMatch(/#hand\.crowded\s*\.card:last-child\s*{[^}]*margin-right:\s*0/);
    expect(css).toMatch(/#handwrap\s*{[^}]*padding:\s*8px 16px 0/);
    expect(read('src/platform/web/debug/main.ts')).toMatch(/classList\.toggle\('crowded',\s*G\.hand\.length\s*>=\s*6\)/);
  });
});

describe('#55 顶部武将栏随 main/sub 变化', () => {
  it('debug.html 不再写死 关羽 / 赵云 / 龙虎会', () => {
    const html = read('debug.html');
    for (const w of ['关羽', '赵云', '龙虎会']) expect(html).not.toContain(w);
  });
  it('调试版 render 从 G.main / G.sub / comboOf 取值', () => {
    const src = read('src/platform/web/debug/main.ts');
    expect(src).toMatch(/\$\('#pmain'\)\.textContent\s*=\s*main\.name/);
    expect(src).toMatch(/subEl\.textContent\s*=\s*sub\.name/);
    expect(src).toMatch(/comboOf\(main\.id,\s*sub\.id\)/);
  });
  const roster = Object.entries(CONFIG.heroes)
    .filter(([, h]) => h.roster !== false)
    .map(([id]) => id);
  it('所有开局武将两两组合：Game.main/sub 名字与配置一致，珠联只在已配置时出现', () => {
    for (const m of roster)
      for (const s of roster) {
        if (m === s) continue;
        const g = new Game(
          seeded(1),
          silentIO(() => {}),
          { autoShan: false, main: m, sub: s },
        );
        expect(g.main.name).toBe(CONFIG.heroes[m].name);
        expect(g.sub.name).toBe(CONFIG.heroes[s].name);
        const c = comboOf(m, s);
        const cfg = (CONFIG.heroes[m].combos ?? []).some((x) => x.partner === s) || (CONFIG.heroes[s].combos ?? []).some((x) => x.partner === m);
        if (c) expect(cfg).toBe(true);
      }
  });
});
