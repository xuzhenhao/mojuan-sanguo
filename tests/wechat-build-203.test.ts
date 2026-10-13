import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { wechatViteConfig, WECHAT_OUT_DIR } from '../scripts/vite-wechat';
import { startWechat } from '../src/platform/wechat/start';

const ROOT = resolve(import.meta.dirname, '..');

describe('#203 wechat 构建配置', () => {
  it('lib 单文件 cjs、es2017、关 modulePreload、define 平台常量', () => {
    const c = wechatViteConfig(ROOT);
    expect(c.build.outDir).toBe(WECHAT_OUT_DIR);
    expect(c.build.target).toBe('es2017');
    expect(c.build.modulePreload).toBe(false);
    expect(c.build.lib.formats).toEqual(['cjs']);
    expect(c.build.lib.fileName()).toBe('game.js');
    expect(c.build.lib.entry).toBe(join(ROOT, 'src/platform/wechat/entry.ts'));
    expect(c.publicDir).toBe(false);
    expect(c.define.__PLATFORM__).toBe('"wechat"');
  });
});

describe('#203 wechat 启动占位', () => {
  it('首个画布按窗口×像素比铺满并清黑，只用传入的 wx', () => {
    const calls: unknown[] = [];
    const ctx = { fillStyle: '' as unknown, fillRect: (...a: number[]) => calls.push(a) };
    const canvas = { width: 0, height: 0, getContext: () => ctx };
    const out = startWechat({ createCanvas: () => canvas, getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 2 }) });
    expect(out).toBe(canvas);
    expect([canvas.width, canvas.height]).toEqual([780, 1688]);
    expect(ctx.fillStyle).toBe('#000');
    expect(calls).toEqual([[0, 0, 780, 1688]]);
  });

  it('无 getWindowInfo / 无 2d 上下文时不抛错', () => {
    expect(() => startWechat({ createCanvas: () => ({ width: 1, height: 1, getContext: () => null }) })).not.toThrow();
  });
});
