/** #177 立绘接入：schema、URL 推导、懒加载缓存、回退占位、cover/脸部对位数学、代码里不写文件名 / 域名 */
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../scripts/config-lib';
import { CONFIG } from '../src/data/config';
import { HEROES, ROSTER } from '../src/data/heroes';
import { coverFocus, coverTop, drawPortrait, getPortrait, portraitUrl, setImageFactory, smallPath, type ImageLike } from '../src/game/portrait';
import { drawRevive, reviveLayout } from '../src/game/overlays/revive';

const ROOT = resolve(__dirname, '..');

describe('配置（schema）', () => {
  let dir = '';
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
  const withEdit = (file: string, edit: (t: string) => string) => {
    dir = mkdtempSync(join(tmpdir(), 'cfg177-'));
    cpSync(join(ROOT, 'config'), dir, { recursive: true });
    const p = join(dir, file);
    writeFileSync(p, edit(readFileSync(p, 'utf8')));
    return loadConfig(dir).errors;
  };

  it('开局 8 将都配了立绘与脸部中心，关羽（不在名单）没有', () => {
    expect(ROSTER).toHaveLength(8);
    for (const id of ROSTER) {
      expect(HEROES[id].portrait).toMatch(/^portraits\/heroes\/[a-z0-9_-]+\.webp$/);
      const f = HEROES[id].portraitFocus!;
      expect(f.x).toBeGreaterThan(0);
      expect(f.x).toBeLessThan(512);
      expect(f.y).toBeGreaterThan(0);
      expect(f.y).toBeLessThan(712);
    }
    expect(HEROES.H09.portrait).toBeUndefined();
    expect(CONFIG.rules.assets.baseUrl).toMatch(/^https:\/\/.+\/$/);
  });
  it.each([
    ['绝对 URL', 'portrait: https://x.example/a.webp'],
    ['非 webp', 'portrait: portraits/heroes/liubei.png'],
    ['越级路径', 'portrait: portraits/heroes/../x.webp'],
    ['不在 portraits/heroes 下', 'portrait: heroes/liubei.webp'],
  ])('坏路径（%s）校验失败', (_n, line) => {
    const errs = withEdit('heroes/H04-liubei.yaml', (t) => t.replace(/^portrait: .*$/m, line));
    expect(errs.some((e) => e.includes('H04-liubei') && e.includes('portrait'))).toBe(true);
  });
  it('portraitFocus 越界 / 多字段校验失败', () => {
    expect(withEdit('heroes/H04-liubei.yaml', (t) => t.replace(/^portraitFocus: .*$/m, 'portraitFocus: { x: 600, y: 10 }')).length).toBeGreaterThan(0);
    expect(withEdit('heroes/H04-liubei.yaml', (t) => t.replace(/^portraitFocus: .*$/m, 'portraitFocus: { x: 1, y: 1, z: 1 }')).length).toBeGreaterThan(0);
  });
  it('rules.assets.baseUrl 必须 https 且以 / 结尾，且不许多余字段', () => {
    expect(withEdit('rules.yaml', (t) => t.replace(/baseUrl: '[^']*'/, "baseUrl: 'http://a.example/x/'")).length).toBeGreaterThan(0);
    expect(withEdit('rules.yaml', (t) => t.replace(/baseUrl: '[^']*'/, "baseUrl: 'https://a.example/x'")).length).toBeGreaterThan(0);
    expect(withEdit('rules.yaml', (t) => t.replace(/baseUrl: '([^']*)'/, "baseUrl: '$1', extra: 1")).length).toBeGreaterThan(0);
  });
  it('敌人 portrait 可选且同样校验格式', () => {
    const f = readdirSync(join(ROOT, 'config/enemies/ch1')).find((x) => x.endsWith('.yaml'))!;
    expect(withEdit(`enemies/ch1/${f}`, (t) => t.replace(/^name: .*$/m, (m) => `${m}\nportrait: portraits/enemies/x.webp`))).toEqual([]);
    expect(withEdit(`enemies/ch1/${f}`, (t) => t.replace(/^name: .*$/m, (m) => `${m}\nportrait: x.jpg`)).length).toBeGreaterThan(0);
  });
});

describe('URL 推导', () => {
  it('大图 = base + 路径，小图在 .webp 前插 @s', () => {
    expect(smallPath('portraits/heroes/a.webp')).toBe('portraits/heroes/a@s.webp');
    expect(portraitUrl('portraits/heroes/a.webp', 'large', 'https://b/')).toBe('https://b/portraits/heroes/a.webp');
    expect(portraitUrl('portraits/heroes/a.webp', 'small', 'https://b/')).toBe('https://b/portraits/heroes/a@s.webp');
    expect(portraitUrl('portraits/heroes/a.webp', 'large')).toBe(CONFIG.rules.assets.baseUrl + 'portraits/heroes/a.webp');
  });
  it('缺路径或未配置 base 返回 null', () => {
    expect(portraitUrl(undefined, 'large', 'https://b/')).toBeNull();
    expect(portraitUrl('portraits/heroes/a.webp', 'large', '')).toBeNull();
  });
});

class FakeImg implements ImageLike {
  static made: FakeImg[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() {
    FakeImg.made.push(this);
  }
}

describe('懒加载与回退', () => {
  beforeEach(() => {
    FakeImg.made = [];
    setImageFactory(() => new FakeImg());
  });
  afterEach(() => setImageFactory(() => null));

  it('首次请求开始加载、返回 null；加载完成回调重绘并缓存（同 URL 只建一次 Image）', () => {
    let n = 0;
    const ready = () => n++;
    expect(getPortrait('portraits/heroes/a.webp', 'small', ready)).toBeNull();
    expect(getPortrait('portraits/heroes/a.webp', 'small', ready)).toBeNull();
    expect(FakeImg.made).toHaveLength(1);
    expect(FakeImg.made[0].src).toBe(CONFIG.rules.assets.baseUrl + 'portraits/heroes/a@s.webp');
    FakeImg.made[0].onload!();
    expect(n).toBe(1);
    expect(getPortrait('portraits/heroes/a.webp', 'small')).toBe(FakeImg.made[0]);
    getPortrait('portraits/heroes/a.webp', 'large');
    expect(FakeImg.made).toHaveLength(2);
  });
  it('加载失败（404）：静默返回 null、不回调、不重试、不抛错', () => {
    let n = 0;
    getPortrait('portraits/heroes/x.webp', 'large', () => n++);
    expect(() => FakeImg.made[0].onerror!()).not.toThrow();
    expect(n).toBe(0);
    expect(getPortrait('portraits/heroes/x.webp', 'large')).toBeNull();
    expect(FakeImg.made).toHaveLength(1);
  });
  it('drawPortrait：没图返回 false 且不画；有图按 cover 画进裁剪框', () => {
    const calls: unknown[][] = [];
    const c = { drawImage: (...a: unknown[]) => calls.push(a) };
    const box = { x: 10, y: 20, w: 122, h: 166 };
    expect(drawPortrait(c, box, 'portraits/heroes/a.webp', 'large')).toBe(false);
    expect(drawPortrait(c, box, undefined, 'large')).toBe(false);
    expect(calls).toHaveLength(0);
    FakeImg.made[0].onload!();
    expect(drawPortrait(c, box, 'portraits/heroes/a.webp', 'large')).toBe(true);
    expect(calls[0][0]).toBe(FakeImg.made[0]);
  });
  it('复活层：立绘失败回退到名字占位；有图则画图', () => {
    const texts: string[] = [];
    let images = 0;
    const c = new Proxy({ fillText: (s: string) => texts.push(s), drawImage: () => images++, measureText: () => ({ width: 10 }) } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => undefined),
      set: () => true,
    });
    const info = { hero: '刘备', portrait: HEROES.H04.portrait, hp: 2, armor: 3, perRun: 1, enemies: 1 };
    const L = reviveLayout({ x: 0, y: 0, w: 390, h: 844 });
    drawRevive(c as never, L, info);
    expect(texts).toContain('刘备');
    FakeImg.made[0].onerror!();
    texts.length = 0;
    drawRevive(c as never, L, info);
    expect(texts).toContain('刘备');
    expect(images).toBe(0);
    setImageFactory(() => new FakeImg());
    drawRevive(c as never, L, info);
    FakeImg.made.at(-1)!.onload!();
    texts.length = 0;
    drawRevive(c as never, L, info);
    expect(images).toBe(1);
    expect(texts).not.toContain('刘备');
  });
});

describe('适配数学', () => {
  it('coverTop：铺满、水平居中、顶对齐', () => {
    const r = coverTop({ x: 0, y: 0, w: 60, h: 116 }); // 窄框：按高缩放，左右居中裁
    expect(r.h).toBeCloseTo(116);
    expect(r.w).toBeGreaterThan(60);
    expect(r.x).toBeCloseTo((60 - r.w) / 2);
    expect(r.y).toBe(0);
    const wide = coverTop({ x: 5, y: 7, w: 210, h: 280 }); // 结算：按宽缩放，底部被裁
    expect(wide.w).toBeCloseTo(210);
    expect(wide.x).toBeCloseTo(5);
    expect(wide.y).toBe(7);
    expect(wide.h).toBeGreaterThan(280);
  });
  it('coverFocus：脸部中心精确对到 (38,32)，图盖满 box，缩放不小于 cover', () => {
    const box = { x: 100, y: 200, w: 70, h: 98 };
    const cover = Math.max(70 / 512, 98 / 712);
    for (const id of ROSTER) {
      const f = HEROES[id].portraitFocus!;
      const r = coverFocus(box, f, { x: 38, y: 32 });
      const s = r.w / 512;
      expect(s).toBeGreaterThanOrEqual(cover - 1e-9);
      expect(r.x + f.x * s).toBeCloseTo(138);
      expect(r.y + f.y * s).toBeCloseTo(232);
      expect(r.x).toBeLessThanOrEqual(box.x + 1e-9);
      expect(r.y).toBeLessThanOrEqual(box.y + 1e-9);
      expect(r.x + r.w).toBeGreaterThanOrEqual(box.x + box.w - 1e-9);
      expect(r.y + r.h).toBeGreaterThanOrEqual(box.y + box.h - 1e-9);
    }
  });
});

describe('代码里不写立绘文件名 / 域名', () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) {
        if (!p.includes(join('src', 'data', 'generated'))) walk(p);
      } else if (/\.(ts|css|html)$/.test(f)) files.push(p);
    }
  };
  walk(join(ROOT, 'src'));
  const host = new URL(CONFIG.rules.assets.baseUrl).host;
  const names = ROSTER.map((id) => HEROES[id].portrait!.split('/').pop()!.replace('.webp', ''));
  it.each(files.map((f) => [f.slice(ROOT.length + 1)]))('%s', (rel) => {
    const t = readFileSync(join(ROOT, rel), 'utf8');
    expect(t).not.toContain(host);
    expect(t).not.toMatch(/portraits\/heroes\//);
    for (const n of names) expect(t).not.toMatch(new RegExp(`${n}(@s)?\\.webp`));
  });
});
