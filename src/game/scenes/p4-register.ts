/**
 * P4 页面注册（#45）：把奖励 / 集市 / 宝箱场景注册到 SceneManager，替换占位页。
 * 入口 entry.ts 只需调用一次 registerP4，避免多人同时改共用入口。
 * 直入调试参数：?page=reward&reward=normal|elite|boss&potions=0..3&gold=N&seed=N；?page=chest&chest=relic|gold
 */
import type { Engine } from '../../engine/engine';
import type { BattleKind } from '../../data/economy';
import type { FlowEvent } from '../flow';
import { RunSession } from '../run';
import { CONFIG } from '../../data/config';
import { RewardScene } from './reward';
import { ShopScene } from './shop';
import { ChestScene } from './chest';
import { RestScene, type RestRun } from './rest';
import { MAP_CONFIG } from '../../data/map';
import type { Env } from './p4-kit';

export interface P4Deps {
  engine: Engine;
  query: Record<string, string | undefined>;
  safe(): { x: number; y: number; w: number; h: number };
  send(e: FlowEvent): void;
  /** 本局 RunSession（#122 PR2）：有局时背包 / 经济随机流 / 节点完成都走它；没有局（?page= 直达）用演示背包 */
  run?: RunSession;
}

/** 营地读写 RunSession.state：体力 / 牌组（活背包）都折回 RunState，行动完成即 completeNode 写档 */
export function restRunOf(r: Pick<RunSession, 'state' | 'update' | 'completeNode' | 'store'>): RestRun {
  return {
    head: () => {
      const s = r.state;
      return { hp: s.hp, maxHp: s.maxHp };
    },
    save: (p) => {
      r.update((d) => void (d.hp = Math.min(d.maxHp, p.hp)));
      r.completeNode(r.store ?? undefined);
    },
    restConfig: MAP_CONFIG.rest,
  };
}

/** 直达调试局：主副将取默认，?seed= / ?gold= / ?potions= 写进 RunState；不绑定存储 */
export function debugRun(q: Record<string, string | undefined>) {
  let r: RunSession | null = null;
  return (): RunSession => {
    if (r) return r;
    r = new RunSession();
    const h = CONFIG.rules.defaultHeroes;
    r.start({ main: h.main, sub: h.sub, seed: num(q.seed) ?? 45 });
    const gold = num(q.gold);
    const pots = num(q.potions) ?? 0;
    const hp = num(q.hp);
    const maxHp = num(q.maxHp);
    r.update((s) => {
      if (maxHp !== undefined) s.maxHp = maxHp;
      if (hp !== undefined) s.hp = Math.min(s.maxHp, hp);
      if (gold !== undefined) s.gold = gold;
      const ids = ['P01', 'P03', 'P07'];
      for (let i = 0; i < Math.min(pots, s.potions.length); i++) s.potions[i] = ids[i];
    });
    return r;
  };
}

const num = (s: string | undefined) => (s !== undefined && s !== '' && !Number.isNaN(Number(s)) ? Number(s) : undefined);

export function registerP4(d: P4Deps) {
  const q = d.query;
  const { engine } = d;
  const live = () => !!d.run?.active;
  /** ?page= 直达调试：没有正式局时临时开一个不落盘的 RunSession（#122 PR3 删演示背包，一律走 RunSession） */
  const dbg = debugRun(q);
  const cur = () => (live() ? d.run! : dbg());
  const inv = () => cur().inventory;
  const rng = () => cur().rng('economy');
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
  engine.scenes.register(
    'rest',
    () =>
      new RestScene({
        ...env,
        inventory: inv,
        // 营地淬炼走 event 随机流（#122 PR3，runstate-migration.md §6）
        rng: () => cur().rng('event'),
        run: () => restRunOf(cur()),
        done: done({ type: 'rest_done' }),
        wx: q.wx === '1',
        debugState: live() ? undefined : q.rest,
      }),
  );
  const kind = (['normal', 'elite', 'boss'].includes(q.reward ?? '') ? q.reward : 'normal') as BattleKind;
  engine.scenes.register('reward', () => new RewardScene({ ...env, inventory: inv, rng, done: done({ type: 'reward_done' }), defaultKind: kind }));
  engine.scenes.register('shop', () => new ShopScene({ ...env, inventory: inv, rng, done: done({ type: 'shop_done' }) }));
  const force = q.chest === 'gold' || q.chest === 'relic' ? q.chest : undefined;
  engine.scenes.register('chest', () => new ChestScene({ ...env, inventory: inv, rng, done: done({ type: 'chest_done' }), force }));
  return { debug: dbg };
}
