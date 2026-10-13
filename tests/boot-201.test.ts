/** M2-W2 #201：game/boot.ts 两端共用启动流程 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { DEFAULT_RENDER_CONFIG } from '../src/engine/settings';
import { bootGame } from '../src/game/boot';
import { PAGES } from '../src/game/flow';
import { fakePlatform } from './engine-fakes';

const ROOT = resolve(__dirname, '..');
const src = (f: string) => readFileSync(resolve(ROOT, f), 'utf8');
const cfg = { ...DEFAULT_RENDER_CONFIG, webgl: false };

describe('#201 bootGame', () => {
  it('不 import 任何 platform/web|wechat 模块，也不碰 window/document/location', () => {
    const s = src('src/game/boot.ts');
    expect(s).not.toMatch(/from ['"][^'"]*platform\/(web|wechat)/);
    expect(s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')).not.toMatch(/\b(window|document|location)\b/);
  });

  it('web/entry 只做平台相关：创建平台 + 字体 + 调 bootGame，不再注册场景', () => {
    const s = src('src/platform/web/entry.ts');
    expect(s).toContain('bootGame(platform');
    expect(s).not.toMatch(/scenes\.register|new Router|new FlowMachine/);
  });

  it('ESLint：boot.ts 引 platform/web 时报错', async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const [r] = await eslint.lintText("import { createWebPlatform } from '../platform/web/platform';\nexport const x = createWebPlatform;\n", {
      filePath: resolve(ROOT, 'src/game/boot.ts'),
    });
    expect(r.messages.map((m) => m.ruleId)).toContain('no-restricted-imports');
  }, 30_000);

  it('假平台上启动：注册全部页面、字体门控首帧、返回调试句柄', async () => {
    const fp = fakePlatform({ query: { webgl: '0' } });
    let release!: () => void;
    let fontEngine: unknown;
    const g = bootGame(fp.p, {
      renderConfig: cfg,
      fonts: (engine) => ((fontEngine = engine), new Promise<void>((r) => (release = r))),
    });
    expect(fontEngine).toBe(g.engine);
    expect(g.engine.framesHeld).toBe(true);
    for (const p of [...PAGES, 'battle-overlay-demo']) expect(g.engine.scenes.has(p)).toBe(true);
    expect(Object.keys(g).sort()).toEqual(['economy', 'engine', 'flow', 'meta', 'resultBridge', 'router', 'run', 'slot'].sort());
    release();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(g.engine.framesHeld).toBe(false);
  });
});
