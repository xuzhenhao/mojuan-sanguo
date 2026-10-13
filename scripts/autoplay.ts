/* 用法：npm run autoplay -- [--hero H03] [--sub H04] [--preset legacy_guanyu_zhaoyun] [--ai hero|greedy] [--n 200] [--seed 12345] [--out report.md] [--json out.json] [--title 标题]；整章地图模式：--mode map [--all-heroes] [--k 0|spec|both] [--baseline] */
import { writeFileSync } from 'node:fs';
import { batch, pickSub, report } from '../src/sim/autoplay';
import { ALL_HEROES, ASSUMPTIONS, COEF_SPEC, COEF_ZERO, mapBatch, mapReport, threeBattleBaseline, type MapBatchRow } from '../src/sim/map-mode';

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const n = Number(arg('n', '200'));
const seed = Number(arg('seed', String(Date.now() % 1e9)));
if (arg('mode') === 'map') {
  // docs/specs/sim-map-mode.md：npm run autoplay -- --mode map [--hero H05 --sub H06] [--n 200] [--seed 777] [--all-heroes] [--k 0|spec|both]
  const hero = arg('hero');
  const combos: [string, string][] = process.argv.includes('--all-heroes') ? ALL_HEROES : [[hero ?? 'H05', arg('sub') ?? (hero ? pickSub(hero) : 'H06')]];
  const ks = arg('k', 'both')!;
  const parts: string[] = [`# 整章地图模式（sim-map-mode v0.1；每组 ${n} 局，种子 ${seed}）`];
  const json: Record<string, MapBatchRow[]> = {};
  for (const [label, coef] of [
    ['k=0（不计奖励）', COEF_ZERO],
    ['第 5 节系数', COEF_SPEC],
  ] as const) {
    if ((ks === '0' && coef !== COEF_ZERO) || (ks === 'spec' && coef !== COEF_SPEC)) continue;
    const rows: MapBatchRow[] = [];
    for (const [main, sub] of combos) rows.push(await mapBatch(n, seed, { main, sub, coef }));
    json[label] = rows;
    parts.push('', mapReport(label, rows));
  }
  if (process.argv.includes('--baseline')) {
    const b: string[] = [];
    for (const [main, sub] of combos) b.push(`${main}+${sub} ${(100 * (await threeBattleBaseline(n, seed, { main, sub }))).toFixed(1)}%`);
    parts.push('', `三战制回 0 基线（同种子）：${b.join('，')}`);
  }
  parts.push('', '实现补充假设：', ...ASSUMPTIONS.map((a) => `- ${a}`));
  const md = parts.join('\n');
  console.log(md);
  const out = arg('out');
  if (out) writeFileSync(out, md + '\n');
  const js = arg('json');
  if (js) writeFileSync(js, JSON.stringify(json, null, 2));
  process.exit(0);
}
const r = await batch(n, seed, { main: arg('hero'), sub: arg('sub'), preset: arg('preset'), ai: arg('ai', 'hero') as 'hero' | 'greedy' });
const who =
  `AI ${r.heroes.ai ?? 'hero'}；` + (r.heroes.preset ? `预设 ${r.heroes.preset}` : `主将 ${r.heroes.main ?? '默认'} / 副将 ${r.heroes.sub ?? '默认'}`);
const md = report(arg('title', `自动试玩统计（${who}；每战 ${n} 场，随机种子基 ${seed}）`)!, r.per, r.ch);
console.log(md);
const out = arg('out');
if (out) writeFileSync(out, md + '\n');
const js = arg('json');
if (js) writeFileSync(js, JSON.stringify(r, null, 2));
