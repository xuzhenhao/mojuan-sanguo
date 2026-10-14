/** 地图与组包配置（config/rules.yaml 的 run/map，config/encounters/ch<N>.yaml 的 pools/rules） */
import type { MapConfig, NodeType } from '../core/run/map';
import type { RestConfig } from '../core/run/rest';
import type { EncounterPools } from '../core/run/encounters';
import { CONFIG } from './config';

/* eslint-disable @typescript-eslint/no-explicit-any */
const rules = CONFIG.rules as any;
export interface MapUiConfig extends MapConfig {
  nodeIcons: Record<NodeType, string>;
  betweenBattleHeal: number;
  rest: RestConfig;
  layerSpacing: number;
  moveMs: number;
  pulseMs: number;
  bossConfirm: BossConfirmConfig;
}
/** 首领确认弹层参数（#188，rules.yaml map.bossConfirm） */
export interface BossConfirmConfig {
  panel: { x: number; w: number; top: number; minTop: number; padTop: number; padBottom: number };
  card: { w: number; h: number; gap: number };
  status: { w: number; h: number; gap: number };
  button: { w: number; h: number; gap: number };
  scrimAlpha: number;
  popInMs: number;
  fadeOutMs: number;
  glowPeriodMs: number;
}
export const MAP_CONFIG: MapUiConfig = {
  betweenBattleHeal: 0,
  rest: { healMin: 2, healRatio: 0.3 },
  layerSpacing: 62,
  moveMs: 500,
  pulseMs: 1400,
  bossConfirm: {
    panel: { x: 28, w: 334, top: 150, minTop: 106, padTop: 22, padBottom: 18 },
    card: { w: 150, h: 206, gap: 14 },
    status: { w: 290, h: 52, gap: 14 },
    button: { w: 112, h: 44, gap: 12 },
    scrimAlpha: 0.55,
    popInMs: 250,
    fadeOutMs: 180,
    glowPeriodMs: 1600,
  },
  ...rules.map,
};
export const RUN_CHAPTERS: number = rules.run?.chapters ?? 1;
export function poolsOf(chapter: number): EncounterPools {
  const e = (CONFIG.encounters as any)[`ch${chapter}`];
  if (!e?.pools) throw new Error(`encounters/ch${chapter}.yaml 缺少 pools`);
  return { pools: e.pools, rules: e.rules };
}
export const enemyName = (id: string) => CONFIG.enemies[id]?.name ?? id;
export const enemyGlyph = (id: string) => CONFIG.enemies[id]?.glyph ?? '？';
