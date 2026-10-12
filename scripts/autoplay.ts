/* 用法：npm run autoplay -- [--hero H03] [--sub H04] [--preset legacy_guanyu_zhaoyun] [--ai hero|greedy] [--n 200] [--seed 12345] [--out report.md] [--json out.json] [--title 标题] */
import { writeFileSync } from 'node:fs';
import { batch, report } from '../src/sim/autoplay';

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const n = Number(arg('n', '200'));
const seed = Number(arg('seed', String(Date.now() % 1e9)));
const r = await batch(n, seed, { main: arg('hero'), sub: arg('sub'), preset: arg('preset'), ai: arg('ai', 'hero') as 'hero' | 'greedy' });
const who =
  `AI ${r.heroes.ai ?? 'hero'}；` + (r.heroes.preset ? `预设 ${r.heroes.preset}` : `主将 ${r.heroes.main ?? '默认'} / 副将 ${r.heroes.sub ?? '默认'}`);
const md = report(arg('title', `自动试玩统计（${who}；每战 ${n} 场，随机种子基 ${seed}）`)!, r.per, r.ch);
console.log(md);
const out = arg('out');
if (out) writeFileSync(out, md + '\n');
const js = arg('json');
if (js) writeFileSync(js, JSON.stringify(r, null, 2));
