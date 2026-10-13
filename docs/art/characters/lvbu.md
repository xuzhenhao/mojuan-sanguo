# 吕布 · 标志性特征清单（武将模板）

> 标杆图：`docs/art/refs/lvbu-tight-a2.jpg`（512 竖裁 `refs/lvbu-final-512.png`）；画风来源：`docs/art/refs/lvbu-C3-b-canonical.jpg`。画风与前缀见 `style-C-flat-ink.md`。
> 外部参考见 `docs/art/refs/lvbu/SOURCES.md`（只借识别元素，不描摹）。验收：每项在 70×98 灰度图里可见。

## 标志特征
| # | 特征 | prompt 写法 | 70 灰度可见要求 |
|---|---|---|---|
| 1 | 金冠 + 双长雉翎 | gold crown with two long banded pheasant tail feathers 雉翎 rising like antennae | 冠亮块 + 两条斜纹弧线 |
| 2 | 方天画戟 | fangtian ji halberd | 月牙刃/戟头轮廓可辨 |
| 3 | 红黑金甲袍、红披风 | splashed red cape, black-and-gold armor | 大块暗红面 |
| 4 | 俊美冷傲的脸 | young, strikingly handsome, refined slim face, sharp brows, cold proud gaze | 眉眼可辨 |

## Prompt
```
Card game character portrait of Lü Bu, Three Kingdoms warrior, modern stylized ink illustration for mobile game: ink linework with flat muted color blocks (ink black, deep red, ochre, gold), dry-brush uneven line weight, loose flying hair strands, splashed red cape/ink accents, simple beige rice-paper background, no text.
young, strikingly handsome, refined slim face, sharp brows, cold proud gaze; elegant and domineering, not rugged, not bulky, not old, not cartoon/anime/clean vector.
gold crown with two long banded pheasant tail feathers rising like antennae, fangtian ji halberd.
half-body, room for a vertical crop, weapon head and feathers inside the frame.
```
Reference image: `lvbu-tight-a2.jpg` (style source: `lvbu-C3-b-canonical.jpg`).

## C3-b 竖裁记录（已弃用为标杆，源图 1280×720，窗口 x260–778 全高）
- 内翎丢约 19%，外翎丢约 64%；戟头完全在窗口外（丢失）；脸宽约占框宽 46%。

## A 竖裁记录（已被 a2 取代）（`lvbu-tight-a.jpg`，1280×720，全高 518 宽窗口 x348–866）
- 两根翎各保留 100%（翎尖在源图顶边贴边几像素）；戟头完整（戟尖贴源图顶边）；脸宽约占框宽 22%。
- （原 512 竖裁已被 a2 覆盖）

## 定稿 a2 竖裁记录（`lvbu-tight-a2.jpg`，1280×720，全高 518 宽窗口 x280–798）
- 画面内容横跨约 x283（左月牙刃外缘）–x847（右翎尖），共约 564px，超过 518，无法同时完整保留戟头与两根翎。
- 取舍：戟头完整（左刃距左边约 3px、戟尖贴顶边）；左翎 100%（翎尖贴顶边）；右翎尖端约 x798–847 被裁（约末端 1/4 出框）。
- 脸宽约占框宽 18%。512 竖裁即 `refs/lvbu-final-512.png`；全部尺寸与灰度见 box `/workspace/art-lvbu-a2/`。
