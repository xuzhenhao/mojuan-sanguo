import { testNow } from './helpers';
import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { fakePlatform } from './engine-fakes';

describe('#142 字体就绪前不画任何帧', () => {
  it('holdFramesUntil 落定前 frame() 不绘制文字，落定后正常绘制', async () => {
    const fp = fakePlatform({ query: { webgl: '0' } });
    const eng = new Engine(fp.p);
    let release!: () => void;
    const done = eng.holdFramesUntil(new Promise<void>((r) => (release = r)));
    eng.scenes.register('battle', () => new BattleScene({ now: testNow, overlays: eng.overlays }));
    void eng.scenes.go('battle');
    eng.frame(16);
    expect(fp.offscreens.some((c) => c.calls.includes('fillText'))).toBe(false);
    release();
    await done;
    expect(eng.framesHeld).toBe(false);
    eng.frame(16);
    expect(fp.offscreens.some((c) => c.calls.includes('fillText'))).toBe(true);
  });
  it('字体加载失败（reject）也放行，不卡死', async () => {
    const eng = new Engine(fakePlatform({ query: { webgl: '0' } }).p);
    await eng.holdFramesUntil(Promise.reject(new Error('x')));
    expect(eng.framesHeld).toBe(false);
  });
});
