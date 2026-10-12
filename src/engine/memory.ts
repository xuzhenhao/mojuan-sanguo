/**
 * 纹理内存记账与资源管理（engine-design §4.7.1，对齐 render-spec §12）。
 * - 总预算 50MB，超过 45MB 告警，并依次：①按 LRU 淘汰烘焙缓存；②卸载非当前场景的图集。
 * - 每张纹理按格式记录字节数（RGBA8 4 B/px、ETC2 RGBA 1、ETC2 RGB/EAC R11 0.5、ASTC 6×6 0.445、
 *   RGBA4444/RGB565 2、R8 1）。禁止 mipmap（render-spec §12.3）。
 * - 1MB = 1024² B。
 */
export const MB = 1024 * 1024;

export type TextureFormat = 'rgba8' | 'etc2_rgba' | 'etc2_rgb' | 'eac_r11' | 'astc_6x6' | 'rgba4444' | 'rgb565' | 'r8';
export const BYTES_PER_PIXEL: Record<TextureFormat, number> = {
  rgba8: 4,
  etc2_rgba: 1,
  etc2_rgb: 0.5,
  eac_r11: 0.5,
  astc_6x6: 0.445,
  rgba4444: 2,
  rgb565: 2,
  r8: 1,
};

/** 类别与 render-spec §12.4 的行对应 */
export type TextureCategory = 'framebuffer' | 'atlas' | 'fx' | 'bake' | 'text';

export interface TextureEntry {
  id: string;
  category: TextureCategory;
  width: number;
  height: number;
  format: TextureFormat;
  bytes: number;
  /** 所属场景；'resident' 为常驻 */
  scene?: string;
}

export interface BudgetWarning {
  kind: 'warn' | 'over';
  used: number;
  limit: number;
  trigger: string;
  /** 告警后通过淘汰回收的字节数 */
  reclaimed: number;
}

export const MAX_TEXTURE_SIZE = 2048;

export function textureBytes(width: number, height: number, format: TextureFormat = 'rgba8') {
  return Math.ceil(Math.ceil(width) * Math.ceil(height) * BYTES_PER_PIXEL[format]);
}

export interface TrackOptions {
  format?: TextureFormat;
  scene?: string;
  /** 必须为 false：禁止 mipmap */
  mipmaps?: boolean;
}

/** 告警时回收内存的处理者，返回回收字节数 */
export type Reclaimer = (needBytes: number) => number;

export class TextureBudget {
  private entries = new Map<string, TextureEntry>();
  private warned = false;
  private reclaimers: Reclaimer[] = [];
  private reclaiming = false;
  constructor(
    readonly totalLimit = 50 * MB,
    readonly warnAt = 45 * MB,
    private onWarn: (w: BudgetWarning) => void = () => {},
  ) {}

  /** 注册回收器；按注册顺序调用（先 LRU 缓存，再非当前场景图集） */
  addReclaimer(r: Reclaimer) {
    this.reclaimers.push(r);
  }

  track(id: string, category: TextureCategory, width: number, height: number, opt: TrackOptions = {}): TextureEntry {
    if (opt.mipmaps) throw new Error(`禁止 mipmap（render-spec §12.3）：${id}`);
    if (width > MAX_TEXTURE_SIZE || height > MAX_TEXTURE_SIZE) throw new Error(`单张纹理不得超过 ${MAX_TEXTURE_SIZE}²：${id} ${width}×${height}`);
    const format = opt.format ?? 'rgba8';
    const e: TextureEntry = { id, category, width, height, format, bytes: textureBytes(width, height, format), scene: opt.scene };
    this.entries.set(id, e);
    this.check(id);
    return e;
  }
  release(id: string) {
    const ok = this.entries.delete(id);
    if (ok) this.check(`release:${id}`);
    return ok;
  }
  has(id: string) {
    return this.entries.has(id);
  }
  get used() {
    let n = 0;
    for (const e of this.entries.values()) n += e.bytes;
    return n;
  }
  usedBy(c: TextureCategory) {
    let n = 0;
    for (const e of this.entries.values()) if (e.category === c) n += e.bytes;
    return n;
  }
  report() {
    const cats: TextureCategory[] = ['framebuffer', 'atlas', 'fx', 'bake', 'text'];
    return { used: this.used, warnAt: this.warnAt, limit: this.totalLimit, categories: cats.map((c) => ({ category: c, used: this.usedBy(c) })) };
  }
  isOverBudget() {
    return this.used > this.totalLimit;
  }
  /** 超过告警线：回收到告警线以下；仍超时告警（越线一次只告警一次） */
  private check(trigger: string) {
    if (this.reclaiming) return;
    if (this.used <= this.warnAt) {
      this.warned = false;
      return;
    }
    this.reclaiming = true;
    let reclaimed = 0;
    try {
      for (const r of this.reclaimers) {
        if (this.used <= this.warnAt) break;
        reclaimed += r(this.used - this.warnAt);
      }
    } finally {
      this.reclaiming = false;
    }
    if (!this.warned) {
      this.warned = true;
      this.onWarn({ kind: this.used > this.totalLimit ? 'over' : 'warn', used: this.used, limit: this.totalLimit, trigger, reclaimed });
    }
    if (this.used <= this.warnAt) this.warned = false;
  }
}

/** 烘焙缓存类别与 LRU 上限（render-spec §12.2） */
export type BakeClass = 'hand' | 'bigcard' | 'enemy' | 'general' | 'badge' | 'detail' | 'mapscroll';
export const BAKE_LRU_CAPS: Record<BakeClass, number> = { hand: 12, bigcard: 4, enemy: 6, general: 4, badge: 40, detail: 1, mapscroll: 1 };

/** 缓存位图烘焙倍率：低端机 1.5x，中高端 2x（render-spec §12.2/§12.5） */
export function bakeScale(lowEnd: boolean, dpr: number) {
  return Math.min(dpr, lowEnd ? 1.5 : 2);
}

interface BakeEntry<T> {
  key: string;
  cls: BakeClass;
  scene: string;
  value: T;
  lastDraw: number;
}

/**
 * 烘焙缓存：只缓存在屏对象；每类有 LRU 上限；对象离屏或离开场景时释放。
 * value 由调用方创建（离屏画布等），dispose 负责释放底层资源。
 */
export class BakeCache<T = unknown> {
  private map = new Map<string, BakeEntry<T>>();
  private clock = 0;
  constructor(
    private budget: TextureBudget,
    private dispose: (v: T) => void = () => {},
    readonly caps: Record<BakeClass, number> = BAKE_LRU_CAPS,
  ) {
    budget.addReclaimer((need) => this.evictBytes(need));
  }
  get size() {
    return this.map.size;
  }
  count(cls: BakeClass) {
    let n = 0;
    for (const e of this.map.values()) if (e.cls === cls) n++;
    return n;
  }
  /** 取缓存；没有则调用 make 烘焙。每次调用视为“被绘制”，刷新 LRU 次序 */
  get(key: string, cls: BakeClass, scene: string, w: number, h: number, make: () => T): T {
    const hit = this.map.get(key);
    if (hit) {
      hit.lastDraw = ++this.clock;
      return hit.value;
    }
    const caps = this.caps[cls];
    while (this.count(cls) >= caps) this.evictOldest(cls);
    const value = make();
    this.map.set(key, { key, cls, scene, value, lastDraw: ++this.clock });
    this.budget.track(`bake:${key}`, 'bake', w, h, { scene });
    return value;
  }
  /** 对象离屏或内容失效 */
  drop(key: string) {
    const e = this.map.get(key);
    if (!e) return false;
    this.map.delete(key);
    this.budget.release(`bake:${key}`);
    this.dispose(e.value);
    return true;
  }
  /** 离开场景：清空该场景的全部缓存 */
  clearScene(scene: string) {
    for (const e of [...this.map.values()]) if (e.scene === scene) this.drop(e.key);
  }
  private evictOldest(cls?: BakeClass) {
    let o: BakeEntry<T> | null = null;
    for (const e of this.map.values()) if ((!cls || e.cls === cls) && (!o || e.lastDraw < o.lastDraw)) o = e;
    if (o) this.drop(o.key);
    return o;
  }
  private evictBytes(need: number) {
    let got = 0;
    while (got < need && this.map.size) {
      const before = this.budget.used;
      if (!this.evictOldest()) break;
      got += before - this.budget.used;
    }
    return got;
  }
}

/** 图集定义（render-spec §12.3） */
export interface AtlasDef {
  name: string;
  width: number;
  height: number;
  /** 'resident' 常驻；否则列出需要它的场景 */
  scenes: 'resident' | string[];
  opaque?: boolean;
}

export const SPEC_ATLASES: AtlasDef[] = [
  { name: 'ui_common', width: 2048, height: 2048, scenes: 'resident' },
  { name: 'fx', width: 1024, height: 1024, scenes: 'resident' },
  { name: 'cards_art_1', width: 1024, height: 1024, scenes: 'resident' },
  { name: 'cards_art_2', width: 1024, height: 1024, scenes: 'resident' },
  { name: 'bg_lacquer', width: 1024, height: 2048, scenes: 'resident', opaque: true },
  { name: 'generals_battle', width: 1024, height: 1024, scenes: ['battle', 'map', 'reward', 'shop', 'result'] },
  { name: 'generals_select', width: 2048, height: 1024, scenes: ['select'] },
  { name: 'enemies_ch1', width: 2048, height: 1024, scenes: ['battle'] },
];

/** 选择纹理格式：ASTC 优先，其次 ETC2，否则 4444/565；不回退 RGBA8（render-spec §12.3） */
export function pickFormat(ext: { astc?: boolean; etc2?: boolean }, opaque = false): TextureFormat {
  if (ext.astc) return 'astc_6x6';
  if (ext.etc2) return opaque ? 'etc2_rgb' : 'etc2_rgba';
  return opaque ? 'rgb565' : 'rgba4444';
}

/**
 * 图集按场景加载/释放（引用计数）。P0 只做记账与生命周期；真实下载/上传在 P4 接入 load/unload 回调。
 * 2D 路径（WebGL 关闭）下图片会被浏览器解码为 RGBA8，传 format='rgba8'。
 */
export class AtlasManager {
  private loaded = new Map<string, { def: AtlasDef; refs: Set<string> }>();
  current: string | null = null;
  constructor(
    private budget: TextureBudget,
    private defs: AtlasDef[] = SPEC_ATLASES,
    private format: (d: AtlasDef) => TextureFormat = (d) => pickFormat({ etc2: true }, d.opaque),
    private hooks: { load?(d: AtlasDef): void; unload?(d: AtlasDef): void } = {},
  ) {
    budget.addReclaimer(() => this.unloadInactive());
  }
  isLoaded(name: string) {
    return this.loaded.has(name);
  }
  /** 进入场景：加载常驻与该场景所需图集，释放上一场景独有的图集 */
  enterScene(scene: string) {
    const prev = this.current;
    this.current = scene;
    for (const d of this.defs) if (d.scenes === 'resident' || d.scenes.includes(scene)) this.retain(d, scene);
    if (prev && prev !== scene) this.leaveScene(prev);
  }
  leaveScene(scene: string) {
    for (const [name, a] of [...this.loaded]) {
      a.refs.delete(scene);
      if (a.def.scenes !== 'resident' && a.refs.size === 0) this.unload(name);
    }
    if (this.current === scene) this.current = null;
  }
  private retain(d: AtlasDef, scene: string) {
    let a = this.loaded.get(d.name);
    if (!a) {
      a = { def: d, refs: new Set() };
      this.loaded.set(d.name, a);
      this.budget.track(`atlas:${d.name}`, 'atlas', d.width, d.height, {
        format: this.format(d),
        scene: d.scenes === 'resident' ? 'resident' : scene,
        mipmaps: false,
      });
      this.hooks.load?.(d);
    }
    a.refs.add(d.scenes === 'resident' ? 'resident' : scene);
  }
  private unload(name: string) {
    const a = this.loaded.get(name);
    if (!a) return 0;
    const before = this.budget.used;
    this.loaded.delete(name);
    this.budget.release(`atlas:${name}`);
    this.hooks.unload?.(a.def); // deleteTexture
    return before - this.budget.used;
  }
  /** 回收：卸载当前场景用不到的非常驻图集 */
  private unloadInactive() {
    let got = 0;
    for (const [name, a] of [...this.loaded]) {
      const d = a.def;
      if (d.scenes === 'resident') continue;
      if (this.current && d.scenes.includes(this.current)) continue;
      got += this.unload(name);
    }
    return got;
  }
}
