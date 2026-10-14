import { fakeClock } from './helpers';
import { describe, expect, it } from 'vitest';
import { BATTLE_PAUSE } from '../src/data/config';
import { t } from '../src/data/text';
import { OverlayStack } from '../src/engine/modal';
import type { Surface } from '../src/engine/surfaces';
import { pauseLayout } from '../src/game/result/pause';
import { defaultSettings, type Settings } from '../src/game/prefs/settings';
import {
  abandonConfirmLayout,
  BATTLE_ABANDON_ID,
  drawAbandonConfirm,
  BATTLE_PAUSE_ID,
  battlePauseFlow,
  battlePauseLayout,
  drawBattlePause,
  pauseIconLayout,
} from '../src/game/scenes/battle/pause-menu';
import { BattleScene } from '../src/game/scenes/battle/scene';

const f = { width: 390, height: 844 };
type R = { x: number; y: number; w: number; h: number };
const mid = (r: R) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
function mk() {
  const log: string[] = [];
  const ov = new OverlayStack({ invalidate() {}, pauseScene: () => void log.push('pause'), resumeScene: () => void log.push('resume') });
  let s: Settings = defaultSettings();
  const deps = { load: () => s, save: (n: Settings) => void (s = n) };
  return { ov, log, deps };
}
const tap = (ov: OverlayStack, r: R) => ov.gesture({ type: 'tap', at: mid(r) });
const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe('#196 战斗内暂停面板', () => {
  it('三按钮热区 ≥ 44、面板居中；布局参数来自 rules.battlePause', () => {
    const L = battlePauseLayout(f);
    for (const r of [L.continue, L.settings, L.abandon]) {
      expect(r.w).toBeGreaterThanOrEqual(44);
      expect(r.h).toBeGreaterThanOrEqual(44);
      expect(r.x).toBeGreaterThanOrEqual(L.panel.x);
      expect(r.y + r.h).toBeLessThanOrEqual(L.panel.y + L.panel.h);
    }
    expect(L.panel.w).toBe(BATTLE_PAUSE.panel.w);
    expect(L.panel.x * 2 + L.panel.w).toBe(390);
    expect(L.settings.y - L.continue.y).toBe(BATTLE_PAUSE.button.h + BATTLE_PAUSE.button.gap);
    expect(pauseIconLayout(390, 40).hit.w).toBeGreaterThanOrEqual(44);
  });
  it('文案走文本表 battle.*', () => {
    const texts: string[] = [];
    const c = { fillStyle: '', font: '', globalAlpha: 1, fillRect() {}, fillText: (s: string) => texts.push(s) };
    drawBattlePause(c as never, f);
    expect(texts).toEqual([t('battle.pause_title'), t('battle.pause_continue'), t('battle.pause_settings'), t('battle.pause_abandon')]);
    expect(texts).toEqual(['暂停', '继续', '设置', '放弃本局']);
  });
  it('继续 → continue；点外部不关闭；弹出期间场景暂停', async () => {
    const { ov, log, deps } = mk();
    const p = battlePauseFlow(ov, f, deps);
    expect(ov.ids()).toEqual([BATTLE_PAUSE_ID]);
    expect(log).toContain('pause');
    ov.gesture({ type: 'tap', at: { x: 5, y: 5 } });
    await flush();
    expect(ov.ids()).toEqual([BATTLE_PAUSE_ID]);
    tap(ov, battlePauseLayout(f).continue);
    expect(await p).toBe('continue');
    expect(ov.size).toBe(0);
  });
  it('设置 → 打开 #108 设置浮层，改设置落盘，继续回战斗', async () => {
    const { ov, deps } = mk();
    const p = battlePauseFlow(ov, f, deps);
    tap(ov, battlePauseLayout(f).settings);
    await flush();
    expect(ov.ids()).toEqual(['pause']);
    const L = pauseLayout(f);
    const before = deps.load().toggles[L.rows[0].key];
    tap(ov, L.rows[0].rect);
    expect(deps.load().toggles[L.rows[0].key]).toBe(!before);
    tap(ov, L.resume);
    expect(await p).toBe('continue');
  });
  it('放弃本局 → 弹二次确认，不直接结算；取消回到暂停面板，放弃 → abandon', async () => {
    const { ov, deps } = mk();
    let done: string | null = null;
    const p = battlePauseFlow(ov, f, deps).then((r) => (done = r));
    tap(ov, battlePauseLayout(f).abandon);
    await flush();
    expect(ov.ids()).toEqual([BATTLE_ABANDON_ID]);
    expect(done).toBeNull(); // 点放弃不直接结算
    // 点外部不关闭
    ov.gesture({ type: 'tap', at: { x: 5, y: 5 } });
    await flush();
    expect(ov.ids()).toEqual([BATTLE_ABANDON_ID]);
    const C = abandonConfirmLayout(f);
    for (const r of [C.cancel, C.ok]) {
      expect(r.w).toBeGreaterThanOrEqual(44);
      expect(r.h).toBeGreaterThanOrEqual(44);
    }
    expect(C.cancel.x + C.cancel.w).toBeLessThanOrEqual(C.ok.x);
    tap(ov, C.cancel);
    await flush();
    expect(done).toBeNull();
    expect(ov.ids()).toEqual([BATTLE_PAUSE_ID]);
    tap(ov, battlePauseLayout(f).abandon);
    await flush();
    tap(ov, C.ok);
    await p;
    expect(done).toBe('abandon');
    expect(ov.size).toBe(0);
  });
  it('二次确认文案走文本表：确定放弃？本局进度将清空 + 取消 / 放弃', () => {
    const texts: string[] = [];
    const c = { fillStyle: '', font: '', globalAlpha: 1, fillRect() {}, fillText: (s: string) => texts.push(s) };
    drawAbandonConfirm(c as never, f);
    expect(texts).toEqual(['放弃本局', '确定放弃？本局进度将清空', '取消', '放弃']);
    expect(t('battle.abandon_confirm_body')).toBe('确定放弃？本局进度将清空');
  });
});

describe('#196 战斗页暂停钮', () => {
  function scene(onPause?: () => void) {
    const overlays = new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
    const sc = new BattleScene({ now: fakeClock().now, overlays, onPause, debugDefaults: true });
    sc.enter({ width: 390, height: 844, invalidate() {} }, { seed: 7 });
    return sc;
  }
  it('接了 onPause：画暂停钮，点按回调；不接则无热区', () => {
    let n = 0;
    const sc = scene(() => n++);
    const hit = sc.pauseHit()!;
    expect(hit.w).toBeGreaterThanOrEqual(44);
    expect(hit.x + hit.w).toBeLessThanOrEqual(390);
    sc.gesture({ type: 'tap', at: mid(hit) });
    expect(n).toBe(1);
    expect(scene().pauseHit()).toBeNull();
  });
  it('暂停钮视觉直径 34、热区 44×44；回合文字右缘与热区留 textGap 不重叠', () => {
    const fills: { s: string; x: number }[] = [];
    const ctx = {
      globalAlpha: 1,
      fillStyle: '',
      font: '',
      setTransform() {},
      clearRect() {},
      fillRect() {},
      drawImage() {},
      fillText: (s: string, x: number) => fills.push({ s, x }),
    };
    const sc = scene(() => {});
    sc.draw('main', { name: 'main', canvas: {} as never, ctx, scale: 1, dirty: true } as unknown as Surface);
    const hit = sc.pauseHit()!;
    expect(BATTLE_PAUSE.pauseBtn.r * 2).toBe(34);
    expect(hit.w).toBe(44);
    expect(hit.h).toBe(44);
    expect(hit.x + hit.w).toBeLessThanOrEqual(390);
    expect(hit.y).toBeGreaterThanOrEqual(0);
    const right = fills.find((x) => x.s.includes('回合'))!; // 右对齐：x 即文字右缘
    expect(right.x).toBe(hit.x - BATTLE_PAUSE.pauseBtn.textGap);
    expect(right.x).toBeLessThan(hit.x);
  });
});
