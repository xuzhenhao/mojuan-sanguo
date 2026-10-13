import { describe, expect, it } from 'vitest';
import { mkGame } from './helpers';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { fxProgress, REVIVE_INK_MS, REVIVE_INTENT_MS, reviveFxDone, reviveFxFrame, type ReviveFx } from '../src/game/scenes/battle/revive-fx';

const mkFx = (cancelled: number[]): ReviveFx => ({
  start: 1000,
  prev: new Map([
    [1, { acts: ['杀'], dmg: 1 }],
    [2, { acts: ['杀'], dmg: 1 }],
  ]),
  cancelled: new Set(cancelled),
});

describe('#106 复活动画（PRD 4.4.1）', () => {
  it('时长：化墨 300ms、意图交叉淡入 250ms', () => {
    expect([REVIVE_INK_MS, REVIVE_INTENT_MS]).toEqual([300, 250]);
    expect(fxProgress(125, 250, false)).toBe(0.5);
    expect(fxProgress(-5, 250, false)).toBe(0);
    expect(fxProgress(999, 250, false)).toBe(1);
  });
  it('被取消的敌人：旧意图随化墨 300ms 淡出，新闪意图 250ms 淡入', () => {
    const fx = mkFx([1]);
    expect(reviveFxFrame(fx, 1, 1150, false)).toEqual({ newAlpha: 0.6, oldAlpha: 0.5, ink: 0.5 });
    expect(reviveFxFrame(fx, 1, 1300, false)).toEqual({ newAlpha: 1, oldAlpha: 0, ink: 1 });
    // 未被取消（玩家回合复活）：纯交叉淡入，不化墨
    expect(reviveFxFrame(fx, 2, 1125, false)).toEqual({ newAlpha: 0.5, oldAlpha: 0.5, ink: 0 });
    expect(reviveFxDone(fx, 1299, false)).toBe(false);
    expect(reviveFxDone(fx, 1300, false)).toBe(true);
  });
  it('prefers-reduced-motion：立即切换', () => {
    const fx = mkFx([1]);
    expect(reviveFxFrame(fx, 1, 1000, true)).toEqual({ newAlpha: 1, oldAlpha: 0, ink: 1 });
    expect(reviveFxFrame(fx, 2, 1000, true)).toEqual({ newAlpha: 1, oldAlpha: 0, ink: 0 });
    expect(reviveFxDone(fx, 1000, true)).toBe(true);
  });
  it('core：复活时把复活前意图与被取消敌人交给表现层', async () => {
    const evs: { prev: Map<number, { acts: string[]; dmg: number }>; cancelled: number[] }[] = [];
    const { g } = mkGame({ revive: async () => true, revived: (ev) => evs.push(ev) });
    g.startBattle();
    g.reviveLeft = 1;
    g.en = [g.spawnEnemy('E101'), g.spawnEnemy('E101')];
    for (const e of g.en) {
      e.pat = [['杀', '杀']];
      e.step = 0;
    }
    g.hand = [];
    g.p.hp = 1;
    g.p.armor = 0;
    await g.enemyTurn();
    expect(evs).toHaveLength(1);
    expect(evs[0].cancelled.sort()).toEqual(g.en.map((e) => e.uid).sort());
    for (const e of g.en) expect(evs[0].prev.get(e.uid)!.acts).toEqual(['杀', '杀']);
  });
  it('战斗页：复活后动画期间 animating()，结束或减少动态时不再占帧', () => {
    let t = 0;
    let reduced = false;
    const sc = new BattleScene({ now: () => t, reducedMotion: () => reduced });
    sc.enter({ width: 390, height: 844, invalidate() {} } as never, { seed: 7 });
    const uid = sc.g.alive()[0].uid;
    sc.reviveFx = { start: 0, prev: new Map([[uid, { acts: ['杀'], dmg: 1 }]]), cancelled: new Set([uid]) };
    t = 100;
    expect(sc.reviveFxActive()).toBe(true);
    t = 300;
    expect(sc.reviveFxActive()).toBe(false);
    sc.reviveFx = { start: 300, prev: new Map(), cancelled: new Set() };
    reduced = true;
    expect(sc.reviveFxActive()).toBe(false);
  });
});
