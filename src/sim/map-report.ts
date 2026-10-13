/** `npm run autoplay -- --mode map`：整章地图模式报告（sim-map-mode.md §7） */
import { writeFileSync } from 'node:fs';
import { CONFIG } from '../data/config';
import { K0, K_PLACEHOLDER, PAIRS, mapBatch, type RewardCoef } from './map-run';

const EXPECT: Record<string, number> = { BATTLE: 3.6, ELITE: 0.7, EVENT: 1.2, SHOP: 0.76, CHEST: 0.48, REST: 1.28 };
const pct = (x: number) => (x * 100).toFixed(1) + '%';

export async function mapMain(arg: (k: string, d?: string) => string | undefined) {
  const n = Number(arg('n', '200'));
  const seed = Number(arg('seed', '777'));
  const all = process.argv.includes('--all-heroes');
  /** --tianming N：天命档（≥5 不复活） */
  const tianming = Number(arg('tianming', '0'));
  const pairs: [string, string | undefined][] = all ? PAIRS : [[arg('hero', CONFIG.rules.defaultHeroes.main)!, arg('sub')]];
  const kArg = arg('k', 'both');
  const versions: [string, RewardCoef][] = [];
  if (kArg !== 'placeholder') versions.push(['k=0（不计奖励）', K0]);
  if (kArg !== '0') versions.push(['占位系数（§5）', K_PLACEHOLDER]);
  const md: string[] = [`# 整章地图模式（sim-map-mode v0.1 最小版；每将 ${n} 局，种子基 ${seed}，天命 ${tianming}）`, ''];
  for (const [label, coef] of versions) {
    const rows = [];
    for (const [main, sub] of pairs) rows.push({ main, sub, r: await mapBatch(n, seed, { main, sub }, coef, { tianming }) });
    const mean = rows.reduce((a, x) => a + x.r.clear, 0) / rows.length;
    md.push(
      `## ${label}`,
      '',
      '| 主将 + 副将 | 通关率 | 不含复活 | 偏差 | Boss 入场体力中位 | Boss 前铜钱中位 | 死亡层分布 |',
      '|---|---|---|---|---|---|---|',
    );
    for (const { main, sub, r } of rows) {
      const d = r.clear - mean;
      const dev = (d >= 0 ? '+' : '') + (d * 100).toFixed(1) + '%';
      const nm = (id?: string) => (id ? (CONFIG.heroes[id]?.name ?? id) : '默认');
      const deaths =
        Object.entries(r.deaths)
          .map(([l, c]) => `L${l}:${c}`)
          .join(' ') || '—';
      md.push(
        `| ${nm(main)} + ${nm(sub)} | ${pct(r.clear)} | ${pct(r.clearNoRevive)} | ${Math.abs(d) > 0.1 ? `**${dev}**` : dev} | ${r.bossHpMedian} | ${r.goldMedian} | ${deaths} |`,
      );
    }
    md.push(`| **均值** | **${pct(mean)}** | | | | | |`, '');
    const nodes: Record<string, number> = {};
    for (const { r } of rows) for (const [t, v] of Object.entries(r.nodes)) nodes[t] = (nodes[t] ?? 0) + v / rows.length;
    md.push(
      '节点次数（实际 / 期望 §10.4）：' +
        Object.entries(EXPECT)
          .map(([t, e]) => {
            const v = nodes[t] ?? 0;
            const s = `${t} ${v.toFixed(2)}/${e}`;
            return Math.abs(v - e) / e > 0.3 ? `**${s}**` : s;
          })
          .join('，'),
      '',
    );
  }
  const out = md.join('\n');
  console.log(out);
  const o = arg('out');
  if (o) writeFileSync(o, out + '\n');
}
