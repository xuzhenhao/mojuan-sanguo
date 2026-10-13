/* 用法：npm run boss-sim -- [--enemies B1] [--n 300] [--seed 777] [--out report.md]：8 将（roster）对指定遭遇满血单场胜率 */
import { writeFileSync } from 'node:fs';
import { encounterBatch } from '../src/sim/autoplay';
import { CONFIG } from '../src/data/config';

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const enemies = arg('enemies', 'B1')!.split(',');
const n = Number(arg('n', '300'));
const seed = Number(arg('seed', '777'));
const pct = (x: number) => (x * 100).toFixed(1) + '%';
const rows: string[] = [];
let sum = 0;
const heroes = Object.values(CONFIG.heroes).filter((h) => h.roster !== false);
for (const h of heroes) {
  const r = await encounterBatch(enemies, n, seed, { main: h.id });
  sum += r.winRate;
  const sub = CONFIG.heroes[r.heroes.sub!]?.name ?? r.heroes.sub;
  rows.push(
    `| ${h.name}（${h.id}）+ ${sub} | ${pct(r.winRate)} | ${pct(1 - r.winRate)} | ${r.timeouts} | ${pct(r.hpLossMedianPct)} | ${pct(r.le3Rate)} | ${r.turnsMedian} |`,
  );
}
const md = [
  `# 单场 [${enemies.join(', ')}] 满血入场（hero AI，每将 ${n} 局，种子基 ${seed}）`,
  '',
  '| 主将 + 副将 | 胜率 | 败率（含超时） | 超时 | 掉血中位 | 胜且 ≤3 体力 | 回合中位 |',
  '|---|---|---|---|---|---|---|',
  ...rows,
  `| **八将平均** | **${pct(sum / heroes.length)}** | ${pct(1 - sum / heroes.length)} | | | | |`,
].join('\n');
console.log(md);
const out = arg('out');
if (out) writeFileSync(out, md + '\n');
