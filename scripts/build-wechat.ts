/**
 * 小游戏打包后处理（M2 §3.2 / #203+#205）：在 `vite build --mode wechat` 产出 dist-wechat/game.js 之后
 * - 生成 game.json（竖屏；M2 不做分包）
 * - 生成 project.config.json（appid 默认 wx3dd635e3cc359d30，可用环境变量 WX_APPID 覆盖）
 * - 按 rules.fonts.platforms.wechat 拷贝书法字体 ttf 子集到包内（#205；字表自动收集，缺字写报告 font-report/missing-glyphs.json 并失败）
 * - 守卫：game.js 不得出现 `document.` / `window.`
 * 上传私钥不在这里读：CI 上传（W8）只从 Actions secret WX_UPLOAD_PRIVATE_KEY 读取，不进仓库、不打日志。
 * 用法：tsx scripts/build-wechat.ts [dir=dist-wechat]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { walk } from './size-check';
import { CHARSET_FILE, charsetText, diffCharset, checkCoverage, collectGlyphs, formatMissing, readCmap, writeReport } from './font-glyphs';

export const DEFAULT_APPID = 'wx3dd635e3cc359d30';
export const APPID_ENV = 'WX_APPID';
/** 小游戏书法字体源（由 npm run font:build:wechat 生成并入库；CI 无源字体，只做覆盖检查） */
export const WECHAT_FONT_SRC = 'wechat-assets/fonts/wenkai.ttf';
export const FONT_DEST_DIR = 'assets/fonts';
export const GLYPH_REPORT = 'font-report/missing-glyphs.json';
const FORBIDDEN = [/\bdocument\./g, /\bwindow\./g];

type FontRole = 'system' | { family: string; faces?: { url: string; gate: boolean }[] };

/** 从 rules.yaml 读微信端要入包的字体路径（只拷 brush faces；sans: system 不拷） */
export function wechatFontPackageUrls(root: string): string[] {
  const rules = parse(readFileSync(join(root, 'config/rules.yaml'), 'utf8')) as {
    fonts: { platforms: { wechat: { brush: FontRole; sans: FontRole } } };
  };
  const brush = rules.fonts.platforms.wechat.brush;
  if (brush === 'system') return [];
  return (brush.faces ?? []).map((f) => f.url);
}

/** 包内路径 assets/fonts/xxx → 仓库源 wechat-assets/fonts/xxx */
export function wechatFontSource(packageUrl: string): string {
  const m = /^assets\/fonts\/(.+)$/.exec(packageUrl);
  if (!m) throw new Error(`微信字体包内路径须为 assets/fonts/...，收到：${packageUrl}`);
  return `wechat-assets/fonts/${m[1]}`;
}

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

  const urls = wechatFontPackageUrls(root);
  if (!urls.length) throw new Error('rules.fonts.platforms.wechat.brush 未配置 faces（微信端须加载书法字）');
  const glyphs = collectGlyphs(root);
  const manifest = join(root, CHARSET_FILE);
  const drift = diffCharset(existsSync(manifest) ? readFileSync(manifest, 'utf8') : '', charsetText(glyphs));
  if (drift) throw new Error(drift);

  for (const url of urls) {
    const srcRel = wechatFontSource(url);
    const font = join(root, srcRel);
    if (!existsSync(font)) throw new Error(`缺少微信字体 ${srcRel}（跑 npm run font:build:wechat 生成）`);
    const report = checkCoverage(glyphs, readCmap(readFileSync(font)), srcRel);
    writeReport(join(root, GLYPH_REPORT), report);
    if (report.missing.length) {
      throw new Error(`书法字体缺 ${report.missing.length} 个字形（报告 ${GLYPH_REPORT}，跑 npm run font:build:wechat 重新生成）：\n${formatMissing(report)}`);
    }
    const dest = join(dir, url);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(font, dest);
  }
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
