/** #173 宝物与丹药定义挪进 config/relics、config/potions；局外效果参数化，去掉 id 特判 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../scripts/config-lib';
import { CONFIG, relicEffect } from '../src/data/config';
import { POTIONS, RELICS } from '../src/data/economy';
import { applyMods } from '../src/game/economy/pools';
import { restRelicBonus } from '../src/core/run/rest';
import { ONE_SHOT_RELICS } from '../src/game/run/state';

const ROOT = resolve(__dirname, '../config');
const withEdit = (file: string, edit: (s: string) => string) => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg173-'));
  try {
    cpSync(ROOT, dir, { recursive: true });
    const p = join(dir, file);
    writeFileSync(p, edit(readFileSync(p, 'utf8')));
    return loadConfig(dir).errors.join('\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
/** 搬迁前 economy.ts 里写死的表（原样抄录，保证值不变） */
const OLD = readFileSync(resolve(__dirname, 'fixtures/economy-173-before.ts.txt'), 'utf8');
const oldRelics = [...OLD.matchAll(/\{ id: '(R\d\d)', name: '([^']+)', rarity: '(\w+)', desc: '([^']+)' \}/g)].map((m) => ({
  id: m[1],
  name: m[2],
  rarity: m[3],
  desc: m[4],
}));
const oldPotions = [...OLD.matchAll(/\{ id: '(P\d\d)', name: '([^']+)', desc: '([^']+)', price: (\d+) \}/g)].map((m) => ({
  id: m[1],
  name: m[2],
  desc: m[3],
  price: +m[4],
}));

describe('#173 宝物 / 丹药定义来自 config', () => {
  it('31 件宝物、10 种丹药，id/名/稀有度/描述/价格与搬迁前一致且顺序不变', () => {
    expect(oldRelics).toHaveLength(31);
    expect(oldPotions).toHaveLength(10);
    expect(RELICS.map(({ id, name, rarity, desc }) => ({ id, name, rarity, desc }))).toEqual(oldRelics);
    expect(POTIONS).toEqual(oldPotions);
  });
  it('参数化效果与原特判数值一致', () => {
    expect(CONFIG.relics.R04.effects).toEqual({ goldBonus: 10 });
    expect(CONFIG.relics.R29.effects).toEqual({ eliteGoldBonus: 20 });
    expect(CONFIG.relics.R09.effects).toEqual({ shopDiscount: 0.2 });
    expect(CONFIG.relics.R20.effects).toEqual({ shopPotionSlots: 1 });
    expect(CONFIG.relics.R03.effects).toEqual({ restHeal: 2 });
    expect(ONE_SHOT_RELICS).toEqual(['R15']);
    expect(RELICS.filter((r) => r.effects).map((r) => r.id)).toEqual(['R03', 'R04', 'R09', 'R20', 'R29']);
  });
  it('relicEffect 求和、未知 id 忽略；改配置即改效果', () => {
    expect(relicEffect(['R04', 'R29', 'R99'], 'goldBonus')).toBe(10);
    expect(restRelicBonus(['R03', 'R10'])).toBe(2);
    expect(applyMods(100, { relics: ['R09'], destiny: 0 })).toBe(80);
    const e = CONFIG.relics.R09.effects!;
    e.shopDiscount = 0.5;
    try {
      expect(applyMods(100, { relics: ['R09'], destiny: 0 })).toBe(50);
    } finally {
      e.shopDiscount = 0.2;
    }
  });
  it('游戏代码里不再按宝物 id 特判', () => {
    for (const f of ['game/economy/reward.ts', 'game/economy/pools.ts', 'game/economy/shop.ts', 'game/run/state.ts', 'core/run/rest.ts'])
      expect(readFileSync(resolve(__dirname, '../src', f), 'utf8'), f).not.toMatch(/'R\d\d'|\bR\d\d:/);
  });
});

describe('#173 schema 严格校验', () => {
  it('当前配置通过', () => {
    expect(withEdit('relics/R01.yaml', (s) => s)).toBe('');
  });
  it('宝物：非法稀有度 / 未知字段 / 未知效果 / 折扣越界 都报错', () => {
    expect(withEdit('relics/R01.yaml', (s) => s.replace('rarity: R', 'rarity: X'))).toMatch(/relics\/R01/);
    expect(withEdit('relics/R01.yaml', (s) => s + 'foo: 1\n')).toMatch(/additional/);
    expect(withEdit('relics/R04.yaml', (s) => s.replace('goldBonus', 'goldBonuz'))).toMatch(/relics\/R04/);
    expect(withEdit('relics/R09.yaml', (s) => s.replace('0.2', '1.5'))).toMatch(/shopDiscount/);
  });
  it('丹药：缺价格 / 价格非整数 都报错；id 重复报错', () => {
    expect(withEdit('potions/P01.yaml', (s) => s.replace(/^price.*\n/m, ''))).toMatch(/price/);
    expect(withEdit('potions/P01.yaml', (s) => s.replace('price: 50', 'price: 50.5'))).toMatch(/price/);
    expect(withEdit('potions/P02.yaml', (s) => s.replace('id: P02', 'id: P01'))).toMatch(/重复 P01/);
  });
  it('业务校验：没有 Boss 级宝物时报错', () => {
    expect(withEdit('relics/R02.yaml', (s) => s.replace('rarity: Boss', 'rarity: E'))).toMatch(/Boss 级/);
  });
});
