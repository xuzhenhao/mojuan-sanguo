/**
 * 立绘（#177）：图放阿里云 OSS，不打进包。路径只来自 yaml 的 portrait 字段，根目录来自 rules.assets.baseUrl，代码里不写任何文件名 / 域名。
 * - 两档：large = portrait 本身（512×712），small = 同名加 @s（256×356）
 * - 懒加载 + 缓存：第一次 get 时 new Image()，加载完成回调 onReady（场景用来 invalidate 重绘）
 * - 缺字段 / 未配置目录 / 加载失败：返回 null，调用方画原占位，不抛错
 */
import type { Rect } from '../../engine/types';
import { CONFIG } from '../../data/config';

export type PortraitTier = 'large' | 'small';
/** 大图源尺寸（portraitFocus 的坐标系） */
export const PORTRAIT_SRC = { w: 512, h: 712 } as const;

export const smallPath = (p: string) => p.replace(/\.webp$/, '@s.webp');

/** 资源根目录（rules.assets.baseUrl）；未配置时为空串 */
export function assetBase(): string {
  return CONFIG.rules.assets?.baseUrl ?? '';
}

/** 相对路径 + 档位 → URL；未配置根目录或缺路径返回 null */
export function portraitUrl(path: string | undefined, tier: PortraitTier, base = assetBase()): string | null {
  if (!path || !base) return null;
  return base + (tier === 'small' ? smallPath(path) : path);
}

export interface ImageLike {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
}
interface Entry {
  img: ImageLike;
  state: 'loading' | 'ok' | 'error';
  waiters: (() => void)[];
}
const cache = new Map<string, Entry>();
let makeImage: () => ImageLike | null = () => (typeof Image === 'undefined' ? null : (new Image() as unknown as ImageLike));

/** 测试替身：换 Image 工厂并清缓存 */
export function setImageFactory(f: () => ImageLike | null) {
  makeImage = f;
  cache.clear();
}

/** 取已加载的立绘；未加载时开始加载并在完成后调用 onReady，期间返回 null */
export function getPortrait(path: string | undefined, tier: PortraitTier, onReady?: () => void): ImageLike | null {
  const url = portraitUrl(path, tier);
  if (!url) return null;
  let e = cache.get(url);
  if (!e) {
    const img = makeImage();
    if (!img) return null;
    const entry: Entry = { img, state: 'loading', waiters: [] };
    const settle = (s: 'ok' | 'error') => {
      entry.state = s;
      const w = entry.waiters.splice(0);
      if (s === 'ok') for (const f of w) f();
    };
    img.onload = () => settle('ok');
    img.onerror = () => settle('error');
    cache.set(url, entry);
    img.src = url;
    e = entry;
  }
  if (e.state === 'ok') return e.img;
  if (e.state === 'loading' && onReady && !e.waiters.includes(onReady)) e.waiters.push(onReady);
  return null;
}

/** cover 适配：铺满 box，水平居中、顶部对齐（头不被裁） */
export function coverTop(box: Rect, src: { w: number; h: number } = PORTRAIT_SRC): Rect {
  const s = Math.max(box.w / src.w, box.h / src.h);
  const w = src.w * s;
  const h = src.h * s;
  return { x: box.x + (box.w - w) / 2, y: box.y, w, h };
}

/**
 * 脸部对位（战斗副将小卡）：把 focus（512×712 像素）精确放到 box 内 target 点（css px），图始终盖满 box。
 * 立绘与小卡宽高比几乎一致，纯 cover 没有可移动余量，所以取「能同时满足对位与盖满」的最小缩放：
 * s = max(cover, tx/fx, ty/fy, (w−tx)/(W−fx), (h−ty)/(H−fy))。脸越偏离 target 放大越多（吕布脸在右下，放大最多）。
 */
export function coverFocus(box: Rect, focus: { x: number; y: number }, target: { x: number; y: number }, src: { w: number; h: number } = PORTRAIT_SRC): Rect {
  const fx = Math.min(Math.max(focus.x, 1), src.w - 1);
  const fy = Math.min(Math.max(focus.y, 1), src.h - 1);
  const s = Math.max(box.w / src.w, box.h / src.h, target.x / fx, target.y / fy, (box.w - target.x) / (src.w - fx), (box.h - target.y) / (src.h - fy));
  return { x: box.x + target.x - fx * s, y: box.y + target.y - fy * s, w: src.w * s, h: src.h * s };
}

type DrawCtx = {
  drawImage(img: unknown, dx: number, dy: number, dw?: number, dh?: number): void;
  save?(): void;
  restore?(): void;
  beginPath?(): void;
  rect?(x: number, y: number, w: number, h: number): void;
  clip?(): void;
};

/** 画立绘到 box（裁剪在 box 内）；画了返回 true，没图返回 false（调用方画占位） */
export function drawPortrait(
  c: DrawCtx,
  box: Rect,
  path: string | undefined,
  tier: PortraitTier,
  o: { onReady?: () => void; focus?: { x: number; y: number }; target?: { x: number; y: number } } = {},
): boolean {
  const img = getPortrait(path, tier, o.onReady);
  if (!img) return false;
  const d = o.focus && o.target ? coverFocus(box, o.focus, o.target) : coverTop(box);
  const clip = !!(c.save && c.restore && c.beginPath && c.rect && c.clip);
  if (clip) {
    c.save!();
    c.beginPath!();
    c.rect!(box.x, box.y, box.w, box.h);
    c.clip!();
  }
  c.drawImage(img, d.x, d.y, d.w, d.h);
  if (clip) c.restore!();
  return true;
}

type BandCtx = DrawCtx & {
  fillRect(x: number, y: number, w: number, h: number): void;
  fillStyle: unknown;
  createLinearGradient?(x0: number, y0: number, x1: number, y1: number): { addColorStop(o: number, c: string): void };
};
/** 竖排名字墨带两端的线性淡出长度（px，UI 复核 #177） */
export const NAME_BAND_FADE = 8;
/** 竖排名字墨带比字宽出的边距（每侧 px） */
export const NAME_BAND_PAD = 4;
const transparentOf = (rgba: string) => rgba.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgba($1,$2,$3,0)');

/**
 * 竖排名字墨带（#177 UI 复核）：立绘上竖排名字的衬底。r 为整条带（含两端各 NAME_BAND_FADE 的淡出段），
 * 中段实色、两端线性淡出；没有 createLinearGradient 的环境只画中段。不用 shadowBlur。
 */
export function drawNameBand(c: BandCtx, r: Rect, color: string) {
  const f = Math.min(NAME_BAND_FADE, r.h / 2);
  c.fillStyle = color;
  c.fillRect(r.x, r.y + f, r.w, r.h - 2 * f);
  if (!c.createLinearGradient) return;
  const clear = transparentOf(color);
  const top = c.createLinearGradient(0, r.y, 0, r.y + f);
  top.addColorStop(0, clear);
  top.addColorStop(1, color);
  c.fillStyle = top;
  c.fillRect(r.x, r.y, r.w, f);
  const bot = c.createLinearGradient(0, r.y + r.h - f, 0, r.y + r.h);
  bot.addColorStop(0, color);
  bot.addColorStop(1, clear);
  c.fillStyle = bot;
  c.fillRect(r.x, r.y + r.h - f, r.w, f);
}

/** 竖排名字墨带的矩形：字列中心 cx、首字中心 y0、字号 size、字数 n、行距 step；夹在 clip（立绘区）内 */
export function nameBandRect(cx: number, y0: number, size: number, n: number, step: number, clip: Rect): Rect {
  const x0 = Math.max(clip.x, cx - size / 2 - NAME_BAND_PAD);
  const x1 = Math.min(clip.x + clip.w, cx + size / 2 + NAME_BAND_PAD);
  const top = Math.max(clip.y, y0 - size / 2 - NAME_BAND_FADE);
  const bottom = Math.min(clip.y + clip.h, y0 + (n - 1) * step + size / 2 + NAME_BAND_FADE);
  return { x: x0, y: top, w: x1 - x0, h: bottom - top };
}
