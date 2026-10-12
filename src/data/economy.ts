/**
 * 局内经济数值（PRD 0.5.4：10.7 集市、10.8 宝箱、12.1 宝物、12.2 丹药、14.1 铜钱、14.2 价格、14.3 稀有度、14.8 战斗奖励）。
 * 规则表只放这里（WORKFLOW：数值改动放 src/data）；core 目前没有宝物/丹药/铜钱，故 P4（#45）先在此占位。
 * 标【占位】的条目是 PRD 未定或互相冲突、待总策划确认的值，确认后只改这里。
 */
import type { Rarity } from '../core/types';

export type BattleKind = 'normal' | 'elite' | 'boss';
export type Range = readonly [number, number];

export interface RelicDef {
  id: string;
  name: string;
  rarity: Rarity | 'Boss';
  desc: string;
}
export interface PotionDef {
  id: string;
  name: string;
  desc: string;
  price: number;
}

/** 12.1 宝物（31 件）。效果在战斗内由 core 结算，本表只供奖励/集市/宝箱展示与抽取 */
export const RELICS: RelicDef[] = [
  { id: 'R01', name: '墨灵笔', rarity: 'R', desc: '灵光 +5%' },
  { id: 'R02', name: '虎符', rarity: 'Boss', desc: '每回合 +1 令；手牌上限 −1' },
  { id: 'R03', name: '青囊书', rarity: 'R', desc: '营地额外回 2' },
  { id: 'R04', name: '孙子残卷', rarity: 'R', desc: '胜利 +10 铜钱' },
  { id: 'R05', name: '草船借箭符', rarity: 'E', desc: '首回合敌方第 1 张杀无效' },
  { id: 'R06', name: '金鳞甲片', rarity: 'R', desc: '战斗开始 3 甲' },
  { id: 'R07', name: '赤壁东风', rarity: 'L', desc: '火伤 +1' },
  { id: 'R08', name: '铜雀台瓦', rarity: 'E', desc: '手牌上限 +2' },
  { id: 'R09', name: '断袖香囊', rarity: 'R', desc: '商店 −20%' },
  { id: 'R10', name: '狼毫', rarity: 'N', desc: '每场首次摸牌 +1' },
  { id: 'R11', name: '玉玺残印', rarity: 'L', desc: '战斗胜利回 2' },
  { id: 'R12', name: '诸葛灯', rarity: 'E', desc: '开战看全部首意图，首回合 +1 令' },
  { id: 'R13', name: '古锭刀胚', rarity: 'R', desc: '每回合首张杀 +1；你每回合首次受伤 +1' },
  { id: 'R14', name: '白马义从旗', rarity: 'R', desc: '攻击范围 +1' },
  { id: 'R15', name: '七星灯', rarity: 'E', desc: '每局 1 次免死回 1' },
  { id: 'R16', name: '劫火油囊', rarity: 'R', desc: '火攻类费用 −1' },
  { id: 'R17', name: '铁索环', rarity: 'E', desc: '战斗开始全体连环' },
  { id: 'R18', name: '空城琴', rarity: 'E', desc: '回合结束手牌为 0 时得 2 甲' },
  { id: 'R19', name: '反间书', rarity: 'R', desc: '无懈结算后摸 1' },
  { id: 'R20', name: '米肉账', rarity: 'N', desc: '集市多 1 丹药槽' },
  { id: 'R21', name: '黄巾符', rarity: 'N', desc: '第 1 章敌 HP −1' },
  { id: 'R22', name: '血诏', rarity: 'E', desc: '体力上限 +1' },
  { id: 'R23', name: '双股剑鞘', rarity: 'R', desc: '每场首 3 回合首杀 −1 费' },
  { id: 'R24', name: '羽扇纶巾', rarity: 'E', desc: '回合结束剩 ≥1 令时摸 1' },
  { id: 'R25', name: '的卢蹄铁', rarity: 'R', desc: '后排敌人每回合首杀无效' },
  { id: 'R26', name: '俸禄袋', rarity: 'N', desc: '进入新章节时 +15 铜钱' },
  { id: 'R27', name: '墨魇碎片', rarity: 'L', desc: '灵光每场上限 +1' },
  { id: 'R28', name: '简册', rarity: 'R', desc: '兵书带入 +1' },
  { id: 'R29', name: '鼓吹', rarity: 'N', desc: '精英奖励 +20 铜钱' },
  { id: 'R30', name: '平安符', rarity: 'R', desc: '每场首次致死伤害免除并回 1' },
  { id: 'R31', name: '改签符', rarity: 'R', desc: '天机签筒加入 2 张 ♥' },
];

/** 12.2 丹药（10 种） */
export const POTIONS: PotionDef[] = [
  { id: 'P01', name: '回春丹', desc: '回 2 体力', price: 50 },
  { id: 'P02', name: '金创药', desc: '3 甲 + 摸 1', price: 45 },
  { id: 'P03', name: '提神剂', desc: '本回合 +1 令', price: 40 },
  { id: 'P04', name: '焚书油', desc: '删手牌 1，摸 3', price: 40 },
  { id: 'P05', name: '透视粉', desc: '显示下下个意图', price: 30 },
  { id: 'P06', name: '爆燃丸', desc: '全体 1 火伤 + 连环', price: 55 },
  { id: 'P07', name: '凝神丸', desc: '1 张无懈入手', price: 35 },
  { id: 'P08', name: '狂战药', desc: '本回合杀 +1，受伤 +1', price: 40 },
  { id: 'P09', name: '清心散', desc: '清除减益和延时', price: 30 },
  { id: 'P10', name: '灵光石', desc: '下一张牌必触发灵光', price: 60 },
];

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
  /** 14.2 卡牌价格 */
  cardPrice: { N: 40, R: 60, E: 90, L: 130 } as Record<Rarity, number>,
  /** 14.2 宝物价格 */
  relicPrice: { N: 70, R: 100, E: 140 } as Partial<Record<RelicDef['rarity'], number>>,
  /** 14.2 价格随机浮动 ±10%，取整到 5（删牌、刷新不浮动） */
  priceJitter: 0.1,
  priceRound: 5,
  /** 过渡兜底：#70 合入后卡牌配置有 shopPrice，届时删除本项与 cardPrice（改读 rules.shop.cardPrice） */
  fixedCardPrice: { T002: 40 } as Record<string, number>,
  /** 10.7 删牌服务：50，本局每用一次 +25 */
  removeBase: 50,
  removeStep: 25,
  /** 10.7 刷新 25，H5 每局首次免费 */
  shopRefresh: 25,
  shopFreeRefresh: 1,
  /**
   *【占位】集市槽位。PRD 10.7 = 5 卡 + 1 宝物 + 2 丹药 + 删牌；设计稿 v3/shop.html 与 acceptance.md = 3 卡 + 4 物。
   * 暂按设计稿：3 卡（2 通用 + 1 势力/专属）、1 宝物、2 丹药、删牌，待总策划定。
   */
  shopSlots: { common: 2, heroCard: 1, relic: 1, potion: 2 },
  /** 删牌下限（同 PRD 10.6 焚稿口径：至少 8 张且至少 1 张杀类） */
  minDeck: 8,
  /**【占位】宝箱：PRD 10.8 = 75% 宝物三选一 / 25% 铜钱 50–80 + 卡牌三选一；flow.md 3.11 写 70/30，14.1 写铜钱 40–70。暂按 10.8 */
  chestRelicChance: 0.75,
  chestGold: [50, 80] as Range,
  /** 10.8 宝箱宝物稀有度 */
  chestRelicRarity: { N: 50, R: 40, E: 10 } as Partial<Record<Rarity, number>>,
  /** 天命 6：集市全部 +20%（天命系统接入前默认 0） */
  destinyShopMarkup: 0.2,
} as const;
