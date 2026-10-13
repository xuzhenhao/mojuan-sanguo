import { testNow } from './helpers';
/** #118：所有可点区域的命中框 ≥ 44×44 dp（视觉尺寸不变，只扩大命中框） */
import { afterEach, describe, expect, it } from 'vitest';
import { hitBox, hitDebug, hitInside, markHit, MIN_HIT } from '../src/engine/hit';
import type { Rect } from '../src/engine/types';
import { OverlayStack } from '../src/engine/modal';
import { RewardScene } from '../src/game/scenes/reward';
import { ShopScene } from '../src/game/scenes/shop';
import { ChestScene } from '../src/game/scenes/chest';
import { RestScene } from '../src/game/scenes/rest';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { RESULT_LAYOUT } from '../src/game/result/scene';
import { dialogButtons, RESUME_H, ABANDON_H, versionButton } from '../src/game/result/resume';
import { SELECT_LAYOUT } from '../src/game/select/layout';
import { MAP_CONFIG } from '../src/data/map';
import { p4env, surface } from './p4-helpers';

const frame = { width: 390, height: 844 };
/** 命中框四角（各往里 0.5）都算命中，且宽高 ≥ 44 */
function check(name: string, r: Rect) {
  const b = hitBox(r);
  expect(b.w, `${name} 宽`).toBeGreaterThanOrEqual(MIN_HIT);
  expect(b.h, `${name} 高`).toBeGreaterThanOrEqual(MIN_HIT);
  for (const [x, y] of [
    [b.x + 0.5, b.y + 0.5],
    [b.x + b.w - 0.5, b.y + b.h - 0.5],
  ])
    expect(hitInside(r, { x, y }), `${name} 角点`).toBe(true);
}
function pageButtons(): Record<string, Rect[]> {
  const out: Record<string, Rect[]> = {};
  const r = p4env({ potions: 2 });
  const reward = new RewardScene(r.env);
  reward.enter(r.ctx, { kind: 'boss' });
  out.reward = [...reward.buttons().map((b) => b.rect), ...reward.st.offer.cards.map((_, i) => reward.cardRect(i)), reward.relicBar()];
  const sh = p4env({ gold: 300 });
  const shop = new ShopScene(sh.env);
  shop.enter(sh.ctx, undefined);
  out.shop = shop.buttons().map((b) => b.rect);
  const ch = p4env();
  const chest = new ChestScene(ch.env);
  chest.enter(ch.ctx, undefined);
  out.chest = chest.buttons().map((b) => b.rect);
  const rs = p4env();
  const st = { hp: 3, maxHp: 8 };
  const rest = new RestScene({ ...rs.env, run: () => ({ head: () => st, save() {}, restConfig: MAP_CONFIG.rest }) });
  rest.enter(rs.ctx, { kind: 'rest', layer: 3, fixed: false });
  out.rest = [...rest.buttons().map((b) => b.rect), ...RestScene.ACTIONS.map((_, i) => rest.optRect(i))];
  const bt = new BattleScene({ now: testNow, overlays: new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} }), debugDefaults: true });
  bt.enter({ width: 390, height: 844, invalidate() {} }, { seed: 7 });
  const L = bt.layout() as unknown as Record<string, unknown>;
  out.battle = [L.endTurn as Rect];
  out.result = [RESULT_LAYOUT.back, RESULT_LAYOUT.again, RESULT_LAYOUT.copy, RESULT_LAYOUT.stats, RESULT_LAYOUT.soul];
  const d1 = dialogButtons(frame, RESUME_H);
  const d2 = dialogButtons(frame, ABANDON_H);
  out.dialogs = [d1.left, d1.right, d2.left, d2.right, versionButton(frame)];
  out.select = Object.values(SELECT_LAYOUT).filter((v): v is Rect => !!v && typeof v === 'object' && 'w' in v && 'h' in v);
  return out;
}

afterEach(() => {
  hitDebug.on = false;
  hitDebug.rects.clear();
});

describe('#118 命中框 ≥ 44', () => {
  it('hitBox：小于 44 的居中补足，视觉矩形不变；大于 44 的不缩', () => {
    const r = { x: 100, y: 100, w: 28, h: 28 };
    expect(hitBox(r)).toEqual({ x: 92, y: 92, w: 44, h: 44 });
    expect(r).toEqual({ x: 100, y: 100, w: 28, h: 28 });
    expect(hitBox({ x: 0, y: 0, w: 120, h: 40 })).toEqual({ x: 0, y: -2, w: 120, h: 44 });
    expect(hitInside(r, { x: 93, y: 93 })).toBe(true);
    expect(hitInside(r, { x: 91, y: 91 })).toBe(false);
  });
  it('枚举各页面按钮：宽高都 ≥ 44，命中框四角可点', () => {
    const all = pageButtons();
    for (const [page, rects] of Object.entries(all)) {
      expect(rects.length, page).toBeGreaterThan(0);
      rects.forEach((r, i) => check(`${page}#${i}`, r));
    }
  });
  it('绘制时登记的所有可点区域（debug=hit 用）宽高都 ≥ 44', () => {
    hitDebug.on = true;
    for (const mk of [
      () => {
        const t = p4env();
        const s = new RewardScene(t.env);
        s.enter(t.ctx, { kind: 'normal' });
        s.update(5000);
        for (const l of ['bg', 'main'] as const) s.draw(l, surface());
      },
      () => {
        const t = p4env({ gold: 300 });
        const s = new ShopScene(t.env);
        s.enter(t.ctx, undefined);
        for (const l of ['bg', 'main'] as const) s.draw(l, surface());
      },
    ])
      mk();
    expect(hitDebug.rects.size).toBeGreaterThan(0);
    for (const r of hitDebug.rects.values()) expect(Math.min(r.w, r.h)).toBeGreaterThanOrEqual(MIN_HIT);
    markHit({ x: 0, y: 0, w: 10, h: 10 });
    expect(hitDebug.rects.get('-17,-17,44,44')).toBeTruthy();
  });
  it('奖励页选项牌（翻开后）和宝物条登记了描边', () => {
    hitDebug.on = true;
    const t = p4env();
    const s = new RewardScene(t.env);
    s.enter(t.ctx, { kind: 'boss' });
    s.update(5000);
    for (const l of ['bg', 'main'] as const) s.draw(l, surface());
    const key = (r: Rect) => {
      const b = hitBox(r);
      return `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`;
    };
    expect(s.st.offer.cards.length).toBe(3);
    s.st.offer.cards.forEach((_, i) => expect(hitDebug.rects.has(key(s.cardRect(i))), `card#${i}`).toBe(true));
    expect(hitDebug.rects.has(key(s.relicBar()))).toBe(true);
  });
  it('调试开关默认关闭：不登记', () => {
    markHit({ x: 0, y: 0, w: 10, h: 10 });
    expect(hitDebug.rects.size).toBe(0);
  });
});
