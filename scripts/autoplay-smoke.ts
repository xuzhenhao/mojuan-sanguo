/* CI 冒烟：固定种子小样本自动试玩，只拦明显回归（超时 / 崩溃 / 整章通关率塌方），不做平衡门槛。
 * 用法：npm run autoplay:smoke -- [--n 20] [--seed 20261013] [--min-clear 0.5] */
import { batch, report } from '../src/sim/autoplay';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const n = Number(arg('n', '20'));
const seed = Number(arg('seed', '20261013'));
const minClear = Number(arg('min-clear', '0.5'));
const r = await batch(n, seed);
console.log(report(`autoplay 冒烟（每战 ${n} 场，种子 ${seed}）`, r.per, r.ch));
const errs: string[] = [];
for (const { idx, s } of r.per) if (s.timeouts > 0) errs.push(`第 ${idx + 1} 战超时 ${s.timeouts} 场`);
const clear = r.ch.clear / r.ch.n;
if (clear < minClear) errs.push(`整章通关率 ${(clear * 100).toFixed(1)}% < ${minClear * 100}%`);
if (errs.length) {
  console.error('autoplay 冒烟失败：\n- ' + errs.join('\n- '));
  process.exit(1);
}
console.log(`autoplay 冒烟通过：整章通关率 ${(clear * 100).toFixed(1)}%，无超时`);
