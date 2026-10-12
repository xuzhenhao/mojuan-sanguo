/**
 * 地图 → 节点页的路由约定（P3 #44）。奖励/集市/宝箱页（P4）与战斗页（P1a）按这里的参数类型读取 Scene.enter 的 params。
 */
import type { MapNode, NodeType } from '../../core/run/map';
import type { FlowEvent, NodePage } from '../flow';

interface Base {
  from: 'map';
  chapter: number;
  nodeId: string;
  layer: number;
}
/** 战斗页 params：BATTLE / ELITE / BOSS */
export interface BattleRouteParams extends Base {
  kind: 'battle';
  nodeType: 'BATTLE' | 'ELITE' | 'BOSS';
  /** `${pool}:${index}`，pool = easy | normal | elite | boss（config/encounters/ch<N>.yaml 的 pools） */
  encounterId: string;
  encounterName: string;
  enemies: string[];
  /** 精英进入时显示 0.8s 名牌；Boss 播登场演出（PRD 10.9） */
  intro: 'none' | 'elite' | 'boss';
}
/** 集市页 params */
export interface ShopRouteParams extends Base {
  kind: 'shop';
}
/** 奖励页 params（地图直接进入的情况）：宝箱；营地/奇遇页（P4b）上线前也临时走奖励页 */
export interface NodeRewardRouteParams extends Base {
  kind: 'chest' | 'rest' | 'event';
}
export type MapRouteParams = BattleRouteParams | ShopRouteParams | NodeRewardRouteParams;

export const PAGE_OF: Record<NodeType, NodePage> = {
  BATTLE: 'battle',
  ELITE: 'battle',
  BOSS: 'battle',
  SHOP: 'shop',
  CHEST: 'reward',
  REST: 'reward', // 占位：P4b 营地页未排期
  EVENT: 'reward', // 占位：P4b 奇遇页未排期
};

export function routeFor(
  chapter: number,
  node: MapNode,
  enc?: { encounterId: string; name: string; enemies: string[] },
): { event: FlowEvent; params: MapRouteParams } {
  const base: Base = { from: 'map', chapter, nodeId: node.id, layer: node.layer };
  const page = PAGE_OF[node.type];
  const event: FlowEvent = { type: 'enter_node', node: page };
  if (node.type === 'BATTLE' || node.type === 'ELITE' || node.type === 'BOSS') {
    if (!enc) throw new Error(`战斗节点 ${node.id} 缺少组包`);
    const intro = node.type === 'BOSS' ? 'boss' : node.type === 'ELITE' ? 'elite' : 'none';
    return {
      event,
      params: { ...base, kind: 'battle', nodeType: node.type, encounterId: enc.encounterId, encounterName: enc.name, enemies: enc.enemies, intro },
    };
  }
  if (node.type === 'SHOP') return { event, params: { ...base, kind: 'shop' } };
  return { event, params: { ...base, kind: node.type === 'CHEST' ? 'chest' : node.type === 'REST' ? 'rest' : 'event' } };
}
