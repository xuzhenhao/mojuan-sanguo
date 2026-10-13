/**
 * 判定展示适配器：表现层只消费判定事件自带的牌面数据，不按 id 去卡牌库查牌（#52）。
 * core 的正式判定牌结构（fix/52-judge）合并前，BattleIO.showJudge 仍传 CardInst；
 * 这里把两种载荷统一成 JudgeView。合并后只需在 judgeViewOf 里补上新字段映射。
 */
import { RANK_CH, SUIT_CH } from '../../../core/rules';
import type { Suit } from '../../../core/types';

export interface JudgeView {
  reason: string;
  suit: Suit;
  rank: number;
  /** 牌面显示：花色符号 + 点数 */
  face: string;
  red: boolean;
  /** 牌名（载荷带才显示） */
  name?: string;
  /** 判定结果（载荷带才显示）：true = 生效 */
  effective?: boolean;
}

/** 判定载荷：当前 CardInst，或 #52 的正式判定牌（带牌面数据） */
export interface JudgePayload {
  suit: Suit;
  rank: number;
  name?: string;
  effective?: boolean;
  result?: { effective?: boolean };
}

export function judgeViewOf(reason: string, p: JudgePayload): JudgeView {
  return {
    reason,
    suit: p.suit,
    rank: p.rank,
    face: `${SUIT_CH[p.suit]}${RANK_CH[p.rank] ?? p.rank}`,
    red: p.suit === 'H' || p.suit === 'D',
    name: p.name,
    effective: p.effective ?? p.result?.effective,
  };
}
