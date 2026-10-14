/**
 * 小游戏体验版预览二维码（#207 / M2 W8）：`npm run build:wechat` 之后用 miniprogram-ci 出 preview 二维码。
 * - 私钥只从环境变量 WX_UPLOAD_PRIVATE_KEY 读（CI 里由 Actions secret 注入），不落盘、不打日志、不进仓库。
 * - 未配置私钥时打印明确提示并以 0 退出（跳过，不让 CI 失败）。
 * - AppID 沿用 build-wechat 的 resolveAppId（默认 wx3dd635e3cc359d30，可用 WX_APPID 覆盖）。
 * - miniprogram-ci 不进 package.json（体积大且只在预览 job 用），workflow 里临时 `npm i --no-save` 安装。
 * 用法：tsx scripts/wechat-preview.ts [dir=dist-wechat] [out=wechat-preview/qrcode.jpg]
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAppId } from './build-wechat';

export const PRIVATE_KEY_ENV = 'WX_UPLOAD_PRIVATE_KEY';
export const MPCI_VERSION = '2.1.31';

export type PreviewPlan =
  { kind: 'skip'; reason: string } | { kind: 'run'; appid: string; projectPath: string; qrcodeOutputDest: string; desc: string; robot: number };

/** 纯函数：根据环境决定跳过还是预览（便于单测；不返回私钥本身） */
export function planPreview(env: Record<string, string | undefined>, dir: string, out: string, distExists: boolean): PreviewPlan {
  if (!env[PRIVATE_KEY_ENV]?.trim()) {
    return { kind: 'skip', reason: `未配置 Actions secret ${PRIVATE_KEY_ENV}，跳过体验版预览（仓库 Settings → Secrets and variables → Actions 添加后重跑）` };
  }
  if (!distExists) return { kind: 'skip', reason: `${dir}/game.js 不存在，先跑 npm run build:wechat` };
  const sha = (env.GITHUB_SHA ?? 'local').slice(0, 7);
  const ref = env.GITHUB_REF_NAME ?? 'local';
  return { kind: 'run', appid: resolveAppId(env), projectPath: dir, qrcodeOutputDest: out, desc: `CI ${ref}@${sha}`, robot: 1 };
}

/** 私钥规范化：secret 里换行可能被写成字面 \n */
export const normalizeKey = (k: string) => (k.includes('BEGIN') && !k.includes('\n') ? k.replace(/\\n/g, '\n') : k).trim() + '\n';

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = resolve(root, process.argv[2] ?? 'dist-wechat');
  const out = resolve(root, process.argv[3] ?? 'wechat-preview/qrcode.jpg');
  const plan = planPreview(process.env, dir, out, existsSync(resolve(dir, 'game.js')));
  if (plan.kind === 'skip') {
    console.log(`::notice title=体验版预览已跳过::${plan.reason}`);
    return;
  }
  // 动态 import：本地 / 主 CI 未安装 miniprogram-ci 时不影响类型检查与其它脚本
  const ci = (await import('miniprogram-ci' as string)) as {
    Project: new (o: Record<string, unknown>) => unknown;
    preview(o: Record<string, unknown>): Promise<unknown>;
  };
  const project = new ci.Project({
    appid: plan.appid,
    type: 'miniGame',
    projectPath: plan.projectPath,
    privateKey: normalizeKey(process.env[PRIVATE_KEY_ENV]!),
    ignores: ['node_modules/**/*'],
  });
  mkdirSync(dirname(plan.qrcodeOutputDest), { recursive: true });
  await ci.preview({
    project,
    desc: plan.desc,
    robot: plan.robot,
    setting: { es6: false, minify: false },
    qrcodeFormat: 'image',
    qrcodeOutputDest: plan.qrcodeOutputDest,
  });
  console.log(`✔ 预览二维码：${plan.qrcodeOutputDest}（appid ${plan.appid}，${plan.desc}）`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    // 只打 message，避免把请求体等带出
    console.error(`✘ 体验版预览失败：${(e as Error)?.message ?? String(e)}`);
    process.exit(1);
  });
}
