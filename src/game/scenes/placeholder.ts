/**
 * 占位页面：B 金漆屏风流程的 6 个页面先用占位，正式页面由各自负责人替换（实现 Scene 接口即可）。
 * 点按底部按钮发出该页面的下一步流程事件；长按弹出详情浮层（演示弹层栈）。
 */
import type { GestureEvent } from '../../engine/input';
import type { OverlayStack } from '../../engine/modal';
import type { Scene, SceneContext } from '../../engine/scene';
import type { Surface, SurfaceName } from '../../engine/surfaces';
import type { FlowEvent, Page } from '../flow';

export const PAGE_TITLE: Record<Page, string> = {
  select: '点将',
  map: '地图',
  battle: '战斗',
  reward: '奖励',
  shop: '集市',
  chest: '宝箱',
  rest: '营地',
  event: '奇遇',
  result: '结算',
};

/** 每页的占位按钮：文字 + 发出的事件 */
export const PAGE_ACTIONS: Record<Page, { label: string; event: FlowEvent }[]> = {
  select: [{ label: '出征', event: { type: 'start_run' } }],
  map: [
    { label: '进入战斗', event: { type: 'enter_node', node: 'battle' } },
    { label: '进入集市', event: { type: 'enter_node', node: 'shop' } },
    { label: '进入宝箱', event: { type: 'enter_node', node: 'chest' } },
    { label: '进入营地', event: { type: 'enter_node', node: 'rest' } },
  ],
  battle: [
    { label: '胜利（占位）', event: { type: 'battle_end', win: true } },
    { label: '败北（占位）', event: { type: 'battle_end', win: false } },
  ],
  reward: [{ label: '收入', event: { type: 'reward_done' } }],
  shop: [{ label: '离开', event: { type: 'shop_done' } }],
  chest: [{ label: '收入', event: { type: 'chest_done' } }],
  rest: [{ label: '离开', event: { type: 'rest_done' } }],
  event: [{ label: '继续', event: { type: 'event_done' } }],
  result: [{ label: '再来一局', event: { type: 'result_done' } }],
};

const LACQUER = '#2a0f0c';
const GOLD = '#d9b46a';

export class PlaceholderScene implements Scene {
  private ctx!: SceneContext;
  constructor(
    readonly id: Page,
    private send: (e: FlowEvent) => void,
    private overlays?: OverlayStack,
  ) {}
  enter(ctx: SceneContext) {
    this.ctx = ctx;
  }
  exit() {
    this.overlays?.closeAll('detail');
  }
  buttons() {
    const w = this.ctx.width;
    const h = this.ctx.height;
    return PAGE_ACTIONS[this.id].map((a, i, all) => ({ ...a, rect: { x: 40, y: h - 90 - (all.length - 1 - i) * 64, w: w - 80, h: 48 } }));
  }
  draw(layer: SurfaceName, s: Surface) {
    const { ctx } = s;
    const { width: w, height: h } = this.ctx;
    if (layer === 'bg') {
      ctx.fillStyle = LACQUER;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = GOLD;
      ctx.fillRect(12, 12, w - 24, 2);
      ctx.fillRect(12, h - 14, w - 24, 2);
      return;
    }
    ctx.clearRect(0, 0, w, h);
    if (layer !== 'main') return;
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 30px "Brush", serif';
    ctx.fillText?.(PAGE_TITLE[this.id], 32, 80);
    ctx.font = '14px "Brush", serif';
    ctx.fillText?.(`占位页面 · ${this.id}（长按任意处看详情）`, 32, 108);
    for (const b of this.buttons()) {
      ctx.fillStyle = '#5a2a16';
      ctx.fillRect(b.rect.x, b.rect.y, b.rect.w, b.rect.h);
      ctx.fillStyle = GOLD;
      ctx.font = '18px "Brush", serif';
      ctx.fillText?.(b.label, b.rect.x + 20, b.rect.y + 30);
    }
  }
  gesture(e: GestureEvent) {
    if (e.type === 'tap') {
      const b = this.buttons().find((x) => e.at.x >= x.rect.x && e.at.x <= x.rect.x + x.rect.w && e.at.y >= x.rect.y && e.at.y <= x.rect.y + x.rect.h);
      if (b) {
        this.send(b.event);
        return true;
      }
    }
    if (e.type === 'longpress' && this.overlays) {
      const rect = { x: e.at.x - 90 < 8 ? 8 : Math.min(e.at.x - 90, this.ctx.width - 188), y: Math.max(8, e.at.y - 120), w: 180, h: 100 };
      this.overlays.push({
        id: `detail:${this.id}`,
        kind: 'detail',
        dismissOnTapOutside: true,
        rect,
        draw: (s) => {
          s.ctx.fillStyle = '#f3ebd8';
          s.ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          s.ctx.fillStyle = '#1a1a1a';
          s.ctx.font = '13px "Brush", serif';
          s.ctx.fillText?.(`${PAGE_TITLE[this.id]} · 详情浮层`, rect.x + 12, rect.y + 28);
          s.ctx.fillText?.('点外部关闭', rect.x + 12, rect.y + 52);
        },
      });
      return true;
    }
    return false;
  }
}
