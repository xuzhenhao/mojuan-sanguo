import { beforeEach, describe, expect, it } from 'vitest';
import { createMapScene, loadMapSave, mapSession, resetMapSession } from '../src/game/map';
import { setRunSaveStore } from '../src/core/run/save';
import { RUN_STATE_KEY } from '../src/game/run/state';
import { CONFIG } from '../src/data/config';
import { OverlayStack } from '../src/engine/modal';
import { BattleScene } from '../src/game/scenes/battle/scene';
import type { Engine } from '../src/engine/engine';

const mem = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
};
const fakeEngine = (q: Record<string, string> = {}) =>
  ({
    platform: { launchQuery: () => q, now: () => 1, createOffscreen: () => ({}) },
    overlays: new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} }),
    bakeScale: 1,
  }) as unknown as Engine;
const LB = { main: 'H01', sub: 'H08' }; // 吕布 + 陆逊
const hp = (id: string) => CONFIG.heroes[id].hp;

let store: ReturnType<typeof mem>;
beforeEach(() => {
  store = mem();
  setRunSaveStore(store);
  resetMapSession();
});

describe('点将结果传到地图（线上 P0：吕布+陆逊 显示成赵云+刘备）', () => {
  it('新局：存档头与 HUD 是吕布+陆逊，体力取吕布上限', () => {
    const scene = createMapScene(
      fakeEngine(),
      () => {},
      undefined,
      () => 11,
      () => LB,
    );
    const s = loadMapSave()!;
    expect([s.heroMain, s.heroSub, s.runSeed]).toEqual(['H01', 'H08', 11]); // 首次进地图即落盘
    const head = mapSession(fakeEngine(), 1, 11).head();
    expect([head.heroMain, head.heroSub]).toEqual(['H01', 'H08']);
    expect([head.hp, head.maxHp]).toEqual([hp('H01'), hp('H01')]);
    const hud = (scene as unknown as { d: { hud(): { hero: string; maxHp: number } } }).d.hud();
    expect(hud.hero).toBe('吕布');
    expect(hud.maxHp).toBe(hp('H01'));
  });
  it('同 seed 已有默认武将（赵云+刘备）旧存档：进地图改写为吕布+陆逊，刷新后（无点将参数）仍是吕布+陆逊', () => {
    // 先按旧逻辑写一份默认武将存档
    mapSession(fakeEngine(), 1, 22).save({ hp: 8, maxHp: 8 });
    expect(loadMapSave()!.heroMain).toBe(CONFIG.rules.defaultHeroes.main);
    resetMapSession();
    createMapScene(
      fakeEngine(),
      () => {},
      undefined,
      () => 22,
      () => LB,
    );
    let s = loadMapSave()!;
    expect([s.heroMain, s.heroSub, s.maxHp, s.hp]).toEqual(['H01', 'H08', hp('H01'), hp('H01')]);
    // 刷新：内存会话没了、run.params 为空，地图从存档 seed 续上
    resetMapSession();
    const scene = createMapScene(
      fakeEngine(),
      () => {},
      undefined,
      () => undefined,
      () => null,
    );
    s = loadMapSave()!;
    expect([s.heroMain, s.heroSub]).toEqual(['H01', 'H08']);
    expect((scene as unknown as { d: { hud(): { hero: string } } }).d.hud().hero).toBe('吕布');
    expect(JSON.parse(store.m.get(RUN_STATE_KEY)!).runSeed).toBe(22);
  });
  it('同 seed 复用内存会话（再来一局换武将）也改写；未满血时体力不超过新上限', () => {
    const a = mapSession(fakeEngine(), 1, 33, { main: 'H03', sub: 'H04' });
    a.save({ hp: 3 });
    mapSession(fakeEngine(), 1, 33, LB);
    const s = loadMapSave()!;
    expect([s.heroMain, s.heroSub, s.hp, s.maxHp]).toEqual(['H01', 'H08', 3, hp('H01')]);
  });
  it('战斗页：地图 params 不带主副将时用本局点将结果', () => {
    const b = new BattleScene({ heroes: () => LB });
    b.enter({ invalidate() {}, width: 390, height: 844 }, { seed: 1 });
    const g = (b as unknown as { g: { main: { id: string }; sub: { id: string } } }).g;
    expect([g.main.id, g.sub.id]).toEqual(['H01', 'H08']);
  });
});
