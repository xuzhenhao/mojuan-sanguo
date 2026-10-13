/**
 * 地图页装配：从配置建 MapSession（同一局复用），创建 MapScene。
 * 局种子：URL ?seed= 优先（H5 调试，PRD 10.1），其次续玩存档，否则新随机。
 */
import type { Engine } from '../../engine/engine';
import { MAP_CONFIG, enemyGlyph, enemyName, poolsOf } from '../../data/map';
import { CONFIG } from '../../data/config';
import type { FlowEvent } from '../flow';
import type { MapRouteParams } from './route';
import { MapScene } from './scene';
import { MapSession, type HudInfo } from './session';
import { loadRunSave } from '../../core/run/save';

let session: MapSession | null = null;

/** 点将结果（主/副将 id） */
export interface HeroPick {
  main: string;
  sub: string;
}
const heroHp = (id: string) => CONFIG.heroes[id]?.hp ?? 8;

export function mapSession(engine: Engine, chapter = 1, seed?: number, heroes?: HeroPick | null): MapSession {
  const q = engine.platform.launchQuery().seed;
  const runSeed = seed ?? (q != null && q !== '' ? Number(q) >>> 0 : (MapSession.savedSeed() ?? Math.floor(engine.platform.now() * 1000) >>> 0));
  if (!session || session.runSeed !== runSeed || session.chapter !== chapter) {
    const d = heroes ?? CONFIG.rules.defaultHeroes;
    session = new MapSession(
      runSeed,
      chapter,
      MAP_CONFIG,
      poolsOf(chapter),
      undefined,
      () => {
        const h = defaultHud(d.main);
        return {
          schema: 1,
          version: '0.2.0',
          configVersion: 'dev',
          heroMain: d.main,
          heroSub: d.sub,
          hp: h.hp,
          maxHp: h.maxHp,
          gold: h.gold,
          deck: [],
          relics: [],
          potions: [],
          battleState: null,
          battleStartSnapshot: null,
        };
      },
      undefined,
      MAP_CONFIG.rest,
    );
  }
  if (heroes) syncHeroes(session, heroes);
  return session;
}
/** 新建局时调用（点将出征），丢弃旧地图 */
export function resetMapSession() {
  session = null;
}

/**
 * 存档头里的主副将与本局点将结果不一致（旧存档 / 同 seed 复用会话时写了默认武将）→ 改写主副将，
 * 体力上限按新主将：原来满血则满血，否则不超过新上限。
 */
export function syncHeroes(s: MapSession, heroes: HeroPick) {
  const h = s.head();
  const saved = loadRunSave();
  const persisted = !!saved && saved.runSeed === s.runSeed && saved.chapter === s.chapter;
  if (h.heroMain === heroes.main && h.heroSub === heroes.sub) {
    // 新局首次进地图就落盘，刷新后也能按存档恢复主副将
    if (!persisted) s.save();
    return;
  }
  const maxHp = heroHp(heroes.main);
  const hp = h.heroMain === heroes.main ? h.hp : h.hp >= h.maxHp || h.hp <= 0 ? maxHp : Math.min(h.hp, maxHp);
  s.save({ heroMain: heroes.main, heroSub: heroes.sub, ...(h.heroMain === heroes.main ? {} : { hp, maxHp }) });
}

/** HUD 数据源：局状态接入前的默认值（主将默认取 rules.defaultHeroes，体力取其上限） */
export function defaultHud(main: string = CONFIG.rules.defaultHeroes.main): HudInfo {
  const h = CONFIG.heroes[main];
  const hp = h?.hp ?? 8;
  return { hp, maxHp: hp, gold: 99, potions: [null, null, null], hero: h?.name ?? '将' };
}

export function createMapScene(
  engine: Engine,
  go: (e: FlowEvent, p: MapRouteParams) => void,
  hud?: () => HudInfo,
  runSeed: () => number | undefined = () => undefined,
  /** 点将结果（entry 传 run.params）；刷新后无局会话时为空，沿用存档里的主副将 */
  heroes: () => HeroPick | null | undefined = () => undefined,
) {
  const s = mapSession(engine, 1, runSeed(), heroes());
  // HUD 主将 / 体力 / 铜钱读本局存档（营地回血后即时反映）
  hud ??= () => {
    const h = s.head();
    return { ...defaultHud(h.heroMain || undefined), hp: h.hp, maxHp: h.maxHp, gold: h.gold };
  };
  const boss = s.state.boss;
  return new MapScene({
    session: s,
    hud,
    bossName: enemyName(boss).split('·')[0],
    bossGlyph: enemyGlyph(boss),
    overlays: engine.overlays,
    bakes: engine.bakes,
    bakeScale: engine.bakeScale,
    createOffscreen: (w, h) => engine.platform.createOffscreen(w, h),
    go,
    layerSpacing: MAP_CONFIG.layerSpacing,
    moveMs: MAP_CONFIG.moveMs,
    pulseMs: MAP_CONFIG.pulseMs,
  });
}
