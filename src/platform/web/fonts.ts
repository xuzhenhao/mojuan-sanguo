/**
 * H5 字体加载（#202，原 brush-font.ts 的 FontFace 逻辑）：FontFace + document.fonts。
 * 永不抛错：环境不支持或加载失败一律返回 false，由 game/fonts.ts 统一回退系统字体。
 */
import type { PlatformFonts } from '../types';

export interface WebFontDeps {
  create(family: string, src: string): { load(): Promise<unknown> };
  add(face: unknown): void;
  /** 包内相对路径 → 实际 URL（H5 拼 import.meta.env.BASE_URL） */
  resolve(url: string): string;
}

/**
 * 正式构建不拷 public/（vite.config publicDir: false），字体须经打包器产出带 hash 的资源：
 * 配置里的包内相对路径（相对 public/）在这里映射成打包后的 URL；映射不到的再拼 base。
 */
const BUNDLED = import.meta.glob('../../../public/assets/fonts/*.woff2', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
export const resolveFontUrl = (url: string, base: string, bundled: Record<string, string> = BUNDLED) =>
  bundled[`../../../public/${url}`] ?? (/^(https?:)?\//.test(url) ? url : base + url);

export function webFontDeps(base: string): WebFontDeps | null {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return null;
  return {
    create: (family, src) => new FontFace(family, src),
    add: (f) => document.fonts.add(f as FontFace),
    resolve: (url) => resolveFontUrl(url, base),
  };
}

export function createWebFonts(deps: WebFontDeps | null): PlatformFonts {
  return {
    async load(family, url) {
      if (!deps) return false;
      try {
        const face = await deps.create(family, `url(${deps.resolve(url)})`).load();
        deps.add(face);
        return true;
      } catch {
        return false;
      }
    },
  };
}
