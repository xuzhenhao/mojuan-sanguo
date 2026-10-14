import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game, type BattleIO } from '../src/core/battle';
import { seeded } from '../src/core/rng';
import { EPIPHANY } from '../src/data/affixes';
import { CONFIG, relicAbility } from '../src/data/config';

const io: BattleIO = {
  log: () => {},
  update: () => {},
  sleep: async () => {},
  showJudge: async () => {},
  respond: async () => null,
  epiphany: async () => null,
  onBattleEnd: () => {},
};
const mk = (seed: number, relics?: string[], epiphanyRate?: number) =>
  new Game(seeded(seed), io, { autoShan: false, main: 'H01', sub: 'H02', relics, epiphanyRate });

describe('#195 战斗内宝物效果由 abilities 配置驱动', () => {
  it('R01 灵光一闪概率 + 配置值（叠加在 settings / 基础值上）', () => {
    const add = relicAbility(['R01'], 'passive', 'epiphanyRate');
    expect(add).toBe(0.05);
    expect(mk(1, ['R01']).epiphanyRate()).toBeCloseTo(EPIPHANY.baseRate + add);
    expect(mk(1, ['R01'], 0.5).epiphanyRate()).toBeCloseTo(0.5 + add);
    expect(mk(1).epiphanyRate()).toBe(EPIPHANY.baseRate);
  });

  it('R06 战斗开始护甲 + 配置值', () => {
    const a = mk(5);
    a.startBattle();
    const b = mk(5, ['R06']);
    b.startBattle();
    expect(b.p.armor).toBe(a.p.armor + relicAbility(['R06'], 'battle_start', 'armor'));
  });

  it('R08 手牌上限 + 配置值；与 R02 叠加', () => {
    const a = mk(5);
    a.startBattle();
    const b = mk(5, ['R08', 'R02']);
    b.startBattle();
    expect(b.handLimit()).toBe(a.handLimit() + 2 - 1);
  });

  it('所有 abilities 均为已知触发时机且有数值；core 不按宝物 id 判断', () => {
    for (const r of Object.values(CONFIG.relics)) for (const ab of r.abilities ?? []) expect(Object.keys(ab).length).toBeGreaterThan(1);
    const src = readFileSync(new URL('../src/core/battle.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/['"]R\d\d['"]/);
  });
});
