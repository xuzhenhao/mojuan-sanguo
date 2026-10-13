/**
 * 局内经济数值（PRD 0.5.4：10.7 集市、10.8 宝箱、12.1 宝物、12.2 丹药、14.1 铜钱、14.2 价格、14.3 稀有度、14.8 战斗奖励）。
 * 经济数值表在 config/rules.yaml economy:（#172），本文件只读配置；宝物/丹药名录仍在此。
 */
import type { Rarity } from '../core/types';
import { CONFIG, type PotionCfg, type RelicCfg } from './config';

const SHOP = CONFIG.rules.shop!;
const ECO = CONFIG.rules.economy;

export type BattleKind = 'normal' | 'elite' | 'boss';
export type Range = readonly [number, number];

export type RelicDef = RelicCfg;
export type PotionDef = PotionCfg;

/** 12.1 宝物（config/relics，#173）。战斗内效果由 core 结算；局外效果见 effects */
export const RELICS: RelicDef[] = Object.values(CONFIG.relics);
/** 12.2 丹药（config/potions，#173） */
export const POTIONS: PotionDef[] = Object.values(CONFIG.potions);

/**
 * 局内经济数值：全部来自 config/rules.yaml（economy: 与 shop:，#172）。这里只做类型收窄与组装，改数值只改 yaml。
 */
export const ECONOMY = {
  ...ECO,
  battleGold: ECO.battleGold as Record<BattleKind, Range[]>,
  cardRarity: ECO.cardRarity as Record<Rarity, number>[],
  potionDrop: ECO.potionDrop as Record<BattleKind, number>,
  relicRarity: ECO.relicRarity as Partial<Record<Rarity, number>>,
  chestRelicRarity: ECO.chestRelicRarity as Partial<Record<Rarity, number>>,
  chestGold: ECO.chestGold as Range,
  bossRelicPool: ECO.bossRelicPool as RelicDef['rarity'],
  bossRelicFill: ECO.bossRelicFill as RelicDef['rarity'],
  // 14.2 卡牌价格：config/rules.yaml shop.cardPrice 与卡牌 shopPrice（#70）
  /** 14.2 宝物价格（shop.relicPrice） */
  relicPrice: { ...SHOP.relicPrice } as Partial<Record<RelicDef['rarity'], number>>,
  /** 10.7 删牌服务（shop.removeBase / removeStep） */
  removeBase: SHOP.removeBase,
  removeStep: SHOP.removeStep,
  /** 集市槽位（shop.shopSlots；【占位】PRD 10.7 与设计稿冲突，待总策划定） */
  shopSlots: { ...SHOP.shopSlots },
} as const;
