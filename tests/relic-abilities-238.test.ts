import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game, type BattleIO } from '../src/core/battle';
import { seeded } from '../src/core/rng';
import { abilitySum, CONFIG, relicAbility } from '../src/data/config';

const io: BattleIO = {
  log: () => {},
  update: () => {},
  sleep: async () => {},
  showJudge: async () => {},
  respond: async () => null,
  epiphany: async () => null,
  onBattleEnd: () => {},
};
const mk = (seed: number, relics?: string[]) => new Game(seeded(seed), io, { autoShan: false, main: 'H01', sub: 'H02', relics });

describe('#238 R02/P03 走 abilities 配置', () => {
  it('配置：R02 turn_start ling + passive handLimit；P03 use ling', () => {
    expect(relicAbility(['R02'], 'turn_start', 'ling')).toBe(1);
    expect(relicAbility(['R02'], 'passive', 'handLimit')).toBe(-1);
    expect(abilitySum(CONFIG.potions.P03.abilities, 'use', 'ling')).toBe(1);
    expect(relicAbility(['R99', 'R03'], 'turn_start', 'ling')).toBe(0);
  });

  it('R02：回合开始比无宝物多 1 令，手牌上限 −1（与 #231 现网一致）', () => {
    const a = mk(7);
    a.startBattle();
    const b = mk(7, ['R02']);
    b.startBattle();
    expect(b.p.ling).toBe(a.p.ling + 1);
    expect(b.handLimit()).toBe(a.handLimit() - 1);
  });

  it('P03：+1 令；未配置 use 能力的丹药返回未接线', () => {
    const g = mk(3);
    g.startBattle();
    const before = g.p.ling;
    expect(g.usePotion('P03')).toBeNull();
    expect(g.p.ling).toBe(before + 1);
    expect(g.usePotion('P01')).toMatch('暂未接线');
  });

  it('core 无按 R02/P03 id 的特殊分支', () => {
    const src = readFileSync(new URL('../src/core/battle.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/['"](R02|P03)['"]/);
  });
});
