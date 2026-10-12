import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { ENEMIES } from '../src/data/enemies';
import { HEROES } from '../src/data/heroes';
import { card, mkGame } from './helpers';

const shaCount = (acts: string[]) => acts.filter((a) => a === '杀' || a === '杀+').length;

const CH1 = ['E101', 'E102', 'E103', 'E104', 'E1E1'];

describe('V1 第 1 章敌人表（v1-sim/en-final.json）', () => {
  it('血量', () => {
    expect(Object.fromEntries(CH1.map((k) => [k, ENEMIES[k].hp]))).toEqual({ E101: 3, E102: 3, E103: 4, E104: 5, E1E1: 9 });
  });
  it('意图循环', () => {
    expect(ENEMIES.E101.pat).toEqual([['杀', '杀'], ['杀'], ['杀', '杀']]);
    expect(ENEMIES.E102.pat).toEqual([['杀'], ['杀', '杀'], ['杀', '杀']]);
    expect(ENEMIES.E103.pat).toEqual([['咒'], ['杀', '杀']]);
    expect(ENEMIES.E104.pat).toEqual([
      ['杀', '杀'],
      ['杀', '杀'],
      ['杀', '杀'],
    ]);
    expect(ENEMIES.E1E1.pat).toEqual([
      ['杀+', '杀'],
      ['闪', '杀+', '杀'],
      ['万箭', '杀+', '杀'],
    ]);
    expect(ENEMIES.E103.flash).toBe(0);
  });
  it('每个敌人至少 1 个意图 ≥2 张杀', () => {
    for (const k of CH1) expect(ENEMIES[k].pat.some((a) => shaCount(a) >= 2)).toBe(true);
  });
});

describe('V1 护主：红色、每敌方回合 1 次、计配额', () => {
  const setup = () => {
    const r = mkGame({}, 1);
    r.g.startBattle();
    r.g.hand = r.g.hand.filter((c) => c.id !== 'B004');
    CONFIG.rules.mechanics.judgeSource = 'deck';
    return r;
  };
  afterEach(() => (CONFIG.rules.mechanics.judgeSource = 'pool'));
  it.each(['H', 'D'] as const)('%s 生效', async (s) => {
    const { g } = setup();
    g.draw.push(card('B001', s, 9));
    expect(await g.enemySha(g.en[0], 1)).toBe('huzhu');
  });
  it.each(['S', 'C'] as const)('%s 不生效', async (s) => {
    const { g } = setup();
    g.draw.push(card('B001', s, 9));
    expect(await g.enemySha(g.en[0], 1)).not.toBe('huzhu');
  });
  it('同一敌方回合只判定 1 次', async () => {
    const { g } = setup();
    g.draw.push(card('B001', 'H', 9), card('B001', 'H', 8));
    expect(await g.enemySha(g.en[0], 1)).toBe('huzhu');
    expect(await g.enemySha(g.en[0], 1)).toBe('hit');
    g.effects.reset('enemy_turn');
    expect(await g.enemySha(g.en[0], 1)).toBe('huzhu');
  });
  it('描述同步', () => expect(HEROES.H03.subSkill.desc).toContain('红色'));
});
