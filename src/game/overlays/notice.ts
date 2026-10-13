/**
 * 通用顶部提示钩子（#122 读档 / 中途刷新回退 toast，runstate-migration.md §4/§5）。
 * PR2 只给占位样式（墨底白字条，2.5s）；PR3 替换 setNoticeRenderer 做正式样式。
 */
import type { OverlayHandle, OverlayStack } from '../../engine/modal';
import type { Surface } from '../../engine/surfaces';
import { center } from '../result/paint';

export const NOTICE_MS = 2500;
export type NoticeRenderer = (s: Surface, text: string, t: number) => void;

const placeholder: NoticeRenderer = (s, text) => {
  const c = s.ctx;
  c.fillStyle = 'rgba(20,16,12,0.86)';
  c.fillRect(45, 64, 300, 40);
  center(c, text, 195, 90, '16px Brush', '#F4EBD9', 16);
};
let renderer: NoticeRenderer = placeholder;
export function setNoticeRenderer(r: NoticeRenderer | null) {
  renderer = r ?? placeholder;
}

/** 弹出提示（非模态，不挡输入）；text 为空则不弹 */
export function showNotice(ov: Pick<OverlayStack, 'push'>, text: string | null, ms = NOTICE_MS): OverlayHandle | null {
  if (!text) return null;
  let t = 0;
  const h: OverlayHandle = ov.push({
    id: 'notice',
    kind: 'toast',
    modal: false,
    draw: (s) => renderer(s, text, t),
    animating: () => true,
    update(dt) {
      t += dt;
      if (t >= ms) h.close();
    },
  });
  return h;
}
