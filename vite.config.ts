import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * 构建模式（engine-design §4.10）：
 * - 默认 / h5：发布包，只含 Canvas 引擎入口（index.html），不含 DOM 调试版；输出 dist/
 * - debug：DOM 调试版（debug.html），输出 dist-debug/，不进发布包
 * - wechat：仅保留占位，本期不实现
 */
export default defineConfig(({ mode }) => {
  if (mode === 'wechat') throw new Error('wechat 构建目标本期未实现（engine-design §7）');
  const debug = mode === 'debug';
  return {
    base: '/mojuan-sanguo/',
    build: {
      outDir: debug ? 'dist-debug' : 'dist',
      emptyOutDir: true,
      rollupOptions: { input: debug ? { debug: resolve(import.meta.dirname, 'debug.html') } : { index: resolve(import.meta.dirname, 'index.html') } },
    },
    test: { include: ['tests/**/*.test.ts'] },
  } as never;
});
