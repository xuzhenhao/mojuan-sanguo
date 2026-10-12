/**
 * ui_sharp 图集与位图数字的数据格式与绘制辅助（产物由 scripts/build-ui-atlas.ts 生成）。
 * 图集：public/assets/atlases/ui_sharp.{png,json}（TexturePacker “hash” 风格 frames）
 * 数字：public/assets/fonts/{num_w,num_gold}.json（BMFont JSON 风格；顶层 = L 档 68px@2x，small = S 档 28px@2x）
 * 坐标单位：图集像素为 2x；绘制参数用 dp。
 */
export interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  /** 2x 像素：四周为烘焙阴影预留的外扩 */
  pad: number;
}
export interface AtlasJson {
  meta: { image: string; size: { w: number; h: number }; scale: number };
  frames: Record<string, AtlasFrame>;
}
export interface BitmapChar {
  id: number;
  char: string;
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
}
export interface BitmapFontFace {
  info: { face: string; size: number; scale: number };
  common: { lineHeight: number; base: number };
  chars: BitmapChar[];
}
export type BitmapFontJson = BitmapFontFace & { small?: BitmapFontFace };

type Ctx = Pick<CanvasRenderingContext2D, 'drawImage'>;

/** 画一个 icon：(x,y,size) 是内容区（不含阴影外扩），dp */
export function drawIcon(ctx: Ctx, img: CanvasImageSource, atlas: AtlasJson, id: string, x: number, y: number, size = 24) {
  const f = atlas.frames[id];
  if (!f) throw new Error(`ui_sharp 缺少图标 ${id}`);
  const k = size / (f.sourceSize.w - 2 * f.pad);
  const p = f.pad * k;
  ctx.drawImage(img, f.frame.x, f.frame.y, f.frame.w, f.frame.h, x - p, y - p, f.frame.w * k, f.frame.h * k);
}

/** 按目标字高（dp）选档：≤14dp 用 small */
export function pickFace(font: BitmapFontJson, sizeDp: number): BitmapFontFace {
  return sizeDp <= 14 && font.small ? font.small : font;
}
export function measureNumber(font: BitmapFontJson, text: string, sizeDp: number) {
  const face = pickFace(font, sizeDp);
  const k = sizeDp / face.info.size;
  let w = 0;
  for (const c of text) w += (face.chars.find((g) => g.char === c)?.xadvance ?? face.info.size * 0.5) * k;
  return w;
}
/** 画数字串；(x,y) 为左上角，sizeDp 为字号（对应 render-spec §2 num-*） */
export function drawNumber(ctx: Ctx, img: CanvasImageSource, font: BitmapFontJson, text: string, x: number, y: number, sizeDp: number) {
  const face = pickFace(font, sizeDp);
  const k = sizeDp / face.info.size;
  for (const c of text) {
    const g = face.chars.find((q) => q.char === c);
    if (!g) {
      x += face.info.size * 0.5 * k;
      continue;
    }
    ctx.drawImage(img, g.x, g.y, g.width, g.height, x + g.xoffset * k, y + g.yoffset * k, g.width * k, g.height * k);
    x += g.xadvance * k;
  }
  return x;
}
