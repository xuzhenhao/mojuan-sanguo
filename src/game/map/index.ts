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

let session: MapSession | null = null;

export function mapSession(engine: Engine, chapter = 1, seed?: number): MapSession {
  const store = engine.platform.storage;
  const q = engine.platform.launchQuery().seed;
  const saved = MapSession.load(store);
  const runSeed = seed ?? (q != null && q !== '' ? Number(q) >>> 0 : (saved?.runSeed ?? Math.floor(engine.platform.now() * 1000) >>> 0));
  if (!session || session.runSeed !== runSeed || session.chapter !== chapter)
    session = new MapSession(runSeed, chapter, MAP_CONFIG, poolsOf(chapter), store, saved);
  return session;
}
/** 新建局时调用（点将出征），丢弃旧地图 */
export function resetMapSession() {
  session = null;
}

/** HUD 数据源：局状态接入前的默认值（主将 = 默认主将，体力取其上限） */
export function defaultHud(): HudInfo {
  const h = CONFIG.heroes[CONFIG.rules.defaultHeroes.main];
  const hp = h?.hp ?? 8;
  return { hp, maxHp: hp, gold: 99, potions: [null, null, null], hero: h?.name ?? '将' };
}

export function createMapScene(engine: Engine, go: (e: FlowEvent, p: MapRouteParams) => void, hud: () => HudInfo = defaultHud) {
  const s = mapSession(engine);
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
