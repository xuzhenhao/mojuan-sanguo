import { describe, expect, it } from 'vitest';
import { GestureRecognizer, type GestureEvent } from '../src/engine/input';
import { MainLoop } from '../src/engine/loop';

const rec = () => {
  const ev: GestureEvent[] = [];
  return { ev, g: new GestureRecognizer((e) => ev.push(e)), types: () => ev.filter((e) => e.type !== 'longpressprogress').map((e) => e.type) };
};

describe('手势', () => {
  it('移动 ≤8dp 抬起为点按', () => {
    const r = rec();
    r.g.down([{ id: 1, x: 0, y: 0 }], 0);
    r.g.move([{ id: 1, x: 5, y: 5 }]);
    r.g.up([{ id: 1, x: 5, y: 5 }], 100);
    expect(r.types()).toEqual(['tap']);
  });
  it('移动 >8dp 进入拖拽', () => {
    const r = rec();
    r.g.down([{ id: 1, x: 0, y: 0 }], 0);
    r.g.move([{ id: 1, x: 0, y: -9 }]);
    r.g.move([{ id: 1, x: 0, y: -40 }]);
    r.g.up([{ id: 1, x: 0, y: -40 }], 200);
    expect(r.types()).toEqual(['dragstart', 'dragmove', 'dragend']);
  });
  it('按住 420ms 为长按，之后不触发点按', () => {
    const r = rec();
    r.g.down([{ id: 1, x: 0, y: 0 }], 0);
    expect(r.g.tick(200)).toBe(true);
    expect(r.g.tick(420)).toBe(false);
    r.g.up([{ id: 1, x: 0, y: 0 }], 500);
    expect(r.types()).toEqual(['longpress']);
    expect(r.ev.find((e) => e.type === 'longpressprogress')).toMatchObject({ progress: 200 / 420 });
  });
  it('只认第一指', () => {
    const r = rec();
    r.g.down([{ id: 1, x: 0, y: 0 }], 0);
    r.g.down([{ id: 2, x: 50, y: 50 }], 10);
    r.g.up([{ id: 2, x: 50, y: 50 }], 20);
    expect(r.types()).toEqual([]);
    r.g.up([{ id: 1, x: 0, y: 0 }], 30);
    expect(r.types()).toEqual(['tap']);
  });
});

describe('主循环', () => {
  it('合并重复唤醒；无需出帧时停止；dt 封顶 100ms', () => {
    const q: ((t: number) => void)[] = [];
    const dts: number[] = [];
    let busy = 2;
    const loop = new MainLoop(
      { raf: (cb) => q.push(cb) },
      (dt) => dts.push(dt),
      () => busy-- > 0,
    );
    loop.invalidate();
    loop.invalidate();
    expect(q).toHaveLength(1);
    q.shift()!(0);
    q.shift()!(16);
    q.shift()!(500);
    expect(q).toHaveLength(0);
    expect(dts).toEqual([0, 16, 100]);
  });
});
