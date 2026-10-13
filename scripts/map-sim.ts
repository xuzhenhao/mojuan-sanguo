/* 整章地图模式模拟。用法：npm run map-sim -- [--all] [--hero H05 --sub H06] [--n 200] [--seed 1] [--route random|safe] [--event-heal 1] [--out report.md] [--json out.json] */
import { writeFileSync } from 'node:fs';
import { CONFIG } from '../src/data/config';
import { mapBatch, mapReport, type MapBatchRow, type RoutePolicy } from '../src/sim/map-mode';
import { pickSub } from '../src/sim/autoplay';

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const has = (k: string) => process.argv.includes('--' + k);
const n = Number(arg('n', '200'));
const seed = Number(arg('seed', '1'));
const route = arg('route', 'random') as RoutePolicy;
const eventHeal = Number(arg('event-heal', '1'));
const combos: [string, string][] = has('all')
  ? Object.entries(CONFIG.heroes)
      .filter(([, h]) => h.roster !== false)
      .map(([id]) => [id, pickSub(id)])
  : [[arg('hero', CONFIG.rules.defaultHeroes.main)!, arg('sub') ?? pickSub(arg('hero', CONFIG.rules.defaultHeroes.main)!)]];
if (has('all') && !combos.some(([m, s]) => m === 'H05' && s === 'H06')) combos.push(['H05', 'H06']);
const rows: MapBatchRow[] = [];
for (const [main, sub] of combos) rows.push(await mapBatch(n, seed, { main, sub, route, eventHeal }));
const md = mapReport(`整章地图模式（选路 ${route}，奇遇折算 +${eventHeal}，每组 ${n} 局，种子 ${seed}）`, rows);
console.log(md);
const out = arg('out');
if (out) writeFileSync(out, md + '\n');
const js = arg('json');
if (js) writeFileSync(js, JSON.stringify(rows, null, 2));
