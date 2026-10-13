/** #172 经济数值表挪进 config/rules.yaml economy:（代码只读配置） */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../scripts/config-lib';
import { CONFIG } from '../src/data/config';
import { ECONOMY } from '../src/data/economy';

const ROOT = resolve(__dirname, '../config');
const withEdit = (edit: (s: string) => string) => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg172-'));
  try {
    cpSync(ROOT, dir, { recursive: true });
    const p = join(dir, 'rules.yaml');
    writeFileSync(p, edit(readFileSync(p, 'utf8')));
    return loadConfig(dir).errors.join('\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe('#172 rules.economy', () => {
  it('ECONOMY 与搬迁前写死的值完全一致', () => {
    expect(ECONOMY).toEqual({
      startGold: 60,
      potionSlots: 3,
      battleGold: {
        normal: [
          [15, 25],
          [25, 35],
          [35, 45],
        ],
        elite: [
          [40, 55],
          [55, 70],
          [70, 90],
        ],
        boss: [
          [80, 80],
          [100, 100],
          [120, 120],
        ],
      },
      cardRarity: [
        { N: 55, R: 35, E: 9, L: 1 },
        { N: 40, R: 40, E: 16, L: 4 },
        { N: 30, R: 40, E: 22, L: 8 },
      ],
      eliteHighMul: 1.5,
      factionMul: 1.5,
      potionDrop: { normal: 0.25, elite: 0.4, boss: 0 },
      relicRarity: { N: 50, R: 40, E: 10 },
      bossRelicPool: 'Boss',
      bossRelicFill: 'E',
      relicPrice: { N: 70, R: 100, E: 140 },
      priceJitter: 0.1,
      priceRound: 5,
      removeBase: 50,
      removeStep: 25,
      shopRefresh: 25,
      shopFreeRefresh: 1,
      shopSlots: { common: 2, heroCard: 1, relic: 1, potion: 2 },
      minDeck: 8,
      chestRelicChance: 0.75,
      chestGold: [50, 80],
      chestRelicRarity: { N: 50, R: 40, E: 10 },
      destinyShopMarkup: 0.2,
    });
  });
  it('每个经济字段都来自 config（economy: 或 shop:）', () => {
    const eco = CONFIG.rules.economy as unknown as Record<string, unknown>;
    for (const k of Object.keys(eco)) expect(ECONOMY[k as keyof typeof ECONOMY]).toEqual(eco[k]);
    expect(ECONOMY.removeBase).toBe(CONFIG.rules.shop!.removeBase);
  });
  it('economy.ts 里不再有写死的经济数字', () => {
    const src = readFileSync(resolve(__dirname, '../src/data/economy.ts'), 'utf8');
    const body = src.slice(src.indexOf('export const ECONOMY'));
    expect(body).not.toMatch(/:\s*\d/);
  });
  it('当前配置通过校验', () => {
    expect(withEdit((s) => s)).toBe('');
  });
  it('schema：缺字段 / 越界 / 非法稀有度都报错', () => {
    expect(withEdit((s) => s.replace(/^ {2}startGold: 60.*\n/m, ''))).toMatch(/startGold/);
    expect(withEdit((s) => s.replace('chestRelicChance: 0.75', 'chestRelicChance: 1.5'))).toMatch(/chestRelicChance/);
    expect(withEdit((s) => s.replace('bossRelicFill: E', 'bossRelicFill: X'))).toMatch(/bossRelicFill/);
    expect(withEdit((s) => s.replace('chestGold: [50, 80]', 'chestGold: [50]'))).toMatch(/chestGold/);
  });
});
