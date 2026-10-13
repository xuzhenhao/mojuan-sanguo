/**
 * 战斗页弹层接入点（P1a #41 ↔ P1b）：响应弹窗、长按详情、灵光一闪等浮层由外部实现，
 * 战斗场景只负责在正确时机调用这些钩子，并提供只读上下文（布局、命中测试、焦点重绘）。
 *
 * 约定：
 * - 一律基于现有 `OverlayStack`（src/engine/modal.ts）push 弹层，不改 OverlayStack 和手势接口。
 * - 响应窗口 kind='response'（z 12，modal，不可点外部关闭）；长按详情 kind='detail'（z 14，dismissOnTapOutside）。
 * - 战斗场景退出时会 `closeAll('detail')` 和 `closeAll('response')`。
 * - 响应窗口与长按详情默认接入 P1b（#64）的 makeRespond / LongPressDetail；hooks 里提供同名钩子时优先用钩子。
 */
import type { Game } from '../../../core/battle';
import type { AffixDef, CardInst, Enemy, JudgeCard } from '../../../core/types';
import type { GestureEvent } from '../../../engine/input';
import type { OverlayStack } from '../../../engine/modal';
import type { Surface } from '../../../engine/surfaces';
import type { Rect, Vec2 } from '../../../engine/types';

/** 战斗场景里可被命中/重绘的元素 */
export type BattleElement =
  | { kind: 'card'; card: CardInst }
  | { kind: 'enemy'; enemy: Enemy }
  | { kind: 'intent'; enemy: Enemy }
  | { kind: 'countdown'; enemy: Enemy }
  | { kind: 'hero'; which: 'main' | 'sub' }
  | { kind: 'skill'; id: string }
  | { kind: 'endTurn' }
  | { kind: 'tally' };

/** 命中结果：元素 + 当前包围盒（逻辑像素 dp） */
export type BattleHit = BattleElement & { rect: Rect };

/** 响应窗口请求：一一对应 core 的 `BattleIO.respond(text, legal, pass, timed)` */
export interface ResponseRequest {
  text: string;
  legal: (c: CardInst) => boolean;
  /** 放弃按钮文案（如「承受」「放弃」） */
  pass: string;
  /** 是否限时（倒计时由表现层计时，超时提交 null） */
  timed: boolean;
  /** 发起攻击的敌人（若能从上下文得知），用于焦点层和红箭头 */
  attacker: Enemy | null;
  /** 当前合法手牌（已按 legal 过滤） */
  legalCards: CardInst[];
}

/** 灵光一闪三选一：一一对应 `BattleIO.epiphany` */
export interface EpiphanyRequest {
  card: CardInst;
  options: AffixDef[];
  reroll: () => AffixDef[];
}

/** 焦点层重绘状态；disabled = 去饱和 + 透明度 .45（按钮 / 手牌 / 敌人通用） */
export type ElementState = 'normal' | 'legal' | 'illegal' | 'selected' | 'disabled';

/** 战斗场景提供给弹层实现的只读上下文 */
export interface BattleOverlayContext {
  readonly overlays: OverlayStack;
  /** core 对局（只读使用；不要直接调用会推进流程的方法） */
  readonly game: Game;
  readonly width: number;
  readonly height: number;
  /** 安全区（逻辑像素） */
  readonly safe: Rect;
  /**
   * 某元素当前包围盒（逻辑像素 dp）；不在场上返回 null。**稳定 API**：战斗页所有布局都从这里取，
   * 绘制与 hitTest 用的是同一份矩形。约定：
   * - card：手牌当前位置（含滚动、选中上浮 22）；
   * - enemy：敌人牌框（含行动前冲位移）；intent / countdown：敌人牌右上 / 左上外挂；
   * - hero main / sub：主将 / 副将牌；skill：主动技按钮；endTurn：结束回合按钮；tally：虎符列。
   */
  rectOf(el: BattleElement): Rect | null;
  /** 命中测试（按 z 从上到下），供响应弹层选手牌等 */
  hitTest(at: Vec2): BattleHit | null;
  /**
   * 在遮罩之上重绘场景元素（render-spec §7.1 第 11 层焦点层：攻击者 / 我方武将牌 / 合法手牌）。
   * 在 OverlaySpec.draw 里调用；state 用于手牌高亮。
   */
  drawElement(s: Surface, el: BattleElement, state?: ElementState): void;
  /** 请求重绘 main 层 */
  invalidate(): void;
  /** 当前时间（ms，平台时钟），响应倒计时用 */
  now(): number;
}

/** P1b 实现并注入的钩子；全部可选 */
export interface BattleOverlayHooks {
  /** 响应窗口：返回打出的牌或 null（承受/放弃/超时）。场景在等待期间锁定自身输入 */
  respond?(req: ResponseRequest, ctx: BattleOverlayContext): Promise<CardInst | null>;
  /** 长按详情：在 `longpress` 命中元素时调用；返回 true 表示已打开（场景不再处理该手势） */
  detail?(hit: BattleHit, ctx: BattleOverlayContext): boolean;
  /** 长按进度（0–1，420ms 环形进度）；不提供时场景自己画默认环 */
  longPressProgress?(at: Vec2, progress: number, hit: BattleHit | null, ctx: BattleOverlayContext): void;
  /** 灵光一闪三选一。未注入时：调试版/测试默认选第一个；正式版不自动选（返回 null，本次灵光不铭刻）并告警 */
  epiphany?(req: EpiphanyRequest, ctx: BattleOverlayContext): Promise<AffixDef | null>;
  /** 判定展示（判定区翻牌）；不提供时场景用内置动画 */
  judge?(reason: string, card: JudgeCard, ctx: BattleOverlayContext): Promise<void>;
  /** 场景收到但未处理的手势（调试/扩展用） */
  gesture?(e: GestureEvent, ctx: BattleOverlayContext): boolean;
}

/** 战斗场景入参 */
export interface BattleParams {
  /** 已有对局（由 P2 点将 / P3 地图创建）；不传时场景按 seed + settings 新建并开战 */
  game?: Game;
  seed?: number;
  main?: string;
  sub?: string;
}
