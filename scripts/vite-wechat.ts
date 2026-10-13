/**
 * `vite build --mode wechat` 的构建配置（M2 §3.2 / #203），由 vite.config.ts 在 wechat 模式下返回。
 * lib 模式单文件：入口 src/platform/wechat/entry.ts → dist-wechat/game.js（cjs，es2017），
 * 不产出 HTML/CSS/modulepreload，不拷 public/。game.json 等由 scripts/build-wechat.ts 生成。
 */
import { resolve } from 'node:path';

export const WECHAT_OUT_DIR = 'dist-wechat';
export const WECHAT_ENTRY = 'src/platform/wechat/entry.ts';

export function wechatViteConfig(root: string) {
  return {
    base: './',
    publicDir: false as const,
    define: { __PLATFORM__: JSON.stringify('wechat') },
    build: {
      outDir: WECHAT_OUT_DIR,
      emptyOutDir: true,
      copyPublicDir: false,
      target: 'es2017',
      modulePreload: false as const,
      cssCodeSplit: false,
      minify: true,
      lib: { entry: resolve(root, WECHAT_ENTRY), formats: ['cjs' as const], fileName: () => 'game.js' },
    },
  };
}
