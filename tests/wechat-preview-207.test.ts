/** #207 CI 体验版预览：私钥缺失跳过、AppID 沿用配置、私钥不进仓库 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MPCI_VERSION, PRIVATE_KEY_ENV, normalizeKey, planPreview } from '../scripts/wechat-preview';
import { DEFAULT_APPID } from '../scripts/build-wechat';

const ROOT = resolve(import.meta.dirname, '..');

describe('#207 wechat-preview', () => {
  it('未配置私钥：跳过并给出明确提示', () => {
    const p = planPreview({}, 'dist-wechat', 'q.jpg', true);
    expect(p.kind).toBe('skip');
    expect(p.kind === 'skip' && p.reason).toContain(PRIVATE_KEY_ENV);
    expect(planPreview({ [PRIVATE_KEY_ENV]: '  ' }, 'd', 'q', true).kind).toBe('skip');
  });
  it('有私钥：AppID 默认 wx3dd635e3cc359d30，描述带分支与提交；计划里不含私钥', () => {
    const p = planPreview({ [PRIVATE_KEY_ENV]: 'SECRET', GITHUB_SHA: 'abcdef123', GITHUB_REF_NAME: 'main' }, 'dist-wechat', 'q.jpg', true);
    expect(p).toMatchObject({ kind: 'run', appid: DEFAULT_APPID, desc: 'CI main@abcdef1', robot: 1 });
    expect(JSON.stringify(p)).not.toContain('SECRET');
    expect(planPreview({ [PRIVATE_KEY_ENV]: 'k' }, 'd', 'q', false).kind).toBe('skip');
  });
  it('私钥里的字面 \\n 还原为换行', () => {
    expect(normalizeKey('-----BEGIN KEY-----\\nabc\\n-----END KEY-----')).toBe('-----BEGIN KEY-----\nabc\n-----END KEY-----\n');
  });
  it('workflow：只从 secret 读私钥，缺失时跳过，产出 artifact，版本与脚本一致', () => {
    const y = readFileSync(resolve(ROOT, '.github/workflows/wechat-preview.yml'), 'utf8');
    expect(y).toContain('secrets.WX_UPLOAD_PRIVATE_KEY');
    expect(y).toContain("env.HAS_WX_KEY != 'true'");
    expect(y).toContain('upload-artifact');
    expect(y).toContain(`miniprogram-ci@${MPCI_VERSION}`);
    expect(y).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
  });
});
