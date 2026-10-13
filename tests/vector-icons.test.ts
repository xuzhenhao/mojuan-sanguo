/** ⚔ ✦ ♥ ◆ ♠♥♣♦ 一律画行内矢量图标（系统字符在 iOS / 微信可能渲染成彩色 emoji） */
import { describe, expect, it } from 'vitest';
import { fakeClock } from './helpers';
import { drawInlineIcon, glyphLabel, ICON_H, type InlineIcon } from '../src/game/overlays/glyphs';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { C } from '../src/game/scenes/battle/paint';
import { T } from '../src/game/scenes/p4-kit';
import { OverlayStack } from '../src/engine/modal';
import { RestScene, type RestRun } from '../src/game/scenes/rest';
import { ShopScene } from '../src/game/scenes/shop';
import { MAP_CONFIG } from '../src/data/map';
import type { Surface } from '../src/engine/surfaces';
import { canRemove } from '../src/game/economy/inventory';
import { center, flush, p4env, tap } from './p4-helpers';

const ICON_CH = /[⚔✦◆♠♥♣♦]/;

function recCtx() {
  const texts: string[] = [];
  const calls: string[] = [];
  const fills: string[] = [];
  const ys: number[] = [];
  const grad = { addColorStop() {} };
  const t: Record<string | symbol, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (k === 'fillText') return (s: string) => void texts.push(s);
      if (k === 'fill') return () => (calls.push('fill'), fills.push(String(o.fillStyle)));
      if (k === 'moveTo' || k === 'lineTo') return (_x: number, y: number) => (calls.push(String(k)), ys.push(y));
      return () => void calls.push(String(k));
    },
    set(o, k, v) {
      o[k] = v;
      return true;
    },
  });
  return { ctx, texts, calls, fills, ys };
}
const surf = (ctx: unknown) => ({ name: 'main', ctx, canvas: {}, scale: 1, dirty: true }) as unknown as Surface;

describe('drawInlineIcon：高 0.8 × 字号、底边压基线、墨色描边', () => {
  for (const id of ['sword', 'spark', 'gem', 'suit_S', 'suit_H', 'suit_C', 'suit_D'] as InlineIcon[]) {
    it(id, () => {
      const r = recCtx();
      drawInlineIcon(r.ctx as never, id, 50, 100, 20, T.cinnHi);
      expect(r.texts).toEqual([]);
      expect(r.calls).toContain('stroke');
      for (const y of r.ys) {
        expect(y).toBeGreaterThanOrEqual(100 - 20 * ICON_H - 1e-6);
        expect(y).toBeLessThanOrEqual(100 + 1e-6);
      }
      expect(Object.keys(r.ctx)).not.toContain('shadowBlur');
    });
  }
});

describe('glyphLabel：文本里的 ♠♥♣♦ 画矢量，红花色 / 黑花色分色', () => {
  it('♠2–9 / 若不为 ♥', () => {
    const r = recCtx();
    glyphLabel(r.ctx as never, '判定 ♠2–9，若不为 ♥', 0, 50, '14px "Brush"', 14, T.paper, 'left', { red: T.cinnHi, black: T.paper });
    expect(r.texts.some((s) => ICON_CH.test(s))).toBe(false);
    expect(r.texts.join('')).toBe('判定 2–9，若不为 ');
    expect(r.fills).toEqual([T.paper, T.cinnHi]);
  });
});

describe('战斗意图角标', () => {
  const sc = () =>
    new BattleScene({ now: fakeClock().now, overlays: new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} }), debugDefaults: true });
  const ir = { x: 0, y: 0, w: 52, h: 28 };
  it('⚔（有伤害）→ 矢量 cinnHi', () => {
    const r = recCtx();
    sc().drawIntent(r.ctx as never, ir, { dmg: 3, acts: ['杀'] } as never, false);
    expect(r.texts).toEqual(['3']);
    expect(r.calls).toContain('stroke');
    expect((r.ctx as { strokeStyle?: string }).strokeStyle).toBe(C.cinnHi);
  });
  it('✦（未知意图）→ 矢量 gold', () => {
    const r = recCtx();
    sc().drawIntent(r.ctx as never, ir, { dmg: 0, acts: ['咒'] } as never, false);
    expect(r.texts).toEqual(['?']);
    expect(r.fills).toContain(C.gold);
  });
  it('整页战斗绘制不出现 ⚔ ✦ 字符', () => {
    const s = sc();
    s.enter({ width: 390, height: 844, invalidate() {} }, { seed: 7 });
    const r = recCtx();
    s.draw('main', surf(r.ctx));
    expect(r.texts.filter((x) => ICON_CH.test(x))).toEqual([]);
  });
});

describe('营地 ♥ / 集市 ◆', () => {
  it('营地疗伤 ♥ → 矢量 cinnHi', () => {
    const t = p4env();
    const st = { hp: 3, maxHp: 8 };
    const run: RestRun = { head: () => st, save: () => {}, restConfig: MAP_CONFIG.rest };
    const s = new RestScene({ ...t.env, run: () => run });
    s.enter(t.ctx, { kind: 'rest', layer: 3, fixed: false });
    const r = recCtx();
    s.draw('main', surf(r.ctx));
    expect(r.texts.filter((x) => ICON_CH.test(x))).toEqual([]);
    expect(r.fills).toContain(T.cinnHi);
  });
  it('删牌选牌：词条 ◆ → 矢量 gold，每条一个', async () => {
    const t = p4env({ gold: 500 });
    const s = new ShopScene(t.env);
    s.enter(t.ctx, undefined);
    const card = t.inv.deck.find((c) => canRemove(t.inv, c.uid))!;
    card.mods.push('a' as never, 'b' as never);
    s.gesture(tap(...center(s.goodRect(s.nGoods - 1, s.nGoods))));
    await flush();
    expect(t.overlays.top()?.id).toBe('deck-pick');
    const r = recCtx();
    t.overlays.draw(surf(r.ctx), 16);
    expect(r.texts.filter((x) => ICON_CH.test(x))).toEqual([]);
    expect(r.fills.filter((f) => f === T.gold).length).toBeGreaterThanOrEqual(2);
  });
});
