import { describe, expect, it } from 'vitest';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { DYING_EDGE_COLOR, DYING_PERIOD_MS, dyingAlpha, isDying } from '../src/game/scenes/battle/hpview';

describe('主将 dying 脉动（render-spec §3.3）', () => {
  it('1.2s 周期，alpha 在 .35–.9 之间', () => {
    const xs = Array.from({ length: 121 }, (_, i) => dyingAlpha(i * 10));
    expect(Math.min(...xs)).toBeCloseTo(0.35, 2);
    expect(Math.max(...xs)).toBeCloseTo(0.9, 2);
    expect(dyingAlpha(300)).toBeCloseTo(dyingAlpha(300 + DYING_PERIOD_MS), 6);
    expect(isDying(1)).toBe(true);
    expect(isDying(2)).toBe(false);
  });

  const reds = (hp: number, t: number) => {
    let now = t;
    const sc = new BattleScene({ debugDefaults: true, now: () => now });
    sc.enter({ width: 390, height: 844, invalidate() {} } as never, { seed: 7 });
    sc.g.p.hp = hp;
    const out: { x: number; y: number; w: number; h: number; a: number }[] = [];
    const ctx = {
      globalAlpha: 1,
      fillStyle: '' as unknown,
      font: '',
      setTransform() {},
      clearRect() {},
      drawImage() {},
      fillText() {},
      measureText: (s: string) => ({ width: s.length * 10 }),
      fillRect(x: number, y: number, w: number, h: number) {
        if (this.fillStyle === DYING_EDGE_COLOR) out.push({ x, y, w, h, a: this.globalAlpha });
      },
    };
    sc.drawHeroes(ctx as never);
    const L = sc.layout();
    now = 0;
    // 外轮廓 4 条边中的上边：x−2、y−2、宽 w+4、高 2
    const edge = (r: { x: number; y: number; w: number; h: number }) => out.filter((o) => o.x === r.x - 2 && o.y === r.y - 2 && o.w === r.w + 4 && o.h === 2);
    const all = out;
    return { main: edge(L.main), sub: edge(L.sub), sc, all, L };
  };

  it('体力 1：主将红边 alpha 随时间变化', () => {
    const a = reds(1, 0).main;
    const b = reds(1, 300).main;
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
    expect(a[0].a).toBeCloseTo(dyingAlpha(0), 6);
    expect(b[0].a).toBeCloseTo(0.9, 2);
  });
  it('颜色 #b8322a、线宽 2、只画 4 条外轮廓线（不覆盖牌面）', () => {
    const { all, L } = reds(1, 300);
    const m = L.main;
    expect(all.length).toBe(4);
    for (const o of all) {
      expect(Math.min(o.w, o.h)).toBe(2);
      const inside = o.x >= m.x && o.y >= m.y && o.x + o.w <= m.x + m.w && o.y + o.h <= m.y + m.h;
      expect(inside).toBe(false);
    }
  });
  it('体力 >1 无红边；副将任何时候都没有 dying 红边', () => {
    expect(reds(3, 300).main.length).toBe(0);
    expect(reds(1, 300).sub.length).toBe(0);
  });
  it('dying 时持续重绘', () => {
    const { sc } = reds(1, 0);
    let inv = 0;
    (sc as unknown as { ctx: unknown }).ctx = { width: 390, height: 844, invalidate: () => inv++ };
    sc.update(16);
    expect(inv).toBeGreaterThan(0);
  });
});
