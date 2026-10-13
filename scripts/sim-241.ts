/* #241 sim 复测表：npm run sim:241 -- [--n 200] [--seed 777] [--all-heroes] [--out report.md]
 * 两种留闪（legacy/budget）× 奖励（不拿 / 拿·不含循环 / 拿·含循环）：
 * 第 1 章通关率（天命 0，含复活）、不含复活、天命 5 整局（无复活）、平均每回合主动牌、期末循环牌数 */
import { writeFileSync } from 'node:fs';
import { CONFIG } from '../src/data/config';
import { K0, PAIRS, mapBatch, type MapRunOpts } from '../src/sim/map-run';

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const n = Number(arg('n', '200'));
const seed = Number(arg('seed', '777'));
const pairs: [string, string | undefined][] = process.argv.includes('--all-heroes')
  ? PAIRS
  : [[CONFIG.rules.defaultHeroes.main, CONFIG.rules.defaultHeroes.sub]];
const pct = (x: number) => (x * 100).toFixed(1) + '%';
const cases: [string, MapRunOpts][] = [
  ['不拿奖励', { rewards: false }],
  ['拿奖励·不含循环牌', { rewards: true, noLoop: true }],
  ['拿奖励·含循环牌', { rewards: true }],
];
const md = [`# #241 sim 复测（种子基 ${seed}，每组 ${n} 局 × ${pairs.length} 组武将，k=0，第 1 章地图模式）`, ''];
for (const mode of ['legacy', 'budget'] as const) {
  md.push(
    `## 留闪 ${mode}`,
    '',
    '| 口径 | 第1章通关率(天命0) | 不含复活 | 天命5整局(无复活) | 平均每回合主动牌 | 期末循环牌/牌组 |',
    '|---|---|---|---|---|---|',
  );
  for (const [label, o] of cases) {
    const acc = { clear: 0, noRv: 0, tm5: 0, ppt: 0, loop: 0, deck: 0 };
    for (const [main, sub] of pairs) {
      const a = await mapBatch(n, seed, { main, sub }, K0, { ...o, shan: { mode } });
      const b = await mapBatch(n, seed, { main, sub }, K0, { ...o, shan: { mode }, tianming: 5 });
      acc.clear += a.clear;
      acc.noRv += a.clearNoRevive;
      acc.tm5 += b.clear;
      acc.ppt += a.playsPerTurn;
      acc.loop += a.loopInDeck;
      acc.deck += a.deckSize;
    }
    const k = pairs.length;
    md.push(
      `| ${label} | ${pct(acc.clear / k)} | ${pct(acc.noRv / k)} | ${pct(acc.tm5 / k)} | ${(acc.ppt / k).toFixed(2)} | ${(acc.loop / k).toFixed(2)}/${(acc.deck / k).toFixed(1)} |`,
    );
  }
  md.push('');
}
const out = md.join('\n');
console.log(out);
const o = arg('out');
if (o) writeFileSync(o, out + '\n');
