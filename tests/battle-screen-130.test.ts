import { testNow } from './helpers';
import { describe, expect, it } from 'vitest';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { drawScreenBg, MOUNT_BOTTOM, MOUNT_TOP, PANEL_EVEN, PANEL_ODD, paperDots, screenLayout } from '../src/game/scenes/battle/screen';

describe('#130 金漆屏风几何', () => {
  it('390×844：6 扇各 65 宽，奇偶交替，5 条折痕', () => {
    const L = screenLayout(390, 844);
    expect(L.panels.map((p) => p.r.w)).toEqual([65, 65, 65, 65, 65, 65]);
    expect(L.panels[0].colors).toBe(PANEL_ODD);
    expect(L.panels[1].colors).toBe(PANEL_EVEN);
    expect(L.creases).toEqual([65, 130, 195, 260, 325]);
  });
  it('山影只在 y 140–420，x 不出内容框', () => {
    for (const [w, h] of [
      [390, 844],
      [360, 640],
      [465, 780],
    ]) {
      for (const p of screenLayout(w, h).mountain) {
        expect(p.y).toBeGreaterThanOrEqual(MOUNT_TOP);
        expect(p.y).toBeLessThanOrEqual(MOUNT_BOTTOM);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(w);
      }
    }
  });
  it('双描边 6 / 9 内缩', () => {
    const [a, b] = screenLayout(390, 844).borders;
    expect(a.r).toEqual({ x: 6, y: 6, w: 378, h: 832 });
    expect(b.r).toEqual({ x: 9, y: 9, w: 372, h: 826 });
  });
  it('纸纹确定性', () => {
    expect(paperDots(390, 844)).toEqual(paperDots(390, 844));
  });
});

type Call = [string, ...number[]];
function mockCtx(full: boolean) {
  const calls: Call[] = [];
  const grad = { addColorStop() {} };
  const c: Record<string, unknown> = {
    globalAlpha: 1,
    fillStyle: '',
    setTransform() {},
    clearRect() {},
    drawImage() {},
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(['fillRect', x, y, w, h]),
  };
  if (full)
    Object.assign(c, {
      save: () => calls.push(['save']),
      restore: () => calls.push(['restore']),
      beginPath() {},
      rect: (x: number, y: number, w: number, h: number) => calls.push(['rect', x, y, w, h]),
      clip: () => calls.push(['clip']),
      moveTo: (x: number, y: number) => calls.push(['moveTo', x, y]),
      lineTo: (x: number, y: number) => calls.push(['lineTo', x, y]),
      closePath() {},
      fill() {},
      stroke() {},
      createLinearGradient: () => grad,
      createRadialGradient: () => grad,
    });
  return { c, calls };
}

describe('#130 金漆屏风绘制', () => {
  it('先 clip 到内容框，最后 restore；alpha 复原', () => {
    const { c, calls } = mockCtx(true);
    drawScreenBg(c as never, 390, 844);
    const names = calls.map((x) => x[0]);
    expect(names[0]).toBe('save');
    expect(calls[1]).toEqual(['rect', 0, 0, 390, 844]);
    expect(names[2]).toBe('clip');
    expect(names.at(-1)).toBe('restore');
    expect(c.globalAlpha).toBe(1);
  });
  it('所有填充与路径点都在内容框内（无旧版 x=-10…w+20 横带）', () => {
    for (const full of [true, false])
      for (const [w, h] of [
        [390, 844],
        [360, 640],
        [465, 780],
      ]) {
        const { c, calls } = mockCtx(full);
        drawScreenBg(c as never, w, h);
        for (const [k, x, y, cw = 0, ch = 0] of calls) {
          if (k !== 'fillRect' && k !== 'moveTo' && k !== 'lineTo') continue;
          expect(x, `${k} ${w}×${h}`).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x + cw).toBeLessThanOrEqual(w + 0.5);
          expect(y + ch).toBeLessThanOrEqual(h);
        }
      }
  });
});

describe('#130 战斗场景 bg 层接入屏风', () => {
  it('BattleScene.draw("bg") 走屏风：有 clip，5 条折痕，填充不出框', () => {
    for (const [w, h] of [
      [390, 844],
      [360, 640],
      [465, 780],
    ]) {
      const sc = new BattleScene({ now: testNow, debugDefaults: true });
      sc.enter({ width: w, height: h, invalidate() {} } as never, { seed: 7 });
      const { c, calls } = mockCtx(true);
      sc.draw('bg', { ctx: c } as never);
      expect(calls.some((x) => x[0] === 'clip')).toBe(true);
      const creases = calls.filter((x) => x[0] === 'fillRect' && x[3] === 1 && x[4] === h && x[2] === 0);
      expect(creases.length).toBe(10); // 每条折痕 金线 + 暗线
      for (const [k, x, y, cw = 0, ch = 0] of calls)
        if (k === 'fillRect') {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x + cw).toBeLessThanOrEqual(w + 0.5);
          expect(y + ch).toBeLessThanOrEqual(h);
        }
    }
  });
});
