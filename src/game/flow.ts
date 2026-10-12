/**
 * 页面流程状态机（engine-design §4.13）：点将 → 地图 →（战斗 → 奖励 | 集市）→ … → 结算。
 * 由 src/core 的局状态驱动：通过只读视图 RunStateView 读取 Game 的字段，不修改 core。
 */
import type { Game } from '../core/battle';

export type Page = 'select' | 'map' | 'battle' | 'reward' | 'shop' | 'result';

export type FlowEvent =
  | { type: 'start_run' } // 点将确认
  | { type: 'enter_node'; node: 'battle' | 'shop' }
  | { type: 'battle_end'; win: boolean }
  | { type: 'reward_done' }
  | { type: 'shop_done' }
  /** 结算页离开：to='map' 为「再来一局」（同主副将、新 runSeed，直接进地图），默认 'select'「返回点将」（PRD 14.5） */
  | { type: 'result_done'; to?: 'select' | 'map' }
  /** 放弃本局（PRD 5.13 V0.5.4）：二次确认后按失败进入结算。入口：启动续玩弹窗（在点将页上）/ 设置浮层（地图、战斗页） */
  | { type: 'abandon' };

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
  select: { start_run: () => 'map', abandon },
  map: { enter_node: (e) => (e as { node: 'battle' | 'shop' }).node, abandon },
  battle: { battle_end: (e) => ((e as { win: boolean }).win ? 'reward' : 'result'), abandon },
  reward: { reward_done: (_e, v) => (v?.isLast ? 'result' : 'map'), abandon },
  shop: { shop_done: () => 'map', abandon },
  result: { result_done: (e) => (e as { to?: 'select' | 'map' }).to ?? 'select' },
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
