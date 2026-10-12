/* 用法：npm run autoplay -- [--n 200] [--seed 12345] [--out report.md] [--json out.json] [--title 标题] */
import { writeFileSync } from 'node:fs';
import { batch, report } from '../src/sim/autoplay';

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const n = Number(arg('n', '200'));
const seed = Number(arg('seed', String(Date.now() % 1e9)));
const r = await batch(n, seed);
const md = report(arg('title', `自动试玩统计（每战 ${n} 场，随机种子基 ${seed}）`)!, r.per, r.ch);
console.log(md);
const out = arg('out');
if (out) writeFileSync(out, md + '\n');
const js = arg('json');
if (js) writeFileSync(js, JSON.stringify(r, null, 2));
