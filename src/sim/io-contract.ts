/**
 * 表现层数据契约（headless 事件消费者）。
 *
 * 自动试玩用 silentIO，showJudge/update 等回调全是空函数，表现层需要的数据从不被读取，
 * 所以「判定牌没有卡牌定义」这类只在渲染路径上才炸的问题模拟永远发现不了（#52/#53/#54）。
 * 这里把 core → 表现层的每个 BattleIO 回调都包一层，按表现层的需要逐项校验数据，
 * 违约记入 violations；CI 用它跑全部武将的整章自动试玩，必须 0 违约。
 */
import type { BattleIO, Game } from '../core/battle';
import { CARDS } from '../data/cards';
import type { CardInst, JudgeEvent } from '../core/types';

const SUITS = ['S', 'H', 'C', 'D'];

export interface ContractReport {
  events: Record<string, number>;
  violations: string[];
}

export function checkJudgeEvent(ev: JudgeEvent): string[] {
  const out: string[] = [];
  const j = ev?.card;
  if (!ev || ev.type !== 'judge') out.push('judge: 事件 type 不是 judge');
  if (!ev?.reason) out.push('judge: 缺少 reason');
  if (!j || j.kind !== 'judge') return [...out, 'judge: card 不是 JudgeCard'];
  if (!SUITS.includes(j.suit)) out.push(`judge: 花色非法 ${j.suit}`);
  if (!Number.isInteger(j.rank) || j.rank < 1 || j.rank > 13) out.push(`judge: 点数非法 ${j.rank}`);
  const color = j.suit === 'H' || j.suit === 'D' ? 'red' : 'black';
  if (j.color !== color) out.push(`judge: 颜色 ${j.color} 与花色 ${j.suit} 不符`);
  if (!j.name) out.push('judge: 缺少展示名');
  if (j.source === 'pool' && j.cardId !== undefined) out.push('judge: 签筒判定牌不应带 cardId');
  if (j.source === 'deck' && !(j.cardId && CARDS[j.cardId])) out.push(`judge: 摸牌堆判定牌 cardId 无定义 ${j.cardId}`);
  if (j.source !== 'pool' && j.source !== 'deck') out.push(`judge: source 非法 ${j.source}`);
  return out;
}

function checkCard(c: CardInst | undefined, where: string): string[] {
  if (!c) return [`${where}: 空牌`];
  const d = CARDS[c.id];
  const out: string[] = [];
  if (!d || !d.name) out.push(`${where}: 卡牌 ${c.id} 没有定义/名称`);
  if (!SUITS.includes(c.suit)) out.push(`${where}: 卡牌 ${c.id} 花色非法`);
  if (!Number.isInteger(c.rank) || c.rank < 1 || c.rank > 13) out.push(`${where}: 卡牌 ${c.id} 点数非法`);
  return out;
}

/** 表现层每帧会读的状态：手牌/牌堆/装备/敌人判定区等都必须能解析出卡牌定义 */
export function checkSnapshot(g: Game): string[] {
  const out: string[] = [];
  for (const [k, list] of [
    ['hand', g.hand],
    ['draw', g.draw],
    ['discard', g.discard],
  ] as const)
    for (const c of list) out.push(...checkCard(c, k));
  for (const [slot, c] of Object.entries(g.p.equip)) if (c) out.push(...checkCard(c, `equip.${slot}`));
  for (const e of g.en) {
    if (!e.name) out.push(`enemy ${e.uid}: 缺少名称`);
    for (const c of e.judge) out.push(...checkCard(c, `enemy ${e.name}.judge`));
  }
  if (!Number.isFinite(g.p.hp) || !Number.isFinite(g.p.maxHp)) out.push('player: hp 非数字');
  return out;
}

/** 包装一个 BattleIO：先校验，再交给原实现 */
export function withContract(io: BattleIO, getGame: () => Game | undefined, rep: ContractReport = { events: {}, violations: [] }) {
  const hit = (k: string) => (rep.events[k] = (rep.events[k] ?? 0) + 1);
  const add = (xs: string[]) => {
    for (const x of xs) if (rep.violations.length < 200) rep.violations.push(x);
  };
  const snap = () => {
    const g = getGame();
    if (g) add(checkSnapshot(g));
  };
  const wrapped: BattleIO = {
    ...io,
    log(t) {
      hit('log');
      if (typeof t !== 'string') add(['log: 非字符串']);
      io.log(t);
    },
    update() {
      hit('update');
      snap();
      io.update();
    },
    async showJudge(ev) {
      hit('judge');
      add(checkJudgeEvent(ev));
      return io.showJudge(ev);
    },
    respond(text, legal, pass, timed) {
      hit('respond');
      if (!text || !pass) add(['respond: 缺少提示文字']);
      const g = getGame();
      if (g) for (const c of g.hand) if (legal(c)) add(checkCard(c, 'respond.legal'));
      return io.respond(text, legal, pass, timed);
    },
    epiphany(c, opts, reroll) {
      hit('epiphany');
      add(checkCard(c, 'epiphany'));
      for (const o of opts) if (!o?.n || !o?.d) add(['epiphany: 词条缺少名称/描述']);
      return io.epiphany(c, opts, reroll);
    },
    onBattleEnd(w) {
      hit('battleEnd');
      snap();
      io.onBattleEnd(w);
    },
  };
  return { io: wrapped, report: rep };
}
