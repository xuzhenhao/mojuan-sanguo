/**
 * 页面流程状态机（engine-design §4.13）：点将 → 地图 →（战斗 → 奖励 | 集市 | 宝箱）→ … → 结算。
 * 由 src/core 的局状态驱动：通过只读视图 RunStateView 读取 Game 的字段，不修改 core。
 */
import type { Game } from '../core/battle';

export type Page = 'select' | 'map' | 'battle' | 'reward' | 'shop' | 'chest' | 'result';

export const PAGES: Page[] = ['select', 'map', 'battle', 'reward', 'shop', 'chest', 'result'];

export type FlowEvent =
  | { type: 'start_run' } // 点将确认
  | { type: 'enter_node'; node: 'battle' | 'shop' | 'chest' }
  | { type: 'battle_end'; win: boolean }
  | { type: 'reward_done' }
  | { type: 'shop_done' }
  | { type: 'chest_done' }
  | { type: 'result_done' };

/** core 局状态的只读视图 */
export interface RunStateView {
  /** 当前战斗是否已结束 */
  battleOver: boolean;
  /** 我方是否存活 */
  alive: boolean;
  /** 是否已是本章最后一场 */
  isLast: boolean;
  battleIdx: number;
}

/** 从 core 的 Game 读取（只读，不改 core） */
export function viewOf(g: Pick<Game, 'over' | 'isLast' | 'battleIdx' | 'p'>): RunStateView {
  return { battleOver: g.over, alive: g.p.hp > 0, isLast: g.isLast, battleIdx: g.battleIdx };
}

const abandon = () => 'result' as const;

const TABLE: Record<Page, Partial<Record<FlowEvent['type'], (e: FlowEvent, v: RunStateView | null) => Page>>> = {
  select: { start_run: () => 'map' },
  map: { enter_node: (e) => (e as { node: 'battle' | 'shop' | 'chest' }).node },
  battle: { battle_end: (e) => ((e as { win: boolean }).win ? 'reward' : 'result') },
  reward: { reward_done: (_e, v) => (v?.isLast ? 'result' : 'map') },
  shop: { shop_done: () => 'map' },
  chest: { chest_done: () => 'map' },
  result: { result_done: () => 'select' },
};

export class FlowMachine {
  page: Page = 'select';
  readonly history: Page[] = ['select'];
  constructor(private view: () => RunStateView | null = () => null) {}

  can(e: FlowEvent) {
    return !!TABLE[this.page][e.type];
  }
  /** 推进一步；非法事件抛错。返回新页面 */
  send(e: FlowEvent): Page {
    const f = TABLE[this.page][e.type];
    if (!f) throw new Error(`页面 ${this.page} 不接受事件 ${e.type}`);
    if (e.type === 'battle_end') {
      const v = this.view();
      if (v && (!v.battleOver || v.alive !== e.win)) throw new Error('battle_end 与 core 局状态不一致');
    }
    this.page = f(e, this.view());
    this.history.push(this.page);
    return this.page;
  }
  /** 依据 core 状态自动推进：战斗页里 core 报告战斗结束时转到奖励/结算 */
  sync(): Page | null {
    const v = this.view();
    if (this.page === 'battle' && v?.battleOver) return this.send({ type: 'battle_end', win: v.alive });
    return null;
  }
}
