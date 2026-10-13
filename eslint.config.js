import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** 分层约束（engine-design §3）：core 不依赖 engine/platform；engine 不依赖 core/data/platform 实现，也不直接访问平台全局对象 */
const layer = (patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });

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
      'no-restricted-globals': ['error', 'window', 'document', 'wx', 'localStorage', 'navigator', 'location'],
    },
  },
  {
    files: ['src/platform/web/**/*.ts'],
    ignores: ['src/platform/web/debug/**'],
    rules: layer([{ group: ['**/debug/**'], message: '发布入口不得引用 DOM 调试版' }]),
  },
);
