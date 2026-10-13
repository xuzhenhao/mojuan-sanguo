/**
 * M2-W1 #200：平台泄漏守卫。
 * - src/{core,engine,game,data} 引用 window/document/localStorage/performance/wx 时 ESLint 必须报错；
 * - platform/web 不受限；
 * - 存档层无默认 localStorage，战斗时钟不碰 performance，hpview 只要求 {load():Promise}。
 */
import { describe, expect, it, afterEach } from 'vitest';
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RUN_SAVE_KEY, runSaveStore, setRunSaveStore } from '../src/core/run/save';
import { refitAfterBrush, type FontLoader } from '../src/game/scenes/battle/hpview';

const ROOT = resolve(__dirname, '..');
const GLOBALS = ['window', 'document', 'localStorage', 'performance', 'wx'] as const;
const LAYERS = ['core', 'engine', 'game', 'data'] as const;
const eslint = new ESLint({ cwd: ROOT });
const lint = async (code: string, file: string) => (await eslint.lintText(code, { filePath: resolve(ROOT, file) }))[0].messages;
const restricted = (msgs: { ruleId: string | null; message: string }[]) =>
  msgs.filter((m) => m.ruleId === 'no-restricted-globals' || m.ruleId === 'no-restricted-properties');

describe('#200 ESLint 平台全局守卫', () => {
  for (const layer of LAYERS)
    for (const g of GLOBALS)
      it(`src/${layer} 直接引用 ${g} → lint 失败`, async () => {
        const msgs = await lint(`export const x = ${g};\n`, `src/${layer}/__guard__.ts`);
        expect(restricted(msgs).length).toBeGreaterThan(0);
      });

  it('globalThis.localStorage 绕行写法同样被拦', async () => {
    const msgs = await lint('export const x = globalThis.localStorage;\n', 'src/core/__guard__.ts');
    expect(restricted(msgs).map((m) => m.ruleId)).toContain('no-restricted-properties');
  });

  it('platform/web 可正常使用浏览器全局', async () => {
    const msgs = await lint('export const x = [window, document, localStorage, performance];\n', 'src/platform/web/__guard__.ts');
    expect(restricted(msgs)).toEqual([]);
  });

  it('当前平台无关层源码零违规', async () => {
    const results = await eslint.lintFiles(LAYERS.map((l) => `src/${l}/**/*.ts`));
    expect(results.flatMap((r) => restricted(r.messages).map((m) => `${r.filePath}: ${m.message}`))).toEqual([]);
  });
}, 60_000);

describe('#200 泄漏清理', () => {
  afterEach(() => setRunSaveStore(undefined));

  it('save.ts 无默认 localStorage：未注入时 runSaveStore() 为 null', () => {
    setRunSaveStore(undefined);
    expect(runSaveStore()).toBeNull();
    expect(readFileSync(resolve(ROOT, 'src/core/run/save.ts'), 'utf8')).not.toMatch(/localStorage\s*[?:;)]|\.localStorage/);
  });

  it('注入后读写走注入的存储', () => {
    const m = new Map<string, string>();
    setRunSaveStore({ get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) });
    runSaveStore()!.set(RUN_SAVE_KEY, '1');
    expect(m.get(RUN_SAVE_KEY)).toBe('1');
  });

  it('battle/scene.ts 不再出现 performance.now', () => {
    expect(readFileSync(resolve(ROOT, 'src/game/scenes/battle/scene.ts'), 'utf8')).not.toContain('performance.now');
  });

  it('hpview 不依赖 FontFaceSet，任意 {load():Promise} 即可', async () => {
    expect(readFileSync(resolve(ROOT, 'src/game/scenes/battle/hpview.ts'), 'utf8')).not.toContain('FontFaceSet');
    const seen: string[] = [];
    const fonts: FontLoader = { load: (f) => (seen.push(f), Promise.resolve(null)) };
    let redraws = 0;
    await refitAfterBrush(fonts, () => redraws++);
    expect(seen).toEqual(['20px "Brush"']);
    expect(redraws).toBe(1);
    await refitAfterBrush({ load: () => Promise.reject(new Error('x')) }, () => redraws++);
    expect(redraws).toBe(1);
  });
});
