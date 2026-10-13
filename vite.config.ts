import { resolve } from 'node:path';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { wechatViteConfig } from './scripts/vite-wechat';

/**
 * 本地立绘（仅 vite dev 且 VITE_ASSET_LOCAL=1）：在 rules.assets.localBaseUrl 下提供 art/out/ 静态目录。
 * 路径前缀只读生成的配置（config:build 产物），这里不写死；正式构建不挂载。
 */
function localAssets(): Plugin {
  return {
    name: 'mojuan-local-assets',
    apply: 'serve',
    configureServer(server) {
      if (process.env.VITE_ASSET_LOCAL !== '1') return;
      const cfg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'src/data/generated/config.json'), 'utf8')) as {
        rules: { assets: { localBaseUrl: string } };
      };
      const prefix = cfg.rules.assets.localBaseUrl;
      const root = resolve(import.meta.dirname, 'art/out');
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith(prefix)) return next();
        const file = resolve(root, decodeURIComponent(url.slice(prefix.length)));
        if (!file.startsWith(root + '/') || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader('Content-Type', file.endsWith('.webp') ? 'image/webp' : 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

/**
 * 构建模式（engine-design §4.10）：
 * - 默认 / h5：Canvas 发布包，只含 Canvas 引擎入口（index.html），不含 DOM 版；输出 dist/，Pages 上部署在根目录 /mojuan-sanguo/
 * - debug：DOM 可玩版（debug.html），输出 dist-debug/，不进 Canvas 发布包；Pages 上部署在 /mojuan-sanguo/debug/
 *   （P5 #46 已对调：此前 DOM 在根目录、Canvas 在 /next/；/next/ 保留一个跳转页到根目录）
 * - wechat：小游戏包（M2 #203），lib 单文件输出 dist-wechat/game.js，配置见 scripts/vite-wechat.ts
 */
export const PAGES_BASE = { h5: '/mojuan-sanguo/', debug: '/mojuan-sanguo/debug/' } as const;

export default defineConfig(({ mode }) => {
  if (mode === 'wechat') return wechatViteConfig(import.meta.dirname) as never;
  const debug = mode === 'debug';
  return {
    base: debug ? PAGES_BASE.debug : PAGES_BASE.h5,
    plugins: [localAssets()],
    define: { __PLATFORM__: JSON.stringify('web') },
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
