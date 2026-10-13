/**
 * 移动视口溢出检测（#111 render-spec §4.0）。无头 Chromium 打开构建产物，每个页面 × 每个视口：
 *  1) 文档不出现横/纵向滚动（scrollWidth/Height ≤ 视口）；
 *  2) 上屏 canvas 的 CSS 矩形完全落在 visualViewport 内；
 *  3) 拦截所有 2D 绘制（fillText / drawImage / fillRect / strokeRect / roundRect / arc / rect），按当前变换算出包围盒，
 *     与「上屏 canvas 在视口内的可见区」比较：非满屏背景的内容只要有一部分画到可见区外就记为裁切。
 * 用法：npm run build && npx vite preview --port 4173 &  node scripts/viewport-check.mjs [--base http://localhost:4173/mojuan-sanguo/] [--out dir]
 * 依赖 playwright（不进项目依赖；npx -y playwright 或全局安装）。退出码 1 = 有溢出。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg('base', 'http://localhost:4173/mojuan-sanguo/');
const OUT = arg('out', 'viewport-report');
const PAGES = arg('pages', 'select,map,battle,reward,shop,chest,result').split(',');
// 宽 360/390/412/465 + 带地址栏的矮屏（Chrome 安卓地址栏+状态栏约占 120px）
const VIEWPORTS = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
  { name: '465x1024', width: 465, height: 1024 },
  { name: '465x900-addrbar', width: 465, height: 900 },
  { name: '390x664-addrbar', width: 390, height: 664 },
  { name: '360x560-addrbar', width: 360, height: 560 },
];

const INSTRUMENT = () => {
  const P = CanvasRenderingContext2D.prototype;
  const rec = (window.__draws = []);
  const box = (ctx, x, y, w, h, kind) => {
    const m = ctx.getTransform();
    const pts = [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ].map(([a, b]) => [m.a * a + m.c * b + m.e, m.b * a + m.d * b + m.f]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const c = ctx.canvas;
    if (!c.__id) c.__id = window.__cid = (window.__cid ?? 0) + 1;
    rec.push({ c: c.__id, cw: c.width, ch: c.height, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), kind });
    if (rec.length > 200000) rec.splice(0, 100000);
  };
  const wrap = (name, f) => {
    const o = P[name];
    if (!o) return;
    P[name] = function (...a) {
      try {
        const b = f.call(this, ...a);
        if (b) box(this, ...b, name + (name === 'fillText' ? ':' + String(a[0]).slice(0, 12) : ''));
      } catch {
        // 统计失败不影响绘制
      }
      return o.apply(this, a);
    };
  };
  wrap('fillText', function (t, x, y) {
    const m = this.measureText(String(t));
    const al = this.textAlign;
    const w = m.width;
    const x0 = al === 'center' ? x - w / 2 : al === 'right' || al === 'end' ? x - w : x;
    const asc = m.actualBoundingBoxAscent || 0;
    const desc = m.actualBoundingBoxDescent || 0;
    return [x0, y - asc, w, asc + desc];
  });
  // 路径：记录 beginPath 之后各段的设备坐标包围盒，fill / stroke 时作为一次绘制
  const pathPt = (ctx, x, y) => {
    const m = ctx.getTransform();
    const px = m.a * x + m.c * y + m.e;
    const py = m.b * x + m.d * y + m.f;
    const b = (ctx.__pb ??= { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    b.x0 = Math.min(b.x0, px);
    b.y0 = Math.min(b.y0, py);
    b.x1 = Math.max(b.x1, px);
    b.y1 = Math.max(b.y1, py);
  };
  const tap = (name, f) => {
    const o = P[name];
    if (!o) return;
    P[name] = function (...a) {
      try {
        f(this, ...a);
      } catch {
        // 统计失败不影响绘制
      }
      return o.apply(this, a);
    };
  };
  tap('beginPath', (c) => (c.__pb = null));
  tap('moveTo', (c, x, y) => pathPt(c, x, y));
  tap('lineTo', (c, x, y) => pathPt(c, x, y));
  tap('quadraticCurveTo', (c, cx, cy, x, y) => (pathPt(c, cx, cy), pathPt(c, x, y)));
  tap('bezierCurveTo', (c, a, b, d, e, x, y) => (pathPt(c, a, b), pathPt(c, d, e), pathPt(c, x, y)));
  tap('rect', (c, x, y, w, h) => (pathPt(c, x, y), pathPt(c, x + w, y + h)));
  tap('roundRect', (c, x, y, w, h) => (pathPt(c, x, y), pathPt(c, x + w, y + h)));
  tap('arc', (c, x, y, r) => (pathPt(c, x - r, y - r), pathPt(c, x + r, y + r)));
  tap('ellipse', (c, x, y, rx, ry) => (pathPt(c, x - rx, y - ry), pathPt(c, x + rx, y + ry)));
  const flush = (kind) => (c) => {
    const b = c.__pb;
    if (!b || !isFinite(b.x0)) return;
    const m = c.getTransform();
    c.setTransform(1, 0, 0, 1, 0, 0);
    box(c, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, kind);
    c.setTransform(m);
  };
  tap('fill', flush('path.fill'));
  tap('stroke', flush('path.stroke'));
  wrap('fillRect', (x, y, w, h) => [x, y, w, h]);
  wrap('strokeRect', (x, y, w, h) => [x, y, w, h]);
  wrap('drawImage', (img, ...a) => (a.length >= 8 ? [a[4], a[5], a[6], a[7]] : a.length >= 4 ? [a[0], a[1], a[2], a[3]] : [a[0], a[1], img.width, img.height]));
};

const ANALYZE = () => {
  const vv = window.visualViewport ?? { width: innerWidth, height: innerHeight, offsetLeft: 0, offsetTop: 0 };
  const scr = document.getElementById('screen');
  const r = scr.getBoundingClientRect();
  const doc = document.scrollingElement;
  const res = {
    vw: vv.width,
    vh: vv.height,
    canvas: { x: r.left, y: r.top, w: r.width, h: r.height, pw: scr.width, ph: scr.height },
    docScroll: { w: doc.scrollWidth, h: doc.scrollHeight },
    problems: [],
  };
  if (doc.scrollWidth > vv.width + 1) res.problems.push(`文档横向溢出 scrollWidth ${doc.scrollWidth} > ${vv.width}`);
  if (doc.scrollHeight > vv.height + 1) res.problems.push(`文档纵向溢出 scrollHeight ${doc.scrollHeight} > ${vv.height}`);
  if (r.right > vv.width + 1 || r.bottom > vv.height + 1 || r.left < -1 || r.top < -1)
    res.problems.push(
      `canvas 超出视口：${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}（视口 ${vv.width}×${vv.height}）`,
    );
  // 可见区（以各画布自身像素计）：canvas 与视口交集，按比例换算到每块画布
  const visW = Math.min(r.right, vv.width) - Math.max(r.left, 0);
  const visH = Math.min(r.bottom, vv.height) - Math.max(r.top, 0);
  const fx0 = (Math.max(r.left, 0) - r.left) / r.width;
  const fy0 = (Math.max(r.top, 0) - r.top) / r.height;
  const fx1 = fx0 + visW / r.width;
  const fy1 = fy0 + visH / r.height;
  // 只看与上屏画布同比例的图层（场景层 / 上屏），只取最近 2 帧的绘制
  const ratio = scr.width / scr.height;
  const draws = (window.__draws ?? []).filter((d) => d.cw > 0 && Math.abs(d.cw / d.ch - ratio) < 0.02);
  const clipped = new Map();
  for (const d of draws) {
    const W = d.cw;
    const H = d.ch;
    const bw = d.x1 - d.x0;
    const bh = d.y1 - d.y0;
    if (bw <= 0 || bh <= 0) continue;
    if (bw >= W * 0.9 || bh >= H * 0.9) continue; // 满屏背景 / 遮罩
    if (d.kind === 'drawImage' && bw >= W * 0.8) continue;
    const L = fx0 * W,
      T = fy0 * H,
      R = fx1 * W,
      B = fy1 * H;
    const tol = 2;
    const out = d.x0 < L - tol || d.y0 < T - tol || d.x1 > R + tol || d.y1 > B + tol;
    const inside = d.x1 > L && d.y1 > T && d.x0 < R && d.y0 < B; // 至少部分可见 = 被裁一半（全在外面的离屏元素忽略）
    const hidden = !inside && d.x0 < R + W && d.y0 < B + H && d.x1 > L && d.y1 > T - H; // 画在可见区右/下方之外（整块看不见）
    if (hidden) {
      const key = `hidden:${d.kind.split(':')[0]}`;
      const v = clipped.get(key) ?? { kind: d.kind.split(':')[0], side: '整块不可见', n: 0, worst: 0, ex: '' };
      const s = 1 / (d.cw / r.width);
      v.n++;
      const over = Math.max(d.x1 - R, d.y1 - B) * s;
      if (over > v.worst) {
        v.worst = over;
        v.ex = `[${Math.round(d.x0 * s)},${Math.round(d.y0 * s)}–${Math.round(d.x1 * s)},${Math.round(d.y1 * s)}]css`;
      }
      clipped.set(key, v);
    }
    if (out && inside) {
      const side = [d.x1 > R + tol && '右', d.y1 > B + tol && '下', d.x0 < L - tol && '左', d.y0 < T - tol && '上'].filter(Boolean).join('');
      const key = `${d.kind}@${side}`;
      const s = 1 / (d.cw / r.width);
      const v = clipped.get(key) ?? { kind: d.kind, side, n: 0, worst: 0, ex: '' };
      const over = Math.max(d.x1 - R, d.y1 - B, L - d.x0, T - d.y0) * s;
      v.n++;
      if (over > v.worst) {
        v.worst = over;
        v.ex = `[${Math.round(d.x0 * s)},${Math.round(d.y0 * s)}–${Math.round(d.x1 * s)},${Math.round(d.y1 * s)}]css`;
      }
      clipped.set(key, v);
    }
  }
  res.clipped = [...clipped.entries()].map(([key, v]) => ({ key, ...v }));
  return res;
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const rows = [];
let bad = 0;
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const page of PAGES) {
    const p = await ctx.newPage();
    await p.addInitScript(INSTRUMENT);
    await p.goto(`${BASE}?page=${page}&seed=7`, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    await p.waitForTimeout(400);
    const r = await p.evaluate(ANALYZE);
    const shot = `${OUT}/${page}-${vp.name}.png`;
    await p.screenshot({ path: shot });
    rows.push({ page, vp: vp.name, ...r, shot });
    await p.close();
  }
  await ctx.close();
}
await browser.close();
// 以设计尺寸 390×844 为基线：基线下已越界的同类绘制（宽幅装饰光、手牌横向滚动区）视为设计如此，只报基线下不存在的裁切
const REF = '390x844';
for (const r of rows) {
  const ref = rows.find((x) => x.page === r.page && x.vp === REF);
  const base = new Map((ref?.clipped ?? []).map((c) => [c.key, c.worst]));
  for (const c of r.clipped) {
    const extra = c.worst - (base.get(c.key) ?? 0);
    if (c.worst >= 4 && extra >= 4 && !base.get(c.key))
      r.problems.push(`内容裁切（${c.side}）${c.kind} ×${c.n}，最多超出 ${Math.round(c.worst)}px（基线 ${Math.round(base.get(c.key) ?? 0)}），例 ${c.ex}`);
  }
  if (r.problems.length) bad++;
}
const md = ['# 移动视口溢出检测', '', '| 页面 | 视口 | 结果 | 问题 | 截图 |', '|---|---|---|---|---|'];
for (const r of rows) md.push(`| ${r.page} | ${r.vp} | ${r.problems.length ? '❌' : '✅'} | ${r.problems.join('<br>') || ''} | ${r.shot} |`);
writeFileSync(`${OUT}/report.md`, md.join('\n') + '\n');
writeFileSync(`${OUT}/report.json`, JSON.stringify(rows, null, 2));
console.log(md.join('\n'));
console.log(`\n${bad}/${rows.length} 组有溢出`);
process.exit(bad ? 1 : 0);
