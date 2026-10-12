/**
 * H5 发布入口（P0）：Canvas 引擎骨架 + 触控回显。战斗画面在 P2/P3 接入；
 * 可玩的 DOM 原型在调试构建里（debug.html，`npm run dev:debug` / `npm run build:debug`）。
 */
import './style.css';
import { Engine } from '../../engine/engine';
import type { GestureEvent } from '../../engine/input';
import { DEFAULT_RENDER_CONFIG } from '../../engine/settings';
import { createWebPlatform } from './platform';

const root = document.getElementById('app')!;
const platform = createWebPlatform(root);
let last: GestureEvent | null = null;

/** 配置开关：构建变量 VITE_WEBGL=0 可默认关闭；运行时 URL `?webgl=0|1` 优先 */
const cfg = { ...DEFAULT_RENDER_CONFIG, webgl: import.meta.env.VITE_WEBGL !== '0' };

const engine = new Engine(
  platform,
  {
    gesture(e) {
      if (e.type !== 'longpressprogress') last = e;
      engine.invalidate('main');
    },
    draw(layer, s) {
      const { ctx } = s;
      const w = engine.width;
      const h = engine.height;
      if (layer === 'bg') {
        ctx.fillStyle = '#2a0f0c'; // B 金漆屏风漆面底色（占位）
        ctx.fillRect(0, 0, w, h);
      } else if (layer === 'ambient') {
        ctx.clearRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#d9b46a';
        ctx.font = '16px sans-serif';
        ctx.fillText?.('墨卷三国 · 引擎骨架（P0）', 16, 40);
        ctx.fillText?.(`WebGL 叠加层：${engine.webgl.enabled ? '开' : '关'}（${engine.webgl.reason}）  dpr ${engine.dpr}`, 16, 64);
        const mb = (n: number) => (n / 1048576).toFixed(1);
        ctx.fillText?.(`纹理内存：${mb(engine.budget.used)} / ${mb(engine.budget.totalLimit)} MB`, 16, 88);
        if (last) {
          const at = 'at' in last ? last.at : null;
          ctx.fillText?.(`手势：${last.type}${at ? ` (${at.x.toFixed(0)}, ${at.y.toFixed(0)})` : ''}`, 16, 112);
          if (at) ctx.fillRect(at.x - 6, at.y - 6, 12, 12);
        }
      }
    },
  },
  cfg,
);
engine.start();
(window as unknown as { __engine: Engine }).__engine = engine;
