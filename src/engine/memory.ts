/**
 * 纹理内存记账（engine-design §4.7.1）：总预算 ≤50MB，按类别分配。
 * 所有位图（图集、立绘、离屏画布、烘焙缓存、WebGL 纹理/画布）在创建时登记、释放时注销。
 * 估算按解码后 RGBA8 计（w*h*4）；GPU 压缩纹理可传入实际 bytesPerPixel。
 */
export type TextureCategory = 'screen' | 'ui' | 'cards' | 'portraits' | 'fx' | 'reserve';

export const MB = 1024 * 1024;

/** 50MB 内的类别分配（理由见 engine-design §4.7.1） */
export const DEFAULT_CATEGORY_BUDGET: Record<TextureCategory, number> = {
  screen: 17.5 * MB,
  ui: 11 * MB,
  cards: 5.5 * MB,
  portraits: 6 * MB,
  fx: 8 * MB,
  reserve: 2 * MB,
};

export interface TextureEntry {
  id: string;
  category: TextureCategory;
  width: number;
  height: number;
  bytes: number;
}

export interface BudgetWarning {
  kind: 'total' | 'category';
  category?: TextureCategory;
  used: number;
  limit: number;
  trigger: string;
}

export function textureBytes(width: number, height: number, bytesPerPixel = 4) {
  return Math.ceil(width) * Math.ceil(height) * bytesPerPixel;
}

export class TextureBudget {
  private entries = new Map<string, TextureEntry>();
  private over = new Set<string>();
  constructor(
    readonly totalLimit = 50 * MB,
    readonly categoryLimits: Record<TextureCategory, number> = DEFAULT_CATEGORY_BUDGET,
    private onWarn: (w: BudgetWarning) => void = () => {},
  ) {}

  /** 登记一张纹理；同 id 重复登记视为替换（如画布改尺寸） */
  track(id: string, category: TextureCategory, width: number, height: number, bytesPerPixel = 4): TextureEntry {
    const e: TextureEntry = { id, category, width, height, bytes: textureBytes(width, height, bytesPerPixel) };
    this.entries.set(id, e);
    this.check(id);
    return e;
  }
  release(id: string) {
    const e = this.entries.get(id);
    if (!e) return false;
    this.entries.delete(id);
    this.check(id);
    return true;
  }
  /** 释放某类别全部（例如离开选将页释放立绘） */
  releaseCategory(c: TextureCategory) {
    for (const [id, e] of this.entries) if (e.category === c) this.entries.delete(id);
    this.check(`release:${c}`);
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
    const cats = Object.keys(this.categoryLimits) as TextureCategory[];
    return {
      used: this.used,
      limit: this.totalLimit,
      categories: cats.map((c) => ({ category: c, used: this.usedBy(c), limit: this.categoryLimits[c] })),
    };
  }
  isOverBudget() {
    return this.used > this.totalLimit;
  }
  /** 只在“刚越线”时告警一次，回落后再次越线会再告警 */
  private check(trigger: string) {
    const flag = (key: string, used: number, limit: number, w: Omit<BudgetWarning, 'used' | 'limit' | 'trigger'>) => {
      if (used > limit) {
        if (!this.over.has(key)) {
          this.over.add(key);
          this.onWarn({ ...w, used, limit, trigger });
        }
      } else this.over.delete(key);
    };
    flag('total', this.used, this.totalLimit, { kind: 'total' });
    for (const c of Object.keys(this.categoryLimits) as TextureCategory[])
      flag(`cat:${c}`, this.usedBy(c), this.categoryLimits[c], { kind: 'category', category: c });
  }
}
