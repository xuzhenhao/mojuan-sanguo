import { fakeClock } from './helpers';
import { describe, expect, it } from 'vitest';
import { BATTLE_ENEMY_PLAY } from '../src/data/config';
import { t } from '../src/data/text';
import { drawEnemyPlayCard, enemyPlayCardRect, enemyPlayInfo } from '../src/game/scenes/battle/enemy-play-card';
import { BattleScene } from '../src/game/scenes/battle/scene';

describe('#157 敌方出牌牌面', () => {
  it('布局尺寸来自 rules.battleEnemyPlay', () => {
    const r = enemyPlayCardRect(390, 0);
    expect(r.w).toBe(BATTLE_ENEMY_PLAY.w);
    expect(r.h).toBe(BATTLE_ENEMY_PLAY.h);
    expect(r.x).toBeCloseTo(390 * BATTLE_ENEMY_PLAY.cx - BATTLE_ENEMY_PLAY.w / 2);
    expect(r.y).toBe(BATTLE_ENEMY_PLAY.top);
  });

  it('意图 acts 收成牌面信息：杀×2 总伤 2；闪为防御', () => {
    expect(enemyPlayInfo(['杀', '杀'], 2)).toEqual({
      name: '杀',
      count: '×2',
      dmg: 2,
      defOnly: false,
      tint: expect.any(String),
    });
    const flash = enemyPlayInfo(['闪'], 0);
    expect(flash.defOnly).toBe(true);
    expect(flash.name).toBe('闪');
  });

  it('文案走文本表 battle.enemy_play_label', () => {
    const texts: string[] = [];
    const c = {
      fillStyle: '',
      font: '',
      globalAlpha: 1,
      fillRect() {},
      fillText: (s: string) => texts.push(s),
    };
    drawEnemyPlayCard(c as never, { x: 0, y: 0, w: 88, h: 120 }, enemyPlayInfo(['杀'], 1));
    expect(texts).toContain(t('battle.enemy_play_label'));
    expect(t('battle.enemy_play_label')).toBe('敌方出牌');
  });

  it('出手时 enemy_act 期间牌面可见，尺寸来自 config', () => {
    const { now } = fakeClock();
    const sc = new BattleScene({ now });
    sc.enter({ width: 390, height: 844, invalidate() {} } as never, { seed: 7 });
    const e = sc.g.alive()[0];
    e.pat = [['杀']];
    e.step = 0;
    void sc.q.push('enemy_act', 350, true, { uid: e.uid });
    const st = sc.enemyPlayState();
    expect(st).not.toBeNull();
    expect(st!.uid).toBe(e.uid);
    expect(st!.dmg).toBe(1);
    expect(st!.ink).toBe(0);
    const r = sc.enemyPlayRect();
    expect(r.w).toBe(BATTLE_ENEMY_PLAY.w);
    expect(r.h).toBe(BATTLE_ENEMY_PLAY.h);
  });

  it('复活取消时牌面进入化墨，意图交叉淡入仍可读', () => {
    let t0 = 1000;
    const sc = new BattleScene({ now: () => t0, reducedMotion: () => false });
    sc.enter({ width: 390, height: 844, invalidate() {} } as never, { seed: 7 });
    const uid = sc.g.alive()[0].uid;
    sc.reviveFx = {
      start: 1000,
      prev: new Map([[uid, { acts: ['杀', '杀'], dmg: 2 }]]),
      cancelled: new Set([uid]),
    };
    t0 = 1150; // 化墨 150/300
    const st = sc.enemyPlayState();
    expect(st).not.toBeNull();
    expect(st!.ink).toBeCloseTo(0.5);
    expect(st!.alpha).toBeCloseTo(0.5);
    expect(st!.acts).toEqual(['杀', '杀']);
    expect(st!.dmg).toBe(2);
  });

  it('无 enemy_act / 无作废时不显示牌面', () => {
    const sc = new BattleScene({ now: fakeClock().now });
    sc.enter({ width: 390, height: 844, invalidate() {} } as never, { seed: 7 });
    expect(sc.enemyPlayState()).toBeNull();
  });
});
