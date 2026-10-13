/**
 * #241 sim 补强：循环牌出牌 AI、选牌评估、留闪开关。
 * 只读 #230 的 juling/cost/loop 规则（src/core/juling.ts）与 Game.lingSlot()，不改游戏逻辑。
 * 开关与参数在 config/rules.yaml sim.shan / sim.reward。
 */
import type { Game } from '../core/battle';
import { julingCfg, maxPlaysPerTurn, reduceStackMax } from '../core/juling';
import { def, isShaPlay } from '../core/rules';
import { CONFIG } from '../data/config';
import type { CardInst } from '../core/types';

export type ShanMode = 'legacy' | 'budget';
export type ShanCfg = { mode: ShanMode; keepMax: number; takeHitHpRatio: number };
export type RewardCfg = { skipBelow: number; loopMaxInDeck: number; shopBuyMinGold: number; shopMaxCards: number };

export const shanCfg = (o?: Partial<ShanCfg>): ShanCfg => ({ ...CONFIG.rules.sim.shan, ...o });
export const rewardCfg = (o?: Partial<RewardCfg>): RewardCfg => ({ ...CONFIG.rules.sim.reward, ...o });

type Do = { do: string; amount?: number; status?: string };
const dos = (id: string): Do[] => (CONFIG.cards[id]?.abilities ?? []).flatMap((a) => a.do as Do[]);
const tagsOf = (id: string) => CONFIG.cards[id]?.tags ?? [];

export const isLoopCard = (id: string) => tagsOf(id).includes('loop');
/** 打出立即获得的军令 */
export const gainOf = (id: string) => dos(id).reduce((s, d) => s + (d.do === 'gain_ling' ? (d.amount ?? 0) : 0), 0);
/** 下回合待令 */
export const pendingOf = (id: string) => dos(id).reduce((s, d) => s + (d.do === 'apply_status' && d.status === 'pending_ling' ? (d.amount ?? 0) : 0), 0);
export const drawsOf = (id: string) => dos(id).reduce((s, d) => s + (d.do === 'draw' ? (d.amount ?? 0) : 0), 0);
/** 费减状态：sha_cost_next / sha_cost_turn / trick_cost_next / trick_cost_turn */
export const reduceOf = (id: string) => dos(id).find((d) => d.do === 'apply_status' && /_cost_(next|turn)$/.test(d.status ?? ''))?.status ?? null;

/** 费减目标：该状态能减的、本回合会打的、尚未被减的牌 */
function reduceTargets(g: Game, status: string, self: CardInst): CardInst[] {
  const sha = status.startsWith('sha');
  return g.hand.filter((x) => {
    if (x === self) return false;
    const d = def(x);
    if (sha ? !(isShaPlay(x) || d.sha) : !(d.trick && !d.wuxie && !isLoopCard(x.id))) return false;
    if (sha && !g.alive().some((e) => g.canTarget(e, x))) return false;
    const base = x.asSha ? 1 : d.cost;
    const now = g.costOf(x);
    return now > 0 && base - now < reduceStackMax(); // 已减到底 / 叠满再减没收益
  });
}

/** 本回合想打、但可能受军令限制的牌的总费用（非闪/无懈/循环、能合法打出或只差军令） */
export function lingDemand(g: Game): number {
  let need = 0;
  for (const x of g.hand) {
    const d = def(x);
    if (d.shan || d.wuxie || isLoopCard(x.id)) continue;
    const err = g.checkPlay(x);
    if (err && err !== '军令不足') continue;
    if ((isShaPlay(x) || d.sha) && !g.alive().some((e) => g.canTarget(e, x))) continue;
    need += g.costOf(x);
  }
  return need;
}

/** 打出（而非留在手里）的循环代价：牌进弃牌堆、洗回后占一个摸牌位 */
const CYCLE = 0.5;

/**
 * 这张循环牌现在打的净收益分，≤0 不打（留手里不进循环）。
 * - 产令：实得令（受 hardCap / maxGainPerTurn 截断）减费用；净令只在本回合缺令时算收益
 * - 待令 / 摸牌：按下回合令与过牌计
 * - 费减：节省费用（_turn 按目标张数）减费用，同样只在缺令时算
 */
export function loopPlayValue(g: Game, c: CardInst): number {
  const id = c.id;
  if (!isLoopCard(id)) return 0;
  const j = julingCfg();
  const slot = g.lingSlot();
  const cost = g.costOf(c);
  if (cost > slot.current) return 0;
  const maxP = maxPlaysPerTurn();
  if (maxP != null && g.playsThisTurn >= maxP - 1) return 0; // 留最后一次出牌给主动牌
  const demand = lingDemand(g);
  const short = Math.max(0, demand - (slot.current - cost));
  const gain = gainOf(id);
  let net = -cost;
  if (gain > 0) {
    const left = j ? Math.max(0, j.maxGainPerTurn - g.lingGainedThisTurn) : gain;
    const room = Math.max(0, slot.hardCap - (slot.current - cost));
    net += Math.min(gain, left, room);
  }
  const red = reduceOf(id);
  if (red && !g.p.status[red]) {
    const ts = reduceTargets(g, red, c);
    net += red.endsWith('_turn') ? ts.length : Math.min(1, ts.length);
  }
  const draw = drawsOf(id);
  // 摸牌类：打完仍要够出手里至少一张主动牌
  if (draw > 0 && net < 0 && slot.current - cost < Math.min(1, demand)) return 0;
  const useful = net > 0 ? Math.min(net, short) : net;
  const v = useful + pendingOf(id) * 0.6 + draw * 1.0 - (draw > 0 ? 0 : CYCLE);
  return v > 0 ? v : 0;
}

/** 选出当前最值得打的循环牌（收益>0） */
export function bestLoopPlay(g: Game): CardInst | null {
  let best: CardInst | null = null;
  let bv = 0;
  for (const c of g.hand) {
    if (!isLoopCard(c.id) || g.checkPlay(c)) continue;
    const v = loopPlayValue(g, c);
    if (v > bv) {
      bv = v;
      best = c;
    }
  }
  return best;
}

// ---------- 选牌 AI（奖励 / 商店） ----------
const RAR: Record<string, number> = { N: 0, R: 0.2, E: 0.4, L: 0.6 };

/**
 * 把 id 加入牌组的价值（越高越想拿；≤ skipBelow 跳过）。
 * 12 张起始牌组每回合摸 3：多一张非过牌牌就挤掉一个摸牌位，所以基准分低；
 * 循环牌按牌组的「缺令程度」（有费牌占比）估值，过牌 / 待令另加分。
 */
export function cardScore(id: string, deck: string[], cfg: RewardCfg = rewardCfg()): number {
  // 口径（#241 单卡注入实验校准，种子 777/1777/2777 × 200 局）：起手 12 张、每回合 3 令时
  // 令是瓶颈，任何“不能自我替换”的牌都会稀释牌组（无中生有 -13pt、传令 -23pt）。
  // 只有“自我替换”的牌（摸 ≥1 且产令 + 本回合减费 ≥ 自身费用，如 鼓进/连谋）与空防具位的防具为正收益。
  const c = CONFIG.cards[id];
  if (!c) return 0;
  const draw = drawsOf(id);
  if (isLoopCard(id)) {
    const loops = deck.filter(isLoopCard).length;
    const red = reduceOf(id) ? 1 : 0;
    const selfReplace = draw >= 1 && gainOf(id) + red >= c.cost;
    let s = selfReplace ? 2.5 + 0.2 * red : 0.5 + 0.2 * (gainOf(id) - c.cost) + 0.2 * pendingOf(id);
    if (loops >= cfg.loopMaxInDeck) s *= 0.4;
    return s;
  }
  if (c.slot === 'armor') return deck.some((x) => CONFIG.cards[x]?.slot === 'armor') ? 0.5 : 2.2;
  return 0.5 + (RAR[c.rarity] ?? 0) + (draw > 0 ? 0.3 : 0);
}

/** 三选一：返回下标；全部不高于 skipBelow 返回 -1（跳过） */
export function pickRewardCard(offers: string[], deck: string[], o: { noLoop?: boolean; cfg?: RewardCfg } = {}): number {
  const cfg = o.cfg ?? rewardCfg();
  let bi = -1;
  let bv = cfg.skipBelow;
  offers.forEach((id, i) => {
    if (o.noLoop && isLoopCard(id)) return;
    const v = cardScore(id, deck, cfg);
    if (v > bv) {
      bv = v;
      bi = i;
    }
  });
  return bi;
}

// ---------- 留闪 ----------
/** 弃牌价值：legacy 闪最高；budget 超出 keepMax 的闪视为低价值 */
export function discardValue(g: Game, c: CardInst, cfg: ShanCfg): number {
  const d = def(c);
  if (d.shan) {
    if (cfg.mode === 'legacy') return 5;
    return g.hand.filter((x) => def(x).shan).indexOf(c) < cfg.keepMax ? 5 : 1.5;
  }
  if (d.tao) return 4;
  if (d.sha) return 3;
  if (isLoopCard(c.id)) return 0.5; // 留着不打的循环牌最先弃
  return 1;
}
