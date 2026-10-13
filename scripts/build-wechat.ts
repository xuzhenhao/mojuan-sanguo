/**
 * 小游戏打包后处理（M2 §3.2 / #203）：在 `vite build --mode wechat` 产出 dist-wechat/game.js 之后
 * - 生成 game.json（竖屏；M2 不做分包）
 * - 生成 project.config.json（appid 默认 wx3dd635e3cc359d30，可用环境变量 WX_APPID 覆盖）
 * - 拷贝字体到包内 assets/fonts/（W6 #205 再加 ttf 子集）
 * - 守卫：game.js 不得出现 `document.` / `window.`
 * 上传私钥不在这里读：CI 上传（W8）只从 Actions secret WX_UPLOAD_PRIVATE_KEY 读取，不进仓库、不打日志。
 * 用法：tsx scripts/build-wechat.ts [dir=dist-wechat]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { walk } from './size-check';

export const DEFAULT_APPID = 'wx3dd635e3cc359d30';
export const APPID_ENV = 'WX_APPID';
export const FONT_SRC_DIR = 'public/assets/fonts';
export const FONT_FILES = ['wenkai-core.woff2', 'wenkai-ext.woff2'] as const;
export const FONT_DEST_DIR = 'assets/fonts';
const FORBIDDEN = [/\bdocument\./g, /\bwindow\./g];

export function resolveAppId(env: Record<string, string | undefined>): string {
  const v = env[APPID_ENV]?.trim();
  if (!v) return DEFAULT_APPID;
  if (v !== 'touristappid' && !/^wx[0-9a-f]{16}$/.test(v)) throw new Error(`${APPID_ENV} 格式不对：应为 wx + 16 位十六进制，或 touristappid`);
  return v;
}

export function gameJson() {
  return { deviceOrientation: 'portrait', showStatusBar: false };
}

export function projectConfig(appid: string, projectname: string) {
  return {
    appid,
    projectname,
    compileType: 'game',
    setting: { es6: false, enhance: false, minified: false, postcss: false, urlCheck: true },
    packOptions: { ignore: [], include: [] },
  };
}

/** 返回 game.js 中命中的浏览器全局访问（空数组 = 通过） */
export function findBrowserGlobals(code: string): string[] {
  return FORBIDDEN.flatMap((re) => code.match(re) ?? []);
}

export function buildWechat(dir: string, root: string, env: Record<string, string | undefined>) {
  const gameJs = join(dir, 'game.js');
  if (!existsSync(gameJs)) throw new Error(`${gameJs} 不存在，先跑 vite build --mode wechat`);
  const hits = findBrowserGlobals(readFileSync(gameJs, 'utf8'));
  if (hits.length) throw new Error(`game.js 含浏览器全局访问：${[...new Set(hits)].join(', ')}`);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name: string };
  writeFileSync(join(dir, 'game.json'), JSON.stringify(gameJson(), null, 2) + '\n');
  writeFileSync(join(dir, 'project.config.json'), JSON.stringify(projectConfig(resolveAppId(env), pkg.name), null, 2) + '\n');
  mkdirSync(join(dir, FONT_DEST_DIR), { recursive: true });
  for (const f of FONT_FILES) copyFileSync(join(root, FONT_SRC_DIR, f), join(dir, FONT_DEST_DIR, f));
  return walk(dir);
}

const isMain = process.argv[1] && /build-wechat\.ts$/.test(process.argv[1]);
if (isMain) {
  const dir = process.argv[2] ?? 'dist-wechat';
  try {
    const files = buildWechat(dir, process.cwd(), process.env);
    console.log(`build-wechat ${dir}: ${files.length} 个文件`);
  } catch (e) {
    console.error('✗ ' + (e as Error).message);
    process.exit(1);
  }
}
