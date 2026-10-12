import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies';
import { HEROES } from '../src/data/heroes';
import { card, mkGame } from './helpers';

const shaCount = (acts: string[]) => acts.filter((a) => a === '杀' || a === '杀+').length;

describe('难度 D 第 2 轮：敌人密度/血量（PRD 0.3 第 11 章）', () => {
  it('血量', () => {
    expect(Object.fromEntries(Object.entries(ENEMIES).map(([k, v]) => [k, v.hp]))).toEqual({ E101: 4, E102: 3, E103: 5, E104: 6, E1E1: 15 });
  });
  it('意图循环', () => {
    expect(ENEMIES.E101.pat).toEqual([['杀', '杀'], ['杀'], ['杀', '杀', '杀']]);
    expect(ENEMIES.E102.pat).toEqual([['杀'], ['杀', '杀'], ['闪', '杀']]);
    expect(ENEMIES.E103.pat).toEqual([['咒'], ['杀', '杀']]);
    expect(ENEMIES.E104.pat).toEqual([
      ['杀', '杀'],
      ['杀', '杀'],
      ['杀', '杀', '杀'],
    ]);
    expect(ENEMIES.E1E1.pat).toEqual([
      ['杀+', '杀'],
      ['闪', '杀', '杀'],
      ['万箭', '杀+', '杀+'],
    ]);
  });
  it('每个敌人至少 1 个意图 ≥2 张杀', () => {
    for (const d of Object.values(ENEMIES)) expect(d.pat.some((a) => shaCount(a) >= 2)).toBe(true);
  });
  it('精英每轮循环含万箭或 ≥2 张杀', () => {
    for (const d of Object.values(ENEMIES).filter((d) => d.elite))
      expect(d.pat.some((a) => a.includes('万箭')) || d.pat.some((a) => shaCount(a) >= 2)).toBe(true);
  });
});

describe('难度 D 第 2 轮：护主仅 ♥', () => {
  const setup = () => {
    const r = mkGame({}, 1);
    r.g.startBattle();
    r.g.hand = r.g.hand.filter((c) => c.id !== 'B004');
    return r;
  };
  it('♥ 生效', async () => {
    const { g } = setup();
    g.draw.push(card('B001', 'H', 9));
    expect(await g.enemySha(g.en[0], 1)).toBe('huzhu');
  });
  it.each(['D', 'S', 'C'] as const)('%s 不生效', async (s) => {
    const { g } = setup();
    g.draw.push(card('B001', s, 9));
    expect(await g.enemySha(g.en[0], 1)).not.toBe('huzhu');
  });
  it('描述同步', () => expect(HEROES.H02.subSkill.desc).toContain('♥'));
});
