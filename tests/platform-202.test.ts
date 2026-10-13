/** M2-W3 #202：Platform 新增 fonts / telemetry / prefersReducedMotion，game 层改走平台 */
import { afterEach, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prefersReducedMotion, setReducedMotionSource } from '../src/game/motion';
import { prefersReducedMotion as epiReduced } from '../src/game/overlays/epiphany';
import { prefersReducedMotion as hpReduced } from '../src/game/scenes/battle/hpview';
import { BATCH_MAX, bindTelemetry, flushTelemetry, resetTelemetry, telemetryLog, track } from '../src/game/telemetry';
import { DEFAULT_RENDER_CONFIG } from '../src/engine/settings';
import { bootGame } from '../src/game/boot';
import { fakePlatform } from './engine-fakes';
import { fakeClock } from './helpers';

const ROOT = resolve(__dirname, '..');

describe('#202 prefersReducedMotion 走平台', () => {
  afterEach(() => setReducedMotionSource(null));
  it('未注入为 false；注入后各调用点读平台值', () => {
    expect(prefersReducedMotion()).toBe(false);
    setReducedMotionSource(() => true);
    expect([prefersReducedMotion(), epiReduced(), hpReduced()]).toEqual([true, true, true]);
  });
  it('game 层不再直接用 matchMedia', () => {
    for (const f of ['game/overlays/epiphany.ts', 'game/scenes/battle/hpview.ts', 'game/scenes/event.ts', 'game/scenes/battle/revive-fx.ts'])
      expect(readFileSync(resolve(ROOT, 'src', f), 'utf8')).not.toContain('matchMedia');
  });
  it('bootGame 注入 platform.prefersReducedMotion', () => {
    const fp = fakePlatform({ query: { webgl: '0' }, reducedMotion: true });
    bootGame(fp.p, { renderConfig: { ...DEFAULT_RENDER_CONFIG, webgl: false } });
    expect(prefersReducedMotion()).toBe(true);
  });
  it('ESLint：core/engine/game/data 与 boot 直接用 matchMedia 报错', async () => {
    const eslint = new ESLint({ cwd: ROOT });
    for (const f of ['src/core/x.ts', 'src/engine/x.ts', 'src/game/x.ts', 'src/data/x.ts', 'src/game/boot.ts']) {
      const [r] = await eslint.lintText("export const m = matchMedia('(x)');\n", { filePath: resolve(ROOT, f) });
      expect(
        r.messages.map((m) => m.ruleId),
        f,
      ).toContain('no-restricted-globals');
    }
  }, 60_000);
});

describe('#202 telemetry 经平台 transport 发送', () => {
  afterEach(() => resetTelemetry());
  it('未绑定只缓冲；绑定后 flush 批量发送，带时钟时间戳', () => {
    track('a', { x: 1 });
    expect(telemetryLog).toHaveLength(1);
    const sent: { ev: string; t: number }[][] = [];
    const clock = fakeClock(500);
    bindTelemetry({ send: (b) => void sent.push(b) }, clock.now);
    clock.advance(10);
    track('b');
    flushTelemetry();
    expect(sent).toHaveLength(1);
    expect(sent[0].map((e) => [e.ev, e.t])).toEqual([
      ['a', 0],
      ['b', 510],
    ]);
    flushTelemetry();
    expect(sent).toHaveLength(1); // 空队列不发
  });
  it(`满 ${BATCH_MAX} 条自动发送；transport 抛错不影响游戏`, () => {
    let n = 0;
    bindTelemetry({ send: (b) => ((n += b.length), undefined) });
    for (let i = 0; i < BATCH_MAX; i++) track('e');
    expect(n).toBe(BATCH_MAX);
    bindTelemetry({
      send: () => {
        throw new Error('x');
      },
    });
    track('e');
    expect(() => flushTelemetry()).not.toThrow();
  });
  it('bootGame 绑定 platform.telemetry', () => {
    const fp = fakePlatform({ query: { webgl: '0' } });
    bootGame(fp.p, { renderConfig: { ...DEFAULT_RENDER_CONFIG, webgl: false } });
    track('boot_test');
    flushTelemetry();
    expect(fp.telemetry.flat().map((e) => e.ev)).toContain('boot_test');
  });
});

describe('#202 测试时钟', () => {
  it('fakeClock 固定值，只在显式 advance / set 时前进', () => {
    const c = fakeClock(100);
    expect([c.now(), c.now()]).toEqual([100, 100]);
    c.advance(16);
    expect(c.now()).toBe(116);
    c.set(0);
    expect(c.now()).toBe(0);
  });
});
