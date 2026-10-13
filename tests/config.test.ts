import { cpSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../scripts/config-lib';
import { CONFIG } from '../src/data/config';
import * as cards from '../src/data/cards';
import * as affixes from '../src/data/affixes';
import * as heroes from '../src/data/heroes';

const ROOT = resolve(__dirname, '../config');

describe('V1 数值（design-v1 第 7 节定稿）', () => {
  it('开局 8 将全免费，关羽 H09 保留不进开局', () => {
    expect(heroes.ROSTER).toEqual(['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08']);
    expect(CONFIG.heroes.H09.roster).toBe(false);
    expect(CONFIG.heroes.H09.combos!.find((c) => c.name === '龙虎会')!.enabled).toBe(false);
  });
  it('rules 机制与检查', () => {
    expect(CONFIG.rules.mechanics).toEqual({ judgeSource: 'pool', passiveQuotaPerEnemyTurn: 2, moying: false, zeroCostPerTurn: 1 });
    expect(CONFIG.rules.starterDeck).toBe('hero');
    expect(CONFIG.rules.sim.baselineBetweenBattleHeal).toBe(1);
    expect(CONFIG.rules.map.betweenBattleHeal).toBe(0);
  });
  it('每将起始牌组 12 张，红 50%', () => {
    for (const id of heroes.ROSTER) {
      const d = CONFIG.heroes[id].starterDeck;
      expect(d.length).toBe(12);
      expect(d.filter((c) => c.suit === 'H' || c.suit === 'D').length).toBe(6);
    }
  });
  it('第 1 章：波才为停用占位、张角已启用（design-v1 10.7）；闪电 D003 统一定义，张角覆盖 2', () => {
    expect(CONFIG.enemies.E1E2.enabled).toBe(false);
    expect(CONFIG.enemies.B1.enabled).toBe(true);
    expect(CONFIG.enemies.B1.trickOverrides).toEqual({ D003: { amount: 2 } });
    expect(cards.CARDS.D003.cost).toBe(1);
  });
  it('锋锐升 R 且同牌组最多 2 张', () => {
    const f = affixes.AFFIXES.find((a) => a.id === 'E_S01')!;
    expect(f.r).toBe('R');
    expect(f.maxPerDeck).toBe(2);
  });
});

describe('config:check 校验', () => {
  let dir = '';
  const broken = (file: string, edit: (s: string) => string) => {
    dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    cpSync(ROOT, dir, { recursive: true });
    const p = join(dir, file);
    writeFileSync(p, edit(readFileSync(p, 'utf8')));
    return loadConfig(dir).errors;
  };
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it('仓库配置全部通过', () => expect(loadConfig(ROOT).errors).toEqual([]));
  it('Schema：体力超上限被拦下', () => {
    expect(broken('heroes/H09-guanyu.yaml', (s) => s.replace('hp: 8', 'hp: 18')).join('\n')).toMatch(/H09-guanyu.yaml: \/hp must be <= 10/);
  });
  it('Schema：单回合意图超过 3 张被拦下', () => {
    expect(broken('enemies/ch1/E101-buzu.yaml', (s) => s.replace('[杀, 杀]', '[杀, 杀, 杀, 杀]')).join('\n')).toMatch(
      /E101-buzu.yaml: \/intents\/0 must NOT have more than 3 items/,
    );
  });
  it('Schema：未知字段被拦下', () => {
    expect(broken('cards/basic/B001-sha.yaml', (s) => s + 'atk: 3\n').join('\n')).toMatch(/must NOT have additional properties/);
  });
  it('业务：引用不存在的敌人 / 卡牌被拦下', () => {
    expect(broken('encounters/ch1.yaml', (s) => s.replace('E1E1', 'E9X9')).join('\n')).toMatch(/不存在的敌人 E9X9/);
    expect(broken('decks/prototype.yaml', (s) => s.replace('card: B001', 'card: B999')).join('\n')).toMatch(/不存在的卡牌 B999/);
  });
  it('业务：起始牌组红色比例与 0 费摸牌限次被拦下', () => {
    expect(broken('heroes/H03-zhaoyun.yaml', (s) => s.replace('{ card: B001, suit: H, rank: 10 }', '{ card: B001, suit: S, rank: 10 }')).join('\n')).toMatch(
      /heroes\/H03: 起始牌组红色比例 41.7% ≠ 50%/,
    );
    expect(broken('cards/trick/T013-zhijizhibi.yaml', (s) => s.replace('    limit: { per: turn, times: 1 }\n', '')).join('\n')).toMatch(
      /T013: 0 费摸牌牌必须设置 limit/,
    );
  });
  it('业务：hero.starterDeck 必填', () => {
    expect(broken('heroes/H03-zhaoyun.yaml', (s) => s.replace(/starterDeck:[\s\S]*?exclusiveCards/, 'exclusiveCards')).join('\n')).toMatch(/starterDeck/);
  });
  it('业务：配置用到引擎未实现的原子被拦下', () => {
    expect(broken('cards/trick/T003-guohe.yaml', (s) => s.replace('do: remove_armor', 'do: summon_x')).join('\n')).toMatch(/T003-guohe.yaml/);
  });
  it('业务：珠联开场护甲超过上限被拦下', () => {
    expect(broken('heroes/H09-guanyu.yaml', (s) => s.replace('armor, target: self, amount: 3', 'armor, target: self, amount: 5')).join('\n')).toMatch(
      /开场护甲 5 > 3/,
    );
  });
});
