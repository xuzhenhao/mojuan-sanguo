import { cpSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../scripts/config-lib';
import legacy from './fixtures/legacy-data.json';
import * as cards from '../src/data/cards';
import * as affixes from '../src/data/affixes';
import * as heroes from '../src/data/heroes';
import * as enemies from '../src/data/enemies';

const ROOT = resolve(__dirname, '../config');
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('数据驱动 ①：YAML 配置与重构前 TS 数据逐字段一致', () => {
  it('cards', () => expect(plain(cards)).toEqual(legacy.cards));
  it('affixes（含顺序）', () => expect(plain(affixes)).toEqual(legacy.affixes));
  it('heroes / rules / armor', () => expect(plain(heroes)).toEqual(legacy.heroes));
  it('enemies / battles', () => expect(plain(enemies)).toEqual(legacy.enemies));
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
    expect(broken('heroes/H01-guanyu.yaml', (s) => s.replace('hp: 8', 'hp: 18')).join('\n')).toMatch(/H01-guanyu.yaml: \/hp must be <= 10/);
  });
  it('Schema：单回合意图超过 3 张被拦下', () => {
    expect(broken('enemies/ch1/E101-buzu.yaml', (s) => s.replace('[杀, 杀, 杀]', '[杀, 杀, 杀, 杀]')).join('\n')).toMatch(
      /E101-buzu.yaml: \/intents\/2 must NOT have more than 3 items/,
    );
  });
  it('Schema：未知字段被拦下', () => {
    expect(broken('cards/basic/B001-sha.yaml', (s) => s + 'atk: 3\n').join('\n')).toMatch(/must NOT have additional properties/);
  });
  it('业务：引用不存在的敌人 / 卡牌被拦下', () => {
    expect(broken('encounters/ch1.yaml', (s) => s.replace('E1E1', 'E9X9')).join('\n')).toMatch(/不存在的敌人 E9X9/);
    expect(broken('decks/prototype.yaml', (s) => s.replace('card: B001', 'card: B999')).join('\n')).toMatch(/不存在的卡牌 B999/);
  });
  it('业务：开启 V1 检查后，红色比例与 0 费摸牌限次被拦下', () => {
    const errs = broken('rules.yaml', (s) =>
      s.replace('starterRedRatio: null', 'starterRedRatio: 0.5').replace('zeroCostDrawNeedsLimit: false', 'zeroCostDrawNeedsLimit: true'),
    ).join('\n');
    expect(errs).toMatch(/decks\/prototype: 红色比例 57.9% ≠ 50%/);
    expect(errs).toMatch(/T013: 0 费摸牌牌必须设置 limit/);
  });
  it('业务：珠联开场护甲超过上限被拦下', () => {
    expect(broken('heroes/H01-guanyu.yaml', (s) => s.replace('armor, target: self, amount: 3', 'armor, target: self, amount: 5')).join('\n')).toMatch(
      /开场护甲 5 > 3/,
    );
  });
});
