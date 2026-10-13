import { describe, expect, it } from 'vitest';
import { seeded } from '../src/core/rng';
import type { CardInst } from '../src/core/types';
import {
  applyRestHeal,
  applyTemper,
  canBurn,
  canBurnAny,
  canTemper,
  canTemperCard,
  restHealAmount,
  restRelicBonus,
  rollTemper,
  temperPool,
} from '../src/core/run/rest';
import { MAP_CONFIG } from '../src/data/map';

const cfg = MAP_CONFIG.rest;
let uid = 0;
const card = (id: string, mods: string[] = []): CardInst => ({ uid: ++uid, id, suit: 'S', rank: 7, mods });
const ids = (cs: { id: string }[]) => cs.map((a) => a.id).sort();

describe('营地 core（#90，rest-v05）', () => {
  it('疗伤：max(2, floor(maxHp×0.3)) + 宝物；不超上限；旧签名（sim）不变', () => {
    expect(restHealAmount(8, cfg)).toBe(2);
    expect(restHealAmount(10, cfg)).toBe(3);
    expect(restHealAmount(4, cfg)).toBe(2);
    expect(restRelicBonus(['R03'])).toBe(2);
    expect(restRelicBonus(['R10'])).toBe(0);
    expect(applyRestHeal(3, 8, cfg)).toEqual({ hp: 5, healed: 2 });
    expect(applyRestHeal(3, 8, cfg, restRelicBonus(['R03']))).toEqual({ hp: 7, healed: 4 }); // 规格例：8 → 2 + 2
    expect(applyRestHeal(7, 8, cfg, 2)).toEqual({ hp: 8, healed: 1 });
    expect(applyRestHeal(8, 8, cfg)).toEqual({ hp: 8, healed: 0 });
  });

  it('淬炼池：按类别只取 N/R（杀不含双响 E / 无影 L）', () => {
    expect(ids(temperPool(card('B001'), []))).toEqual(['E_S01', 'E_S02', 'E_S03', 'E_S04', 'E_S05', 'E_S07']);
    expect(ids(temperPool(card('B004'), []))).toEqual(['E_D01', 'E_D02']);
    expect(ids(temperPool(card('B005'), []))).toEqual(['E_P01', 'E_P02']);
  });
  it('淬炼池：酒只有 E 词条 → 空；火杀不出烈焰；扩写只给无中生有；已有词条不重复', () => {
    expect(temperPool(card('B006'), [])).toEqual([]);
    expect(ids(temperPool(card('B002'), []))).not.toContain('E_S05');
    expect(ids(temperPool(card('T001'), []))).toContain('E_T04');
    expect(ids(temperPool(card('T002'), []))).not.toContain('E_T04');
    expect(ids(temperPool(card('B001', ['E_S02']), []))).not.toContain('E_S02');
  });
  it('锋锐全牌组最多 2 张：已有 2 张杀带锋锐时候选不含 E_S01', () => {
    const deck = [card('B001', ['E_S01']), card('B001', ['E_S01']), card('B001')];
    expect(ids(temperPool(deck[2], deck))).not.toContain('E_S01');
    const deck1 = [card('B001', ['E_S01']), card('B001')];
    expect(ids(temperPool(deck1[1], deck1))).toContain('E_S01');
  });
  it('均匀随机 1 条、同种子可复现；池空返回 null', () => {
    const c = card('B001');
    const a = Array.from({ length: 20 }, (_, i) => rollTemper(seeded(i), c, [c])!.id);
    const b = Array.from({ length: 20 }, (_, i) => rollTemper(seeded(i), c, [c])!.id);
    expect(a).toEqual(b);
    // 均匀：6 条各约 1/6（R 不因稀有度降权）
    const rng2 = seeded(99);
    const n: Record<string, number> = {};
    for (let i = 0; i < 6000; i++) {
      const id = rollTemper(rng2, c, [c])!.id;
      n[id] = (n[id] ?? 0) + 1;
    }
    expect(Object.keys(n)).toHaveLength(6);
    for (const v of Object.values(n)) expect(Math.abs(v - 1000)).toBeLessThan(120);
    expect(rollTemper(seeded(1), card('B006'), [])).toBeNull();
  });
  it('铭刻：<2 条追加；满 2 条必须指定替换；不重复', () => {
    const c = card('B001');
    expect(applyTemper(c, 'E_S02')).toBe(true);
    expect(applyTemper(c, 'E_S02')).toBe(false);
    expect(applyTemper(c, 'E_S03')).toBe(true);
    expect(c.mods).toEqual(['E_S02', 'E_S03']);
    expect(applyTemper(c, 'E_S04')).toBe(false); // 满了，未给替换
    expect(applyTemper(c, 'E_S04', 'E_S99')).toBe(false);
    expect(applyTemper(c, 'E_S04', 'E_S02')).toBe(true);
    expect(c.mods).toEqual(['E_S04', 'E_S03']);
    // 满 2 条仍可淬炼（走替换），只有池空才置灰
    expect(canTemperCard(c, [c])).toBe(true);
  });
  it('淬炼置灰：整组过滤后都池空（只有酒）', () => {
    expect(canTemper([card('B006'), card('B006')])).toBe(false);
    expect(canTemper([card('B006'), card('B004')])).toBe(true);
  });
  it('焚稿：删后 ≥8 且至少 1 张杀', () => {
    const deck9 = [card('B001'), ...Array.from({ length: 8 }, () => card('B004'))];
    expect(canBurn(deck9, deck9[0].uid, 8)).toBe(false); // 唯一一张杀
    expect(canBurn(deck9, deck9[1].uid, 8)).toBe(true);
    const deck8 = deck9.slice(0, 8);
    expect(canBurn(deck8, deck8[1].uid, 8)).toBe(false); // 删后 7 张
    expect(canBurnAny(deck8, 8)).toBe(false);
    expect(canBurnAny(deck9, 8)).toBe(true);
    const two = [card('B001'), card('B002'), ...Array.from({ length: 7 }, () => card('B004'))];
    expect(canBurn(two, two[0].uid, 8)).toBe(true); // 火杀也算杀类
  });
});
