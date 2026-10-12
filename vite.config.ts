import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * 构建模式（engine-design §4.10）：
 * - 默认 / h5：Canvas 发布包，只含 Canvas 引擎入口（index.html），不含 DOM 版；输出 dist/，Pages 上部署到 /mojuan-sanguo/next/
 * - debug：DOM 可玩版（debug.html），输出 dist-debug/，不进 Canvas 发布包；Pages 上部署在根目录 /mojuan-sanguo/
 * P5（#46）对调：Canvas 到根目录、DOM 到 /debug/，届时只需改下面两个 base 和 pages.yml。
 * - wechat：仅保留占位，本期不实现
 */
export default defineConfig(({ mode }) => {
  if (mode === 'wechat') throw new Error('wechat 构建目标本期未实现（engine-design §7）');
  const debug = mode === 'debug';
  return {
    // 当前：DOM 版在 Pages 根目录，Canvas 新版在 /next/（P5 #46 对调）
    base: debug ? '/mojuan-sanguo/' : '/mojuan-sanguo/next/',
    // mockups 等公共文件跟随根目录的 DOM 版（保持原有 /mockups/ 链接不变）
    publicDir: debug ? 'public' : false,
    build: {
      outDir: debug ? 'dist-debug' : 'dist',
      emptyOutDir: true,
      rollupOptions: { input: debug ? { debug: resolve(import.meta.dirname, 'debug.html') } : { index: resolve(import.meta.dirname, 'index.html') } },
    },
    test: { include: ['tests/**/*.test.ts'] },
  } as never;
});
