import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** 分层约束（engine-design §3）：core 不依赖 engine/platform；engine 不依赖 core/data/platform 实现，也不直接访问平台全局对象 */
const layer = (patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });
/** M2-W1 #200：平台无关层禁止直接引用的浏览器 / 微信全局（必须经 Platform 注入）；wechat-minigame-m2.md §3.1「守卫」 */
const PLATFORM_GLOBALS = ['window', 'document', 'localStorage', 'performance', 'wx', 'matchMedia'].map((name) => ({
  name,
  message: `平台无关层（src/{core,engine,game,data}）不得直接使用 ${name}，请经 Platform 注入（wechat-minigame-m2.md §3.1）`,
}));

export default tseslint.config(
  { ignores: ['dist', 'dist-debug', 'dist-wechat', '_site', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['src/core/**/*.ts'],
    rules: layer([{ group: ['**/engine/**', '**/platform/**'], message: 'core 不得依赖 engine / platform（engine-design §3）' }]),
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      ...layer([
        { group: ['**/core/**', '**/data/**'], message: 'engine 不得依赖业务逻辑（engine-design §3）' },
        { group: ['**/platform/web/**', '**/platform/wechat/**'], message: 'engine 只能依赖 platform/types' },
      ]),
      'no-restricted-globals': ['error', ...PLATFORM_GLOBALS, 'navigator', 'location'],
    },
  },
  {
    files: ['src/core/**/*.ts', 'src/game/**/*.ts', 'src/data/**/*.ts'],
    rules: { 'no-restricted-globals': ['error', ...PLATFORM_GLOBALS] },
  },
  {
    // 堵住 globalThis.localStorage 这类绕行写法（#200 前 save.ts 就是这样取默认存储的）
    files: ['src/{core,engine,game,data}/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', ...PLATFORM_GLOBALS.map(({ name, message }) => ({ object: 'globalThis', property: name, message }))],
    },
  },
  {
    // M2-W2 #201：两端共用启动流程不得依赖具体平台实现
    files: ['src/game/boot.ts'],
    rules: {
      ...layer([{ group: ['**/platform/web/**', '**/platform/wechat/**'], message: 'game/boot.ts 只能依赖 platform/types（#201）' }]),
      'no-restricted-globals': ['error', ...PLATFORM_GLOBALS, 'location'],
    },
  },
  {
    files: ['src/platform/web/**/*.ts'],
    ignores: ['src/platform/web/debug/**'],
    rules: layer([{ group: ['**/debug/**'], message: '发布入口不得引用 DOM 调试版' }]),
  },
);
