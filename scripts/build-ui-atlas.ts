/**
 * 生成 ui_sharp 图集（render-spec §12.5 / §14）：印章图标 + 2 套位图数字，全部 2x，阴影/描边烘焙进像素。
 * 源：art/src/icons/*.svg、art/src/fonts/DejaVuSerif-Bold.ttf（数字字形，仅构建期使用）
 * 产物：public/assets/atlases/ui_sharp.{png,json}、public/assets/fonts/{num_w,num_gold}.json
 * 用法：npx tsx scripts/build-ui-atlas.ts [--sheets <dir>]（--sheets 额外输出 icons-sheet.png / digits-sheet.png 预览）
 */
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const ICON_DIR = join(ROOT, 'art/src/icons');
const FONT = join(ROOT, 'art/src/fonts/DejaVuSerif-Bold.ttf');
const OUT_ATLAS = join(ROOT, 'public/assets/atlases');
const OUT_FONT = join(ROOT, 'public/assets/fonts');
const ATLAS = 1024;
const PAD = 2; // 帧间距，防采样串色

type Img = { w: number; h: number; data: Uint8Array };
function render(svg: string, fitWidth?: number): Img {
  const r = new Resvg(svg, {
    font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: 'DejaVu Serif' },
    fitTo: fitWidth ? { mode: 'width', value: fitWidth } : { mode: 'original' },
    shapeRendering: 2,
    textRendering: 2,
  }).render();
  return { w: r.width, h: r.height, data: new Uint8Array(r.pixels) };
}
function blit(dst: Img, src: Img, dx: number, dy: number, sx = 0, sy = 0, w = src.w, h = src.h) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = ((sy + y) * src.w + sx + x) * 4,
        d = ((dy + y) * dst.w + dx + x) * 4;
      for (let k = 0; k < 4; k++) dst.data[d + k] = src.data[s + k];
    }
}
function toPng(img: Img) {
  const p = new PNG({ width: img.w, height: img.h });
  p.data = Buffer.from(img.data);
  return PNG.sync.write(p, { colorType: 6 });
}
function alphaBox(img: Img) {
  let x0 = img.w,
    x1 = -1,
    y0 = img.h,
    y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.data[(y * img.w + x) * 4 + 3] > 4) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  return { x0, x1, y0, y1 };
}

// ---------- 位图数字（render-spec §2 num-*，§10：①白字黑描边 ②金字） ----------
export const GLYPHS = '0123456789+-/%×x:.';
const FONTS = {
  num_w: { fill: '#F3EBD8', stroke: '#070302', sw: 5, grad: '' },
  num_gold: {
    fill: 'url(#g)',
    stroke: '#3A1E08',
    sw: 5,
    grad: '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1C2"/><stop offset=".45" stop-color="#F4DC9A"/><stop offset=".55" stop-color="#E9C877"/><stop offset="1" stop-color="#B98A3C"/></linearGradient>',
  },
} as const;
/** 两档光栅：L=68px（num-xl/l/m，20–34dp）；S=28px（num-s，9–14dp，描边相对加粗，避免缩小后糊成一团） */
const SIZES = [
  { key: 'L', px: 68, sw: 5, blur: 1.6, dy: 2 },
  { key: 'S', px: 28, sw: 3.2, blur: 0.7, dy: 1 },
] as const;
type Size = (typeof SIZES)[number];
const baseY = (s: Size) => Math.round(s.px * 1.09);
function glyphSvg(ch: string, f: (typeof FONTS)[keyof typeof FONTS], z: Size) {
  const esc = ch === '&' ? '&amp;' : ch;
  const W = Math.round(z.px * 1.4),
    H = W;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${f.grad}<filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="${z.blur}"/><feOffset dy="${z.dy}"/><feComponentTransfer><feFuncA type="linear" slope=".9"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<text x="${W / 2}" y="${baseY(z)}" text-anchor="middle" font-family="DejaVu Serif" font-weight="bold" font-size="${z.px}" fill="${f.fill}" stroke="${f.stroke}" stroke-width="${z.sw}" stroke-linejoin="round" paint-order="stroke" filter="url(#s)">${esc}</text></svg>`;
}

interface Item {
  name: string;
  img: Img;
  kind: 'icon' | 'glyph';
  font?: string;
  ch?: string;
}
function main() {
  const sheetsArg = process.argv.indexOf('--sheets');
  const sheetsDir = sheetsArg > 0 ? process.argv[sheetsArg + 1] : undefined;
  const items: Item[] = [];
  const iconIds = readdirSync(ICON_DIR)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.slice(0, -4))
    .sort();
  for (const id of iconIds) items.push({ name: id, kind: 'icon', img: render(readFileSync(join(ICON_DIR, id + '.svg'), 'utf8')) });
  // 字形：统一纵向裁切（共享基线），横向按墨迹裁切
  const fontMeta: Record<string, { top: number; bottom: number; glyphs: Item[]; z: Size; font: string }> = {};
  for (const [fn, f] of Object.entries(FONTS))
    for (const z of SIZES) {
      const fname = `${fn}:${z.key}`;
      const gl = [...GLYPHS].map((ch) => ({ ch, img: render(glyphSvg(ch, f, z)) }));
      let top = 999,
        bottom = 0;
      for (const g of gl) {
        const b = alphaBox(g.img);
        top = Math.min(top, b.y0);
        bottom = Math.max(bottom, b.y1);
      }
      fontMeta[fname] = { top, bottom, glyphs: [], z, font: fn };
      for (const g of gl) {
        const b = alphaBox(g.img);
        const w = b.x1 - b.x0 + 1,
          h = bottom - top + 1;
        const img: Img = { w, h, data: new Uint8Array(w * h * 4) };
        blit(img, g.img, 0, 0, b.x0, top, w, h);
        const it: Item = { name: `${fname}/${g.ch}`, kind: 'glyph', font: fname, ch: g.ch, img };
        items.push(it);
        fontMeta[fname].glyphs.push(it);
      }
    }
  // 货架装箱（按高度降序）
  const pos = new Map<Item, { x: number; y: number }>();
  const sorted = [...items].sort((a, b) => b.img.h - a.img.h || b.img.w - a.img.w);
  let x = 0,
    y = 0,
    rowH = 0;
  for (const it of sorted) {
    if (x + it.img.w > ATLAS) {
      x = 0;
      y += rowH + PAD;
      rowH = 0;
    }
    pos.set(it, { x, y });
    x += it.img.w + PAD;
    rowH = Math.max(rowH, it.img.h);
  }
  const usedH = y + rowH;
  if (usedH > ATLAS) throw new Error(`ui_sharp 超出 ${ATLAS}²：${usedH}`);
  const atlas: Img = { w: ATLAS, h: ATLAS, data: new Uint8Array(ATLAS * ATLAS * 4) };
  for (const it of items) {
    const p = pos.get(it)!;
    blit(atlas, it.img, p.x, p.y);
  }
  mkdirSync(OUT_ATLAS, { recursive: true });
  mkdirSync(OUT_FONT, { recursive: true });
  writeFileSync(join(OUT_ATLAS, 'ui_sharp.png'), toPng(atlas));
  const frames: Record<string, unknown> = {};
  for (const it of items.filter((i) => i.kind === 'icon')) {
    const p = pos.get(it)!;
    frames[it.name] = { frame: { x: p.x, y: p.y, w: it.img.w, h: it.img.h }, sourceSize: { w: 56, h: 56 }, pad: 4, size1x: { w: 24, h: 24 } };
  }
  writeFileSync(
    join(OUT_ATLAS, 'ui_sharp.json'),
    JSON.stringify(
      {
        meta: {
          image: 'ui_sharp.png',
          size: { w: ATLAS, h: ATLAS },
          scale: 2,
          format: 'RGBA8888',
          usedHeight: usedH,
          generator: 'scripts/build-ui-atlas.ts',
          note: '图标帧 56×56@2x：内容 48×48 + 四周 4px 烘焙阴影；绘制 24dp 图标时目标矩形向外扩 2dp。数字字形见 public/assets/fonts/*.json',
        },
        frames,
      },
      null,
      1,
    ) + '\n',
  );
  const fontOut: Record<string, Record<string, unknown>> = {};
  for (const m of Object.values(fontMeta)) {
    const digitW = Math.max(...m.glyphs.filter((g) => /\d/.test(g.ch!)).map((g) => g.img.w));
    const OVERLAP = Math.round(m.z.sw * 1.2); // 描边 + 阴影外扩，相邻字形叠压
    const chars = m.glyphs.map((g) => {
      const p = pos.get(g)!;
      const digit = /\d/.test(g.ch!);
      const xoffset = digit ? Math.floor((digitW - g.img.w) / 2) : 0;
      return {
        id: g.ch!.codePointAt(0),
        char: g.ch,
        x: p.x,
        y: p.y,
        width: g.img.w,
        height: g.img.h,
        xoffset,
        yoffset: 0,
        xadvance: (digit ? digitW : g.img.w) - OVERLAP,
      };
    });
    const minus = chars.find((c) => c.char === '-')!;
    chars.push({ ...minus, id: 0x2212, char: '−' }); // U+2212 与 '-' 共用字形
    const o = {
      info: { face: m.font, size: m.z.px, scale: 2, tabularDigits: true },
      common: { lineHeight: m.bottom - m.top + 1, base: baseY(m.z) - m.top, scaleW: ATLAS, scaleH: ATLAS, pages: ['../atlases/ui_sharp.png'] },
      chars,
      kernings: [],
    };
    if (m.z.key === 'L') fontOut[m.font] = { ...o, ...fontOut[m.font] };
    else (fontOut[m.font] ??= {}).small = o;
  }
  for (const [fn, o] of Object.entries(fontOut)) writeFileSync(join(OUT_FONT, fn + '.json'), JSON.stringify(o, null, 1) + '\n');
  console.log(
    `ui_sharp ${ATLAS}²：${iconIds.length} 图标 + ${GLYPHS.length}×${Object.keys(FONTS).length}套×${SIZES.length}档 字形，已用高度 ${usedH}px，RGBA8 ${((ATLAS * ATLAS * 4) / 1048576).toFixed(2)}MB`,
  );
  if (sheetsDir) sheets(sheetsDir, items, pos, iconIds, atlas);
}

function sheets(dir: string, items: Item[], pos: Map<Item, { x: number; y: number }>, ids: string[], atlas: Img) {
  mkdirSync(dir, { recursive: true });
  const uri = (img: Img) => 'data:image/png;base64,' + toPng(img).toString('base64');
  const cols = 8,
    cw = 120,
    ch = 92,
    half = Math.ceil(ids.length / cols) * ch + 40;
  const panel = (bg: string, fg: string, oy: number, label: string) => {
    let s = `<rect y="${oy}" width="${cols * cw}" height="${half}" fill="${bg}"/><text x="10" y="${oy + 26}" font-size="16" fill="${fg}">${label}</text>`;
    ids.forEach((id, i) => {
      const it = items.find((t) => t.name === id)!;
      const cx = (i % cols) * cw,
        cy = oy + 40 + Math.floor(i / cols) * ch;
      s += `<image href="${uri(it.img)}" x="${cx + 10}" y="${cy}" width="56" height="56"/><image href="${uri(it.img)}" x="${cx + 74}" y="${cy + 16}" width="28" height="28"/>`;
      s += `<text x="${cx + 60}" y="${cy + 76}" font-size="11" text-anchor="middle" fill="${fg}">${id}</text>`;
    });
    return s;
  };
  const W = cols * cw,
    H = half * 2;
  const svgS = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="DejaVu Serif">${panel('#22100B', '#E9C877', 0, 'lacquer lac-2 : left 2x(56px) / right 1x(28px)')}${panel('#F3EBD8', '#1A1A1A', half, 'paper : left 2x / right 1x')}</svg>`;
  writeFileSync(join(dir, 'icons-sheet.png'), toPng(render(svgS)));
  // 数字预览：各字号（dp→1x 像素）在两种底上排字
  const fonts = ['num_w', 'num_gold'];
  const samples = ['0123456789', '-12 +3 3/5', '×2 50% 1:30', '7 88 999'];
  const sizes = [34, 22, 16, 13, 11, 9];
  let body = '';
  let oy = 0;
  for (const bg of ['#22100B', '#F3EBD8']) {
    body += `<rect y="${oy}" width="1000" height="${sizes.length * fonts.length * 44 + 20}" fill="${bg}"/>`;
    oy += 10;
    for (const f of fonts) {
      const meta = JSON.parse(readFileSync(join(OUT_FONT, f + '.json'), 'utf8'));
      for (const sz of sizes) {
        const fm = sz * 2 <= 28 ? meta.small : meta;
        const k = sz / fm.info.size;
        let x = 10;
        body += `<text x="${x}" y="${oy + 26}" font-size="11" fill="${bg === '#F3EBD8' ? '#1A1A1A' : '#E9C877'}">${f} ${sz}dp@1x</text>`;
        x = 150;
        for (const smp of samples) {
          for (const c of smp) {
            if (c === ' ') {
              x += sz * 0.5;
              continue;
            }
            const g = fm.chars.find((q: { char: string }) => q.char === c);
            const it: Img = { w: g.width, h: g.height, data: new Uint8Array(g.width * g.height * 4) };
            blit(it, atlas, 0, 0, g.x, g.y, g.width, g.height);
            body += `<image href="${uri(it)}" x="${x + g.xoffset * k}" y="${oy + 4}" width="${g.width * k}" height="${g.height * k}"/>`;
            x += g.xadvance * k;
          }
          x += 30;
        }
        oy += 44;
      }
    }
    oy += 10;
  }
  writeFileSync(
    join(dir, 'digits-sheet.png'),
    toPng(render(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${oy}" font-family="DejaVu Serif">${body}</svg>`)),
  );
  writeFileSync(join(dir, 'ui_sharp-preview.png'), toPng(atlas));
}
main();
