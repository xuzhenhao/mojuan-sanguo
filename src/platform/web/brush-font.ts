/**
 * 霞鹜文楷（FontFace 族名 Brush）加载器（#142）：core 加载完（或超时）才放行首帧，ext 随后异步补齐。
 * 超时只是不让游戏卡死，不回退任何系统字体；字体晚到时 onLoaded 触发重绘。
 */
export const BRUSH_FAMILY = 'Brush';
export const FONT_GATE_TIMEOUT_MS = 3000;

export interface FontDeps {
  create(family: string, src: string): { load(): Promise<unknown> };
  add(face: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  warn(msg: string, e?: unknown): void;
}

export function webFontDeps(warn: FontDeps['warn']): FontDeps | null {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return null;
  return {
    create: (family, src) => new FontFace(family, src),
    add: (f) => document.fonts.add(f as FontFace),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    warn,
  };
}

/** 返回的 Promise 在 core 字体就绪或超时后 resolve（值为是否就绪），永不 reject */
export function loadBrushFonts(
  deps: FontDeps | null,
  urls: { core: string; ext?: string },
  onLoaded: () => void = () => {},
  timeoutMs = FONT_GATE_TIMEOUT_MS,
): Promise<boolean> {
  if (!deps) return Promise.resolve(false);
  const load = (url: string, kind: string) =>
    deps
      .create(BRUSH_FAMILY, `url(${url}) format('woff2')`)
      .load()
      .then((f) => {
        deps.add(f);
        onLoaded();
        return true;
      })
      .catch((e: unknown) => {
        deps.warn(`书法字体 ${kind} 加载失败`, e);
        return false;
      });
  const core = load(urls.core, 'core');
  if (urls.ext) void core.then(() => load(urls.ext!, 'ext'));
  const timeout = new Promise<boolean>((r) =>
    deps.setTimeout(() => {
      deps.warn(`书法字体 core 超过 ${timeoutMs}ms 未就绪，先开帧，字体到后重绘`);
      r(false);
    }, timeoutMs),
  );
  return Promise.race([core, timeout]);
}
