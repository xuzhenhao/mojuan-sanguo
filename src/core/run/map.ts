/**
 * 章节地图生成与地图状态（PRD 10.1–10.4、10.9、21.4 mapState）。纯逻辑，确定性：同一 runSeed + 章节 + 配置 → 同一张图。
 * 不依赖战斗规则（src/core/battle.ts）。
 */
import { seeded, type Rng } from '../rng';

export const NODE_TYPES = ['BATTLE', 'ELITE', 'EVENT', 'REST', 'SHOP', 'CHEST', 'BOSS'] as const;
export type NodeType = (typeof NODE_TYPES)[number];
export type RandomType = Exclude<NodeType, 'BOSS'>;
const RANDOM_TYPES: RandomType[] = ['BATTLE', 'ELITE', 'EVENT', 'REST', 'SHOP', 'CHEST'];

export interface MapConfig {
  layers: number;
  columns: number;
  paths: number;
  distinctStarts: number;
  fixedLayers: Record<string, RandomType>;
  weights: ({ layers: [number, number] } & Record<RandomType, number>)[];
  constraints: {
    minLayerFor: Partial<Record<RandomType, number>>;
    noConsecutive: RandomType[];
    distinctSiblings: boolean;
    minElite: number;
    shopOnEveryStart: boolean;
    maxRerolls: number;
  };
  boss: Record<string, string>;
}

export interface MapNode {
  /** `L{layer}C{col}`；Boss 为 `BOSS` */
  id: string;
  layer: number;
  col: number;
  type: NodeType;
  /** 进入战斗节点时才抽取（10.2：敌人组合进入后才揭示） */
  encounterId?: string;
}

/** PRD 21.4 mapState */
export interface MapState {
  chapter: number;
  seed: number;
  /** Boss 敌人 id（开局可见名称与头像，PRD 10.9） */
  boss: string;
  nodes: MapNode[];
  edges: [string, string][];
  visited: string[];
  /** 当前所在节点；null = 尚未进入第 1 层 */
  current: string | null;
  /** 生成诊断：重抽次数、是否放宽约束 3 */
  rerolls: number;
  relaxed: boolean;
}

/** FNV-1a 32 位：mapSeed = hash(runSeed, "map", chapter) */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
export const mapSeedOf = (runSeed: number | string, chapter: number) => hashSeed(runSeed, 'map', chapter);
export const nodeId = (layer: number, col: number) => `L${layer}C${col}`;
export const BOSS_ID = 'BOSS';

interface Grid {
  cells: Set<string>;
  edges: Set<string>; // "a>b"
  starts: number[];
  paths: number[][]; // 每条路线每层的列
}

/** 10.3 路线生成 */
export function generatePaths(cfg: Pick<MapConfig, 'layers' | 'columns' | 'paths' | 'distinctStarts'>, rng: Rng): Grid {
  const { layers: L, columns: C } = cfg;
  const cells = new Set<string>();
  const edges = new Set<string>();
  const steps = new Set<string>(); // "layer:from>to"
  const starts: number[] = [];
  const paths: number[][] = [];
  for (let p = 0; p < cfg.paths; p++) {
    let c = Math.floor(rng() * C);
    if (p < cfg.distinctStarts) while (starts.slice(0, p).includes(c)) c = Math.floor(rng() * C);
    starts.push(c);
    const path = [c];
    cells.add(nodeId(1, c));
    for (let l = 1; l < L; l++) {
      const opts = [c - 1, c, c + 1].filter((x) => x >= 0 && x < C);
      let n = opts[Math.floor(rng() * opts.length)];
      // 不交叉：已有 n→c 的反向斜线则改直走
      if (n !== c && steps.has(`${l}:${n}>${c}`)) n = c;
      steps.add(`${l}:${c}>${n}`);
      cells.add(nodeId(l + 1, n));
      edges.add(`${nodeId(l, c)}>${nodeId(l + 1, n)}`);
      path.push(n);
      c = n;
    }
    paths.push(path);
  }
  return { cells, edges, starts, paths };
}

function weightsFor(cfg: MapConfig, layer: number) {
  const w = cfg.weights.find((x) => layer >= x.layers[0] && layer <= x.layers[1]);
  if (!w) throw new Error(`map.weights 没有覆盖第 ${layer} 层`);
  return w;
}
function pickWeighted(rng: Rng, w: Record<RandomType, number>, allowed: (t: RandomType) => boolean): RandomType {
  const ts = RANDOM_TYPES.filter((t) => w[t] > 0 && allowed(t));
  const pool = ts.length ? ts : RANDOM_TYPES.filter((t) => w[t] > 0);
  const total = pool.reduce((s, t) => s + w[t], 0);
  let r = rng() * total;
  for (const t of pool) if ((r -= w[t]) < 0) return t;
  return pool[pool.length - 1];
}

/** 校验 10.4 约束；返回违反的约束编号列表 */
export function violations(nodes: MapNode[], edges: [string, string][], cfg: MapConfig, opt: { relaxSiblings?: boolean } = {}): number[] {
  const bad = new Set<number>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, string[]>();
  for (const [a, b] of edges) out.set(a, [...(out.get(a) ?? []), b]);
  const k = cfg.constraints;
  for (const n of nodes) {
    const min = k.minLayerFor[n.type as RandomType];
    if (min && n.layer < min) bad.add(1);
    for (const m of out.get(n.id) ?? []) {
      const t = byId.get(m)!.type;
      if (t === n.type && (k.noConsecutive as string[]).includes(t)) bad.add(2);
    }
    if (k.distinctSiblings && !opt.relaxSiblings) {
      const kids = (out.get(n.id) ?? []).map((m) => byId.get(m)!);
      const free = kids.filter((x) => cfg.fixedLayers[x.layer] == null && x.type !== 'BOSS');
      if (free.length > 1 && new Set(free.map((x) => x.type)).size < free.length) bad.add(3);
    }
  }
  if (nodes.filter((n) => n.type === 'ELITE').length < k.minElite) bad.add(4);
  if (k.shopOnEveryStart) {
    for (const s of nodes.filter((n) => n.layer === 1)) {
      const seen = new Set<string>();
      const st = [s.id];
      let ok = false;
      while (st.length && !ok) {
        const id = st.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        if (byId.get(id)!.type === 'SHOP') ok = true;
        st.push(...(out.get(id) ?? []));
      }
      if (!ok) bad.add(4);
    }
  }
  return [...bad].sort();
}

function assignTypes(grid: Grid, cfg: MapConfig, rng: Rng): MapNode[] {
  const nodes: MapNode[] = [];
  for (let l = 1; l <= cfg.layers; l++)
    for (let c = 0; c < cfg.columns; c++) {
      const id = nodeId(l, c);
      if (!grid.cells.has(id)) continue;
      const fixed = cfg.fixedLayers[l];
      let type: RandomType;
      if (fixed) type = fixed;
      else {
        // 先按权重随机，约束 2–4 由 violations 校验后整图重抽（10.4）；约束 1 在抽取时直接排除
        const min = cfg.constraints.minLayerFor;
        type = pickWeighted(rng, weightsFor(cfg, l), (t) => !(min[t] && l < min[t]!));
      }
      const n: MapNode = { id, layer: l, col: c, type };
      nodes.push(n);
    }
  return nodes;
}

/** 生成一章地图（10.3 + 10.4）。约束失败用同一种子流重抽，maxRerolls 次后放宽约束 3 */
export function generateMap(runSeed: number | string, chapter: number, cfg: MapConfig): MapState {
  const seed = mapSeedOf(runSeed, chapter);
  const rng = seeded(seed);
  const max = cfg.constraints.maxRerolls;
  let best: { nodes: MapNode[]; edges: [string, string][] } | null = null;
  for (let i = 0; i < max * 2; i++) {
    const relax = i >= max;
    const grid = generatePaths(cfg, rng);
    const nodes = assignTypes(grid, cfg, rng);
    const edges = [...grid.edges].map((e) => e.split('>') as [string, string]);
    if (!violations(nodes, edges, cfg, { relaxSiblings: relax }).length) return finish(seed, chapter, cfg, nodes, edges, i, relax);
    best ??= { nodes, edges };
  }
  // 极端情况（配置不可满足）：返回第一次结果，由 config:check / 测试暴露
  return finish(seed, chapter, cfg, best!.nodes, best!.edges, max * 2, true);
}

function finish(seed: number, chapter: number, cfg: MapConfig, nodes: MapNode[], edges: [string, string][], rerolls: number, relaxed: boolean): MapState {
  const boss: MapNode = { id: BOSS_ID, layer: cfg.layers + 1, col: Math.floor((cfg.columns - 1) / 2), type: 'BOSS' };
  for (const n of nodes) if (n.layer === cfg.layers) edges.push([n.id, BOSS_ID]);
  return { chapter, seed, boss: cfg.boss[chapter] ?? '', nodes: [...nodes, boss], edges, visited: [], current: null, rerolls, relaxed };
}

/** 当前可走的节点 id（未出发时为第 1 层全部） */
export function availableNodes(s: MapState): string[] {
  if (s.current == null) return s.nodes.filter((n) => n.layer === 1).map((n) => n.id);
  return s.edges.filter(([a]) => a === s.current).map(([, b]) => b);
}
export const getNode = (s: MapState, id: string) => s.nodes.find((n) => n.id === id);

/** 走到节点（只能沿连线向下一层）。返回新状态，不修改原状态 */
export function moveTo(s: MapState, id: string, patch: Partial<MapNode> = {}): MapState {
  if (!availableNodes(s).includes(id)) throw new Error(`节点 ${id} 不可达（当前 ${s.current ?? '起点'}）`);
  return {
    ...s,
    nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    visited: [...s.visited, id],
    current: id,
  };
}

/** 已走过的连线（含当前），用于描金/朱砂路径 */
export function walkedEdges(s: MapState): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 1; i < s.visited.length; i++) out.push([s.visited[i - 1], s.visited[i]]);
  return out;
}

export function countTypes(s: MapState) {
  const r: Record<NodeType, number> = { BATTLE: 0, ELITE: 0, EVENT: 0, REST: 0, SHOP: 0, CHEST: 0, BOSS: 0 };
  for (const n of s.nodes) r[n.type]++;
  return r;
}
