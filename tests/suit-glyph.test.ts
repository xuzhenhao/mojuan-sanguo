import { testNow } from './helpers';
/** Brush（霞鹜文楷子集）没有 ♠♥♣♦ 字形：牌面花色一律画矢量形，不出现在 fillText 里 */
import { describe, expect, it } from 'vitest';
import { paintCard } from '../src/game/scenes/p4-kit';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { OverlayStack } from '../src/engine/modal';
import type { Surface } from '../src/engine/surfaces';

function recCtx() {
  const texts: string[] = [];
  const paths: string[] = [];
  const grad = { addColorStop() {} };
  const t: Record<string | symbol, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (k === 'fillText') return (s: string) => void texts.push(s);
      return () => void paths.push(String(k));
    },
    set(o, k, v) {
      o[k] = v;
      return true;
    },
  });
  return { ctx, texts, paths };
}
const SUITS = /[♠♥♣♦]/;

describe('花色不用字符（Brush 无字形）', () => {
  it('p4-kit 大牌：4 种花色都画矢量形', () => {
    for (const suit of ['S', 'H', 'C', 'D'] as const) {
      const r = recCtx();
      paintCard(r.ctx as never, { id: 'B001', suit, rank: 12 });
      expect(r.texts.some((s) => SUITS.test(s))).toBe(false);
      expect(r.paths).toContain('fill');
    }
  });
  it('战斗页手牌与判定区不画花色字符', () => {
    const sc = new BattleScene({ now: testNow, overlays: new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} }), debugDefaults: true });
    sc.enter({ width: 390, height: 844, invalidate() {} }, { seed: 7 });
    (sc as unknown as { judging: unknown }).judging = { reason: '乐', suit: 'H', rank: 12, face: '♥Q', red: true };
    const r = recCtx();
    sc.draw('main', { name: 'main', ctx: r.ctx, canvas: {}, scale: 1, dirty: true } as unknown as Surface);
    expect(r.texts.filter((s) => SUITS.test(s))).toEqual([]);
  });
});

describe('→ − ✗ ✓ × 画矢量（Brush 无字形）', () => {
  it('glyphLabel：符号不进 fillText，其余文字照常', async () => {
    const { glyphLabel } = await import('../src/game/overlays/glyphs');
    const r = recCtx();
    glyphLabel(r.ctx as never, '体力 4→3', 100, 50, '15px "Brush"', 15, '#fff', 'center');
    glyphLabel(r.ctx as never, '− 杀', 100, 80, '15px "Brush"', 15, '#fff');
    expect(r.texts).toEqual(['体力 4', '3', ' 杀']);
    expect(r.paths.filter((p) => p === 'stroke')).toHaveLength(2);
  });
});
