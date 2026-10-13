/**
 * 地图 → 节点页的路由约定（P3 #44）。奖励/集市/宝箱页（P4）与战斗页（P1a）按这里的参数类型读取 Scene.enter 的 params。
 */
import type { MapNode, NodeType } from '../../core/run/map';
import type { FlowEvent } from '../flow';

/** 地图节点可去的页面（flow.ts 的 enter_node.node） */
export type NodePage = Extract<FlowEvent, { type: 'enter_node' }>['node'];

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
/** 宝箱页（#83）params：地图只传节点信息，offer 由宝箱页生成 */
export interface ChestRouteParams extends Base {
  kind: 'chest';
}
/** 营地页（#90）params：第 8 层固定营地规则相同，只用于埋点 */
export interface RestRouteParams extends Base {
  kind: 'rest';
  fixed: boolean;
}
/** 奇遇页（#91）params：事件由奇遇页用局内 event 流抽取 */
export interface EventRouteParams extends Base {
  kind: 'event';
}
export type MapRouteParams = EventRouteParams | BattleRouteParams | ShopRouteParams | ChestRouteParams | RestRouteParams;

/** 节点类型 → 页面；null = 页面未实现，在地图内处理（奇遇跳过；不走任何奖励类页面，避免误发奖励） */
export const PAGE_OF: Record<NodeType, NodePage | null> = {
  BATTLE: 'battle',
  ELITE: 'battle',
  BOSS: 'battle',
  SHOP: 'shop',
  CHEST: 'chest',
  REST: 'rest',
  EVENT: 'event',
};
export const isComingSoon = (t: NodeType) => PAGE_OF[t] === null;

export function routeFor(
  chapter: number,
  node: MapNode,
  enc?: { encounterId: string; name: string; enemies: string[] },
): { event: FlowEvent; params: MapRouteParams } {
  const base: Base = { from: 'map', chapter, nodeId: node.id, layer: node.layer };
  const page = PAGE_OF[node.type];
  if (!page) throw new Error(`${node.type} 节点在地图内处理（session.pass）`);
  const event: FlowEvent = { type: 'enter_node', node: page };
  if (node.type === 'BATTLE' || node.type === 'ELITE' || node.type === 'BOSS') {
    if (!enc) throw new Error(`战斗节点 ${node.id} 缺少组包`);
    const intro = node.type === 'BOSS' ? 'boss' : node.type === 'ELITE' ? 'elite' : 'none';
    return {
      event,
      params: { ...base, kind: 'battle', nodeType: node.type, encounterId: enc.encounterId, encounterName: enc.name, enemies: enc.enemies, intro },
    };
  }
  if (node.type === 'EVENT') return { event, params: { ...base, kind: 'event' } };
  if (node.type === 'SHOP') return { event, params: { ...base, kind: 'shop' } };
  if (node.type === 'REST') return { event, params: { ...base, kind: 'rest', fixed: node.layer === 8 } };
  return { event, params: { ...base, kind: 'chest' } };
}
