/** #105 UI 复核：替换目标删除线 2px、T.cinnHi、不透明度 1 */
import { describe, expect, it } from 'vitest';
import { REPLACE_STRIKE, drawReplaceStrike } from '../src/game/overlays/epiphany';
import { T } from '../src/game/scenes/p4-kit';
import type { Ctx2DLike } from '../src/engine/types';

describe('epiphany replace strikethrough', () => {
  it('spec values', () => {
    expect(REPLACE_STRIKE).toEqual({ width: 2, color: T.cinnHi, alpha: 1 });
  });
  it('draws 2px cinnHi at full opacity and restores alpha', () => {
    const calls: { a: number; fill: unknown; rect: number[] }[] = [];
    const st = { globalAlpha: 0.3, fillStyle: '' as unknown };
    const c = Object.assign(st, {
      fillRect(x: number, y: number, w: number, h: number) {
        calls.push({ a: st.globalAlpha, fill: st.fillStyle, rect: [x, y, w, h] });
      },
    }) as unknown as Ctx2DLike;
    drawReplaceStrike(c, 100, 40, 50);
    expect(calls).toEqual([{ a: 1, fill: T.cinnHi, rect: [98, 49, 44, 2] }]);
    expect(c.globalAlpha).toBe(0.3);
  });
});
