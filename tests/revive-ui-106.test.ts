import { describe, expect, it } from 'vitest';
import { OverlayStack } from '../src/engine/modal';
import { openRevive, reviveCountText, reviveLayout, REVIVE_ID } from '../src/game/overlays/revive';
import { BattleScene, intentIcon } from '../src/game/scenes/battle/scene';

const SAFE = { x: 0, y: 0, w: 390, h: 844 };
const mkOv = () => new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
const tap = (x: number, y: number) => ({ type: 'tap', at: { x, y } }) as never;
const mid = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;

describe('#106 复活层「将星未陨」', () => {
  it('布局：对话框左右 30、高 440 居中；两个按钮 ≥44 高且在框内', () => {
    const L = reviveLayout(SAFE);
    expect([L.dlg.x, L.dlg.w, L.dlg.h]).toEqual([30, 330, 440]);
    for (const b of [L.giveUp, L.revive]) {
      expect(b.h).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(L.dlg.x);
      expect(b.x + b.w).toBeLessThanOrEqual(L.dlg.x + L.dlg.w);
      expect(b.y + b.h).toBeLessThanOrEqual(L.dlg.y + L.dlg.h);
    }
    expect(L.giveUp.x).toBeLessThan(L.revive.x); // 放弃在左、复活在右
  });
  it('点遮罩不关闭；点「复活」→ true，点「放弃」→ false', async () => {
    const L = reviveLayout(SAFE);
    for (const [btn, want] of [
      [L.revive, true],
      [L.giveUp, false],
    ] as const) {
      const ov = mkOv();
      const p = openRevive(ov, { hero: '赵云', hp: 2, armor: 3, perRun: 1, enemies: 3 }, () => SAFE);
      ov.gesture(tap(5, 5));
      expect(ov.ids()).toEqual([REVIVE_ID]);
      ov.gesture(tap(...mid(btn)));
      expect(await p).toBe(want);
      expect(ov.size).toBe(0);
    }
  });
  it('战斗页：体力归 0 时弹出复活层，选复活后继续战斗', async () => {
    const ov = mkOv();
    const sc = new BattleScene({ overlays: ov, debugDefaults: true });
    sc.enter({ width: 390, height: 844, invalidate() {} } as never, { seed: 7 });
    const g = sc.g;
    expect(g.reviveLeft).toBe(1);
    g.hand = [];
    g.p.hp = 1;
    g.p.armor = 0;
    const done = g.dmgPlayer(5);
    for (let i = 0; i < 200 && !ov.ids().includes(REVIVE_ID); i++) {
      sc.update(50);
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(ov.ids()).toContain(REVIVE_ID);
    ov.gesture(tap(...mid(reviveLayout(SAFE).revive)));
    let fin = false;
    void done.then(() => (fin = true));
    for (let i = 0; i < 200 && !fin; i++) {
      sc.update(50);
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(g.over).toBe(false);
    expect(g.p.hp).toBe(2);
    expect(g.reviveLeft).toBe(0);
  });
  it('文案：「本局剩余 N 次」；只出闪的意图图标是「闪」（闪标记，不是盾）', () => {
    expect(reviveCountText(1)).toBe('本局剩余 1 次');
    expect(intentIcon(0, true)).toBe('闪');
    expect(intentIcon(2, false)).toBe('⚔');
  });
});
