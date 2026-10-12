/* 用法：npm run config:check（只校验）/ npm run config:build（校验并生成 src/data/generated/config.json） */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config-lib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { config, errors } = loadConfig(resolve(root, 'config'));
if (errors.length) {
  console.error(`✘ 配置校验失败（${errors.length} 处）：`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
const n = Object.keys(config.cards).length + config.affixes.length + Object.keys(config.heroes).length + Object.keys(config.enemies).length;
console.log(
  `✔ 配置校验通过：卡牌 ${Object.keys(config.cards).length}、词条 ${config.affixes.length}、武将 ${Object.keys(config.heroes).length}、敌人 ${Object.keys(config.enemies).length}（共 ${n} 项）`,
);
if (!process.argv.includes('--check')) {
  const out = resolve(root, 'src/data/generated/config.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(config) + '\n');
  console.log('→ ' + out.replace(root + '/', ''));
}
