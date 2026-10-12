/**
 * 渲染开关（engine-design §4.12）：WebGL 是可选叠加层。
 * 优先级：URL/启动参数 `webgl=0|1` > 配置默认值 > 平台能力探测。
 * 自动降级（按设备分档 / 帧率）延后到微信上线前，这里不做。
 */
export interface RenderConfig {
  /** 默认是否开启 WebGL 水墨叠加层 */
  webgl: boolean;
  /** DPR 上限（render-spec：3）；低端自动降 DPR 由后续分档逻辑覆盖 */
  maxDpr: number;
  /** 纹理内存总预算（字节），见 memory.ts */
  textureBudgetBytes: number;
  /** 告警线（render-spec §12.5：45MB） */
  textureWarnBytes: number;
  /** 低端机：缓存按 1.5x 烘焙（render-spec §12.2） */
  lowEnd: boolean;
  /** 资源半尺寸分级开关（render-spec §12.5，默认开）；URL `?half=0` 可关闭 */
  halfSizeAssets: boolean;
}

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  webgl: true,
  maxDpr: 2,
  textureBudgetBytes: 50 * 1024 * 1024,
  textureWarnBytes: 45 * 1024 * 1024,
  lowEnd: false,
  halfSizeAssets: true,
};

export type WebGLDecision = { enabled: boolean; reason: 'query' | 'config' | 'unsupported' };

/** 解析 `webgl` 参数：0/false/off → 关；1/true/on → 开；其他 → 未指定 */
export function parseFlag(v: string | undefined): boolean | undefined {
  if (v == null) return undefined;
  const s = v.trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(s)) return false;
  if (['1', 'true', 'on', 'yes'].includes(s)) return true;
  return undefined;
}

/**
 * 决定是否启用 WebGL 叠加层。`supported` 为平台能否创建 WebGL 上下文；
 * 不支持时即使参数要求开启也关闭（这不是“降级”，只是能力缺失）。
 */
export function decideWebGL(cfg: Pick<RenderConfig, 'webgl'>, query: Record<string, string>, supported: () => boolean): WebGLDecision {
  const q = parseFlag(query.webgl);
  const want = q ?? cfg.webgl;
  const reason = q != null ? 'query' : 'config';
  if (!want) return { enabled: false, reason };
  if (!supported()) return { enabled: false, reason: 'unsupported' };
  return { enabled: true, reason };
}

export function effectiveDpr(deviceDpr: number, maxDpr: number) {
  return Math.max(1, Math.min(deviceDpr || 1, maxDpr));
}
