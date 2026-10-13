/** #142 首屏字体门控（#202 起：game/fonts.ts 经 platform.fonts，规则来自 rules.fonts） */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { facesOf, fontStack, loadGameFonts, setFontPlatform } from '../src/game/fonts';
import { SANS } from '../src/game/scenes/p4-kit';
import { FONTS, type FontsConfig } from '../src/data/config';
import { createWebFonts, resolveFontUrl, type WebFontDeps } from '../src/platform/web/fonts';
import type { PlatformFonts } from '../src/platform/types';

const CFG: FontsConfig = {
  gateTimeoutMs: 3000,
  fallback: { brush: 'serif', sans: 'sans-serif' },
  platforms: {
    web: {
      brush: {
        family: 'Brush',
        faces: [
          { url: 'c', gate: true },
          { url: 'e', gate: false },
        ],
      },
      sans: { family: 'Sans', faces: [{ url: 's', gate: true }] },
    },
    wechat: { brush: { family: 'Brush', faces: [{ url: 'c', gate: true }] }, sans: 'system' },
  },
};
function setup(loads: Record<string, Promise<boolean>>) {
  let timer: (() => void) | null = null;
  const calls: string[] = [];
  const fonts: PlatformFonts = { load: (_f, u) => (calls.push(u), loads[u] ?? Promise.resolve(true)) };
  const h = { warn: vi.fn(), onLoaded: vi.fn(), setTimeout: vi.fn((fn: () => void) => (timer = fn)) };
  return { fonts, h, calls, fire: () => timer?.() };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('#202 首屏字体门控 loadGameFonts', () => {
  it('门控字体（brush + sans）全部就绪 → true，不打日志；之后后台加载非门控字体', async () => {
    const s = setup({});
    expect(await loadGameFonts(s.fonts, CFG, 'web', s.h)).toBe(true);
    await tick();
    expect(s.calls).toEqual(['c', 's', 'e']);
    expect(s.h.warn).not.toHaveBeenCalled();
    expect(s.h.onLoaded).toHaveBeenCalledTimes(2); // 门控就绪 + ext 到位
  });
  it('微信：sans 为 system 不加载，门控只等 brush', async () => {
    const s = setup({});
    expect(await loadGameFonts(s.fonts, CFG, 'wechat', s.h)).toBe(true);
    expect(s.calls).toEqual(['c']);
  });
  it('没有任何要加载的字体：立即放行，不起超时', async () => {
    const s = setup({});
    const cfg: FontsConfig = { ...CFG, platforms: { ...CFG.platforms, wechat: { brush: 'system', sans: 'system' } } };
    expect(await loadGameFonts(s.fonts, cfg, 'wechat', s.h)).toBe(true);
    expect(s.calls).toEqual([]);
    expect(s.h.setTimeout).not.toHaveBeenCalled();
  });
  it('任一门控字体失败（false）→ false，回退系统字体，只打一行日志', async () => {
    const s = setup({ s: Promise.resolve(false) });
    expect(await loadGameFonts(s.fonts, CFG, 'web', s.h)).toBe(false);
    expect(s.h.warn).toHaveBeenCalledTimes(1);
    expect(s.h.warn.mock.calls[0][0]).toMatch(/加载失败，回退系统字体（brush→serif，sans→sans-serif）/);
  });
  it('超时 → false + 一行日志；字体晚到仍重绘', async () => {
    let late!: (v: boolean) => void;
    const s = setup({ c: new Promise((r) => (late = r)) });
    const p = loadGameFonts(s.fonts, CFG, 'web', s.h);
    s.fire();
    expect(await p).toBe(false);
    expect(s.h.warn).toHaveBeenCalledTimes(1);
    expect(s.h.warn.mock.calls[0][0]).toMatch(/超过 3000ms 未就绪/);
    s.h.onLoaded.mockClear();
    late(true);
    await tick();
    expect(s.h.onLoaded).toHaveBeenCalled();
    expect(s.h.warn).toHaveBeenCalledTimes(1);
  });
  it('platform.fonts 违约抛错也不 reject', async () => {
    const s = setup({ c: Promise.reject(new Error('x')) });
    expect(await loadGameFonts(s.fonts, CFG, 'web', s.h)).toBe(false);
  });
  it('字体栈：加载角色为 "族名", 通用字族；system 角色只用通用字族', () => {
    expect(fontStack(CFG, 'web', 'brush')).toBe('"Brush", serif');
    expect(fontStack(CFG, 'web', 'sans')).toBe('"Sans", sans-serif');
    expect(fontStack(CFG, 'wechat', 'sans')).toBe('sans-serif');
  });
});

describe('#202 rules.fonts 配置', () => {
  it('H5：core 门控、ext 后台，正文复用 Brush 不重复加载', () => {
    expect(FONTS.gateTimeoutMs).toBe(3000);
    const web = facesOf(FONTS, 'web');
    expect(web.filter((f) => f.gate).map((f) => f.url)).toEqual(['assets/fonts/wenkai-core.woff2']);
    expect(web.filter((f) => !f.gate).map((f) => f.url)).toEqual(['assets/fonts/wenkai-ext.woff2']);
    expect(fontStack(FONTS, 'web', 'sans')).toBe('"Brush", sans-serif');
  });
  it('微信：正文为系统 sans-serif，只加载书法字', () => {
    expect(FONTS.platforms.wechat.sans).toBe('system');
    expect(facesOf(FONTS, 'wechat').every((f) => f.family === 'Brush')).toBe(true);
    expect(fontStack(FONTS, 'wechat', 'sans')).toBe('sans-serif');
  });
  it('游戏内书法字体串与配置一致；正文 SANS 随平台切换', () => {
    expect(SANS(14)).toBe('14px "Brush", sans-serif');
    setFontPlatform(FONTS, 'wechat');
    expect(SANS(14, true)).toBe('bold 14px sans-serif');
    setFontPlatform(FONTS, 'web');
  });
});

describe('#202 web 字体实现 createWebFonts', () => {
  const deps = (ok: boolean): WebFontDeps & { added: unknown[]; srcs: string[] } => {
    const added: unknown[] = [];
    const srcs: string[] = [];
    return {
      added,
      srcs,
      create: (_f, src) => (srcs.push(src), { load: () => (ok ? Promise.resolve('F') : Promise.reject(new Error('net'))) }),
      add: (f) => void added.push(f),
      resolve: (u) => '/base/' + u,
    };
  };
  it('成功：拼 BASE_URL、add 到 document.fonts、返回 true', async () => {
    const d = deps(true);
    expect(await createWebFonts(d).load('Brush', 'assets/fonts/x.woff2')).toBe(true);
    expect(d.srcs).toEqual(['url(/base/assets/fonts/x.woff2)']);
    expect(d.added).toEqual(['F']);
  });
  it('配置路径映射到打包产物 URL（正式构建不拷 public/）；映射不到才拼 base', () => {
    for (const f of facesOf(FONTS, 'web')) expect(resolveFontUrl(f.url, '/base/')).not.toBe('/base/' + f.url);
    expect(resolveFontUrl('assets/x.woff2', '/base/', {})).toBe('/base/assets/x.woff2');
    expect(resolveFontUrl('https://cdn/x.woff2', '/base/', {})).toBe('https://cdn/x.woff2');
  });
  it('失败 / 无 FontFace 环境：返回 false，不抛错', async () => {
    expect(await createWebFonts(deps(false)).load('Brush', 'x')).toBe(false);
    expect(await createWebFonts(null).load('Brush', 'x')).toBe(false);
  });
  it('boot 首帧挂在字体门控后；entry 不再自己加载字体；调试页按配置加载', () => {
    const boot = readFileSync(join(__dirname, '../src/game/boot.ts'), 'utf8');
    expect(boot).toMatch(/loadGameFonts\(platform\.fonts, FONTS/);
    expect(boot).toMatch(/engine\.holdFramesUntil\(fontsReady\)/);
    expect(boot).toMatch(/framesReleased\.then\(\(\) => engine\.start\(\)\)/);
    expect(boot).not.toMatch(/^\s*engine\.start\(\);/m);
    expect(readFileSync(join(__dirname, '../src/platform/web/entry.ts'), 'utf8')).not.toMatch(/loadBrushFonts|FontFace|woff2/);
    const dbg = readFileSync(join(__dirname, '../src/platform/web/debug/main.ts'), 'utf8');
    expect(dbg).toMatch(/facesOf\(FONTS, 'web'\)/);
  });
});
