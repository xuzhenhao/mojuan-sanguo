import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * 构建模式（engine-design §4.10）：
 * - 默认 / h5：Canvas 发布包，只含 Canvas 引擎入口（index.html），不含 DOM 版；输出 dist/，Pages 上部署在根目录 /mojuan-sanguo/
 * - debug：DOM 可玩版（debug.html），输出 dist-debug/，不进 Canvas 发布包；Pages 上部署在 /mojuan-sanguo/debug/
 *   （P5 #46 已对调：此前 DOM 在根目录、Canvas 在 /next/；/next/ 保留一个跳转页到根目录）
 * - wechat：仅保留占位，本期不实现
 */
export const PAGES_BASE = { h5: '/mojuan-sanguo/', debug: '/mojuan-sanguo/debug/' } as const;

export default defineConfig(({ mode }) => {
  if (mode === 'wechat') throw new Error('wechat 构建目标本期未实现（engine-design §7）');
  const debug = mode === 'debug';
  return {
    base: debug ? PAGES_BASE.debug : PAGES_BASE.h5,
    // public/（mockups）不进任何构建产物，由 pages.yml 直接拷到站点根目录 /mockups/，
    // 这样 size-check 只量 Canvas 发布包本身；本地 `npm run dev:debug` 仍可访问 /mockups/
    publicDir: debug ? 'public' : false,
    build: {
      outDir: debug ? 'dist-debug' : 'dist',
      emptyOutDir: true,
      copyPublicDir: false,
      rollupOptions: { input: debug ? { debug: resolve(import.meta.dirname, 'debug.html') } : { index: resolve(import.meta.dirname, 'index.html') } },
    },
    test: {
      include: ['tests/**/*.test.ts'],
      // 覆盖率只出报告不设门槛（npm run test:coverage；CI 写入 job summary）
      coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/data/generated/**'], reporter: ['text', 'text-summary', 'json-summary'] },
    },
  } as never;
});
