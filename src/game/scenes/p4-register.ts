/**
 * P4 页面注册（#45）：把奖励 / 集市 / 宝箱场景注册到 SceneManager，替换占位页。
 * 入口 entry.ts 只需调用一次 registerP4，避免多人同时改共用入口。
 * 直入调试参数：?page=reward&reward=normal|elite|boss&potions=0..3&gold=N&seed=N；?page=chest&chest=relic|gold
 */
import type { Engine } from '../../engine/engine';
import type { BattleKind } from '../../data/economy';
import type { FlowEvent } from '../flow';
import { EconomySession } from '../economy/session';
import type { RunSession } from '../run';
import { RewardScene } from './reward';
import { ShopScene } from './shop';
import { ChestScene } from './chest';
import type { Env } from './p4-kit';

export interface P4Deps {
  engine: Engine;
  query: Record<string, string | undefined>;
  safe(): { x: number; y: number; w: number; h: number };
  send(e: FlowEvent): void;
  /** 共享经济会话（RunSession 接入后由其提供） */
  economy?: EconomySession;
  /** 本局 RunSession（#122 PR2）：有局时背包 / 经济随机流 / 节点完成都走它；没有局（?page= 直达）用演示背包 */
  run?: Pick<RunSession, 'active' | 'inventory' | 'rng' | 'completeNode' | 'store'>;
}

const num = (s: string | undefined) => (s !== undefined && s !== '' && !Number.isNaN(Number(s)) ? Number(s) : undefined);

export function registerP4(d: P4Deps) {
  const q = d.query;
  const econ = d.economy ?? new EconomySession({ seed: num(q.seed), gold: num(q.gold), potions: num(q.potions) });
  const { engine } = d;
  const live = () => !!d.run?.active;
  const inv = () => (live() ? d.run!.inventory : econ.inventory);
  const rng = () => (live() ? d.run!.rng('economy') : econ.rng);
  /** 节点结算完成：立刻写档（RunSession.completeNode），再交给流程 */
  const done = (e: FlowEvent) => () => {
    if (live()) d.run!.completeNode(d.run!.store ?? undefined);
    d.send(e);
  };
  const env: Env = {
    overlays: engine.overlays,
    safe: d.safe,
    measure: () => engine.surfaces.main.ctx,
    bakes: engine.bakes,
    offscreen: (w, h) => engine.platform.createOffscreen(w, h),
    scale: engine.bakeScale,
  };
  const kind = (['normal', 'elite', 'boss'].includes(q.reward ?? '') ? q.reward : 'normal') as BattleKind;
  engine.scenes.register(
    'reward',
    () => new RewardScene({ ...env, inventory: inv, rng, done: done({ type: 'reward_done' }), defaultKind: kind }),
  );
  engine.scenes.register('shop', () => new ShopScene({ ...env, inventory: inv, rng, done: done({ type: 'shop_done' }) }));
  const force = q.chest === 'gold' || q.chest === 'relic' ? q.chest : undefined;
  engine.scenes.register('chest', () => new ChestScene({ ...env, inventory: inv, rng, done: done({ type: 'chest_done' }), force }));
  return econ;
}
