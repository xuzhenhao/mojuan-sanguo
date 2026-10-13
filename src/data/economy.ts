/**
 * 局内经济数值（PRD 0.5.4：10.7 集市、10.8 宝箱、12.1 宝物、12.2 丹药、14.1 铜钱、14.2 价格、14.3 稀有度、14.8 战斗奖励）。
 * 规则表只放这里（WORKFLOW：数值改动放 src/data）；core 目前没有宝物/丹药/铜钱，故 P4（#45）先在此占位。
 * 标【占位】的条目是 PRD 未定或互相冲突、待总策划确认的值，确认后只改这里。
 */
import type { Rarity } from '../core/types';
import { CONFIG, type PotionCfg, type RelicCfg } from './config';

const SHOP = CONFIG.rules.shop!;

export type BattleKind = 'normal' | 'elite' | 'boss';
export type Range = readonly [number, number];

export type RelicDef = RelicCfg;
export type PotionDef = PotionCfg;

/** 12.1 宝物（config/relics，#173）。战斗内效果由 core 结算；局外效果见 effects */
export const RELICS: RelicDef[] = Object.values(CONFIG.relics);
/** 12.2 丹药（config/potions，#173） */
export const POTIONS: PotionDef[] = Object.values(CONFIG.potions);

export const ECONOMY = {
  /** 14.1 开局铜钱 */
  startGold: 60,
  /** 12.2 丹药栏 */
  potionSlots: 3,
  /** 14.1 战斗铜钱（按章 1–3） */
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
  } as Record<BattleKind, Range[]>,
  /** 14.3 卡牌三选一稀有度权重（按章） */
  cardRarity: [
    { N: 55, R: 35, E: 9, L: 1 },
    { N: 40, R: 40, E: 16, L: 4 },
    { N: 30, R: 40, E: 22, L: 8 },
  ] as Record<Rarity, number>[],
  /** 14.3 精英 E/L 权重倍率 */
  eliteHighMul: 1.5,
  /** 14.8 主将势力牌权重倍率 */
  factionMul: 1.5,
  /** 14.8 丹药掉落概率 */
  potionDrop: { normal: 0.25, elite: 0.4, boss: 0 } as Record<BattleKind, number>,
  /** 14.8 / 10.7 / 10.8 非 Boss 宝物稀有度 */
  relicRarity: { N: 50, R: 40, E: 10 } as Partial<Record<Rarity, number>>,
  /** Boss 额外宝物三选一（总策划定）：只出 Boss 级，不足 3 件用 E 补；不含 N/R/L */
  bossRelicPool: 'Boss' as RelicDef['rarity'],
  bossRelicFill: 'E' as RelicDef['rarity'],
  // 14.2 卡牌价格：config/rules.yaml shop.cardPrice 与卡牌 shopPrice（#70）
  /** 14.2 宝物价格（config/rules.yaml shop.relicPrice） */
  relicPrice: { ...SHOP.relicPrice } as Partial<Record<RelicDef['rarity'], number>>,
  /** 14.2 价格随机浮动 ±10%，取整到 5（删牌、刷新不浮动） */
  priceJitter: 0.1,
  priceRound: 5,
  /** 10.7 删牌服务：50，本局每用一次 +25 */
  removeBase: SHOP.removeBase,
  removeStep: SHOP.removeStep,
  /** 10.7 刷新 25，H5 每局首次免费 */
  shopRefresh: 25,
  shopFreeRefresh: 1,
  /**
   *【占位】集市槽位。PRD 10.7 = 5 卡 + 1 宝物 + 2 丹药 + 删牌；设计稿 v3/shop.html 与 acceptance.md = 3 卡 + 4 物。
   * 数值在 config/rules.yaml shop.shopSlots。暂按设计稿：3 卡（2 通用 + 1 势力/专属）、1 宝物、2 丹药、删牌，待总策划定。
   */
  shopSlots: { ...SHOP.shopSlots },
  /** 删牌下限（同 PRD 10.6 焚稿口径：至少 8 张且至少 1 张杀类） */
  minDeck: 8,
  /** 宝箱：PRD 10.8 = 75% 宝物三选一 / 25% 铜钱 50–80 + 卡牌三选一 */
  chestRelicChance: 0.75,
  chestGold: [50, 80] as Range,
  /** 10.8 宝箱宝物稀有度 */
  chestRelicRarity: { N: 50, R: 40, E: 10 } as Partial<Record<Rarity, number>>,
  /** 天命 6：集市全部 +20%（天命系统接入前默认 0） */
  destinyShopMarkup: 0.2,
} as const;
