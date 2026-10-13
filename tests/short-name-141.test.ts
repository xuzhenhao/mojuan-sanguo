import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/data/cards';
import { cardDetail } from '../src/game/overlays/detail';
import { fitName, handName } from '../src/game/scenes/battle/hpview';
import { BattleScene } from '../src/game/scenes/battle/scene';

const cjk = (t: string, px: number) => [...t].reduce((w, ch) => w + (ch === '·' ? px * 0.55 : px), 0);

describe('#141 牌名简称 shortName', () => {
  it('X101 配置了 shortName「破阵」，全名不变', () => {
    expect(CARDS.X101.name).toBe('方天戟·破阵');
    expect(CARDS.X101.shortName).toBe('破阵');
  });
  it('手牌显示简称；没配简称的牌用全名', () => {
    expect(handName(CARDS.X101)).toBe('破阵');
    const plain = Object.values(CARDS).find((d) => !d.shortName)!;
    expect(handName(plain)).toBe(plain.name);
  });
  it('详情浮层仍是全名', () => {
    expect(cardDetail({ uid: 1, id: 'X101', suit: 'S', rank: 7, mods: [] } as never).title).toBe('方天戟·破阵');
  });
  it('字号按显示名分档：「破阵」2 字 → 20', () => {
    expect(fitName(handName(CARDS.X101), 76, cjk).px).toBe(20);
  });
  it('场景：X101 手牌绘制的是「破阵」，不是全名', () => {
    const sc = new BattleScene({ debugDefaults: true, now: () => 0 });
    sc.enter({ width: 390, height: 844, invalidate() {} } as never, { seed: 7 });
    const texts: string[] = [];
    const ctx = {
      globalAlpha: 1,
      fillStyle: '' as unknown,
      font: '',
      setTransform() {},
      clearRect() {},
      drawImage() {},
      fillRect() {},
      fillText: (s: string) => texts.push(s),
      measureText: (s: string) => ({ width: s.length * 10 }),
    };
    const card = { uid: 999, id: 'X101', suit: 'S', rank: 7, mods: [] };
    sc.drawCard(ctx as never, card as never, { x: 0, y: 0, w: 76, h: 110 }, 'normal' as never);
    expect(texts).toContain('破阵');
    expect(texts).not.toContain('方天戟·破阵');
  });
});
