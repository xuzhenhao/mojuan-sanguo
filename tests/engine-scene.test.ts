import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import type { GestureEvent } from '../src/engine/input';
import { AtlasManager, BakeCache, MB, TextureBudget } from '../src/engine/memory';
import { OverlayStack } from '../src/engine/modal';
import { CUT, INK_TRANSITION, SceneManager, type Scene } from '../src/engine/scene';
import { fakePlatform } from './engine-fakes';

const scene = (id: string, log: string[], extra: Partial<Scene> = {}): Scene => ({
  id,
  enter: () => log.push(`+${id}`),
  exit: () => log.push(`-${id}`),
  pause: () => log.push(`p${id}`),
  resume: () => log.push(`r${id}`),
  draw: () => {},
  ...extra,
});
const ctx = { width: 390, height: 844, invalidate() {} };
const tap = (x = 1, y = 1): GestureEvent => ({ type: 'tap', at: { x, y } });

describe('SceneManager', () => {
  it('生命周期：exit 旧 → enter 新；pause/resume', async () => {
    const log: string[] = [];
    const m = new SceneManager(ctx, {});
    m.register('a', () => scene('a', log)).register('b', () => scene('b', log));
    await m.go('a');
    await m.go('b');
    m.pause();
    m.pause();
    m.resume();
    expect(log).toEqual(['+a', '-a', '+b', 'pb', 'rb']);
    expect(() => m.go('zzz')).toThrow(/未注册/);
  });
  it('场景切换联动图集加载/释放与烘焙缓存清理', async () => {
    const b = new TextureBudget(50 * MB, 45 * MB);
    const atlases = new AtlasManager(b);
    const bakes = new BakeCache(b);
    const m = new SceneManager(ctx, { atlases, bakes });
    const log: string[] = [];
    m.register('select', () => scene('select', log)).register('battle', () => scene('battle', log));
    await m.go('select');
    expect(atlases.isLoaded('generals_select')).toBe(true);
    bakes.get('card1', 'bigcard', 'select', 156, 225, () => 0);
    await m.go('battle');
    expect(atlases.isLoaded('generals_select')).toBe(false);
    expect(atlases.isLoaded('enemies_ch1')).toBe(true);
    expect(bakes.size).toBe(0);
  });
  it('转场：中点交换场景，期间屏蔽输入；WebGL 开启时产出泼墨特效，关闭时没有', () => {
    for (const gl of [true, false]) {
      const log: string[] = [];
      const m = new SceneManager(ctx, {}, () => gl);
      const taps: string[] = [];
      m.register('a', () => scene('a', log, { gesture: () => (taps.push('a'), true) })).register('b', () => scene('b', log));
      void m.go('a', undefined, CUT);
      let done = false;
      void m.go('b', undefined, INK_TRANSITION).then(() => (done = true));
      m.update(100);
      expect(m.current!.id).toBe('a');
      expect(m.gesture(tap())).toBe(false);
      expect(m.transitionFx?.id ?? null).toBe(gl ? 'ink_transition' : null);
      m.update(150);
      expect(m.current!.id).toBe('b');
      m.update(250);
      expect(m.transitioning).toBe(false);
      expect(m.transitionFx).toBeNull();
      expect(taps).toEqual([]);
      return Promise.resolve().then(() => expect(done).toBe(true));
    }
  });
});

describe('OverlayStack', () => {
  const mk = () => {
    const ev: string[] = [];
    return { ev, s: new OverlayStack({ invalidate: () => {}, pauseScene: () => ev.push('pause'), resumeScene: () => ev.push('resume') }) };
  };
  it('栈顶优先；模态层吞掉输入；toast 不吞', () => {
    const { s } = mk();
    s.push({ id: 't', kind: 'toast', draw() {} });
    expect(s.gesture(tap())).toBe(false);
    s.push({ id: 'p', kind: 'popup', draw() {} });
    expect(s.gesture(tap())).toBe(true);
    expect(s.ids()).toEqual(['p', 't']);
  });
  it('详情浮层点外部关闭；响应窗口不能点外部关闭，结果经 Promise 返回', async () => {
    const { s } = mk();
    const r = s.push<string>({
      id: 'resp',
      kind: 'response',
      draw() {},
      gesture: (e, h) => {
        if (e.type === 'tap' && e.at.x > 300) h.close('shan');
        return true;
      },
    });
    const d = s.push({ id: 'd', kind: 'detail', dismissOnTapOutside: true, rect: { x: 0, y: 0, w: 100, h: 100 }, draw() {} });
    s.gesture(tap(200, 200)); // 点详情外部 → 关详情
    expect(s.ids()).toEqual(['resp']);
    expect(await d.result).toBeUndefined();
    s.gesture(tap(10, 10)); // 响应窗口不关闭
    expect(s.size).toBe(1);
    s.gesture(tap(350, 10));
    expect(await r.result).toBe('shan');
    expect(s.size).toBe(0);
  });
  it('pausesScene：打开暂停场景，全部关闭后恢复', () => {
    const { s, ev } = mk();
    const a = s.push({ id: 'set', kind: 'popup', pausesScene: true, draw() {} });
    const b = s.push({ id: 'set2', kind: 'popup', pausesScene: true, draw() {} });
    a.close();
    expect(ev).toEqual(['pause']);
    b.close();
    expect(ev).toEqual(['pause', 'resume']);
  });
});

describe('引擎接入场景与弹层', () => {
  it('输入先给弹层再给场景；场景绘制三层；WebGL 关闭时转场无特效', async () => {
    const f = fakePlatform({ query: { webgl: '0' } });
    const e = new Engine(f.p);
    const drawn: string[] = [];
    const got: string[] = [];
    e.scenes.register('a', () => ({
      id: 'a',
      enter() {},
      exit() {},
      draw: (l) => drawn.push(l),
      gesture: (g) => (g.type !== 'longpressprogress' && got.push(g.type), true),
    }));
    void e.scenes.go('a');
    e.start();
    f.flush(16);
    expect(drawn).toEqual(['bg', 'ambient', 'main']);
    f.touch().start([{ id: 1, x: 5, y: 5 }]);
    f.touch().end([{ id: 1, x: 5, y: 5 }]);
    expect(got).toEqual(['tap']);
    e.overlays.push({ id: 'm', kind: 'popup', draw() {} });
    f.touch().start([{ id: 1, x: 5, y: 5 }]);
    f.touch().end([{ id: 1, x: 5, y: 5 }]);
    expect(got).toEqual(['tap']);
  });
});
