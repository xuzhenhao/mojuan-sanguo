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
import { MapSession, type HudInfo, type MapPersist } from './session';
import { runSaveStore, type RunSave } from '../../core/run/save';
import { RunSession } from '../run';
import { allocCardUid, type RunState, type RunStateStore } from '../run/state';
import { starterDeck } from '../../data/cards';

let session: MapSession | null = null;

// ───────── 存档：地图读写 RunSession / RunState（#122 PR2，只写新键 mojuan.runstate.v1） ─────────
let boundRun: RunSession | null = null;
/** boundRun 是否是模块内默认会话（未经入口绑定）：resetMapSession 时一起清掉 */
let ownRun = false;
let boundStore: (() => RunStateStore | null) | null = null;
/** 入口绑定本局 RunSession 与存储；不绑定时（单测 / 直达）用模块内会话 + core/run/save 的可注入存储 */
export function bindMapRun(run: RunSession | null, store?: RunStateStore | null) {
  boundRun = run;
  ownRun = false;
  boundStore = store === undefined ? null : () => store;
}
export function mapRun(): RunSession {
  if (!boundRun) {
    boundRun = new RunSession();
    ownRun = true;
  }
  return boundRun;
}
const mapStore = (): RunStateStore | null => (boundStore ? boundStore() : runSaveStore());

/** RunState → 地图用的 RunSave 视图（只读；字段同旧存档头） */
export function saveViewOf(s: RunState): RunSave {
  return {
    schema: 1,
    version: 'runstate',
    configVersion: s.configVersion,
    runSeed: s.runSeed,
    chapter: s.chapter,
    heroMain: s.heroMain,
    heroSub: s.heroSub,
    hp: s.hp,
    maxHp: s.maxHp,
    gold: s.gold,
    deck: s.deck,
    relics: s.relics,
    potions: s.potions.filter((p): p is string => !!p),
    mapState: s.map as RunSave['mapState'],
    encounters: s.encounters,
    nodePath: s.map ? [...s.map.visited] : [],
    battleState: null,
    battleStartSnapshot: null,
    timestamp: s.startedAt,
  };
}
/** 读档：会话里有局就用；没有则从存储读（新键优先，旧键迁移一次并删除） */
export function loadMapSave(): RunSave | null {
  const run = mapRun();
  if (!run.active) {
    const st = mapStore();
    if (!st || !run.load(st).ok) return null;
  }
  return saveViewOf(run.state);
}
/** MapSession 的存档层：写入并进 RunState，再按 RunSession 规则写新键（节点内只写进节点快照） */
export function runPersist(): MapPersist {
  return {
    load: loadMapSave,
    write(v) {
      const run = mapRun();
      let fresh = false;
      if (!run.active || run.params?.seed !== v.runSeed >>> 0) {
        const main = v.heroMain || CONFIG.rules.defaultHeroes.main;
        const sub = v.heroSub || (main === CONFIG.rules.defaultHeroes.sub ? CONFIG.rules.defaultHeroes.main : CONFIG.rules.defaultHeroes.sub);
        run.start({ main, sub, seed: v.runSeed });
        fresh = true; // 新局：铜钱 / 牌组用 RunSession 开局值（地图默认头的铜钱是 HUD 占位值）
      }
      run.update((d) => {
        d.map = v.mapState;
        d.encounters = v.encounters;
        d.chapter = v.chapter;
        const changed = (!!v.heroMain && v.heroMain !== d.heroMain) || (!!v.heroSub && v.heroSub !== d.heroSub);
        if (v.heroMain) d.heroMain = v.heroMain;
        if (v.heroSub) d.heroSub = v.heroSub;
        // 同 seed 换武将：牌组按新主将重建起始牌（新 uid 取 nextUid），不沿用旧武将的牌
        if (changed && !fresh) d.deck = starterDeck(d.heroMain).map(([id, suit, rank]) => ({ uid: allocCardUid(d), id, suit, rank, mods: [] }));
        d.hp = v.hp;
        d.maxHp = v.maxHp;
        if (!fresh) d.gold = v.gold;
      });
      const st = mapStore();
      if (st) run.save(st);
    },
    enterNode(n) {
      mapRun().enterNode(n, mapStore() ?? undefined);
    },
    completeNode() {
      mapRun().completeNode(mapStore() ?? undefined);
    },
  };
}

/** 点将结果（主/副将 id） */
export interface HeroPick {
  main: string;
  sub: string;
}
const heroHp = (id: string) => CONFIG.heroes[id]?.hp ?? 8;

export function mapSession(engine: Engine, chapter = 1, seed?: number, heroes?: HeroPick | null): MapSession {
  const q = engine.platform.launchQuery().seed;
  const runSeed = seed ?? (q != null && q !== '' ? Number(q) >>> 0 : (MapSession.savedSeed(loadMapSave) ?? Math.floor(engine.platform.now() * 1000) >>> 0));
  if (!session || session.runSeed !== runSeed || session.chapter !== chapter) {
    const d = heroes ?? CONFIG.rules.defaultHeroes;
    session = new MapSession(
      runSeed,
      chapter,
      MAP_CONFIG,
      poolsOf(chapter),
      runPersist(),
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
  if (ownRun) boundRun?.clear();
}

/**
 * 存档头里的主副将与本局点将结果不一致（旧存档 / 同 seed 复用会话时写了默认武将）→ 改写主副将，
 * 体力上限按新主将：原来满血则满血，否则不超过新上限。
 */
export function syncHeroes(s: MapSession, heroes: HeroPick) {
  const h = s.head();
  const saved = loadMapSave();
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
