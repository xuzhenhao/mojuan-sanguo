# 郭嘉 · 标志性特征清单

> 定稿立绘：`docs/art/refs/guojia-G2a-source.jpg`（G2a 源图）；竖裁四尺寸 `refs/guojia-512x712.png` / `-256x356.png` / `-128x178.png` / `-70x98.png`，灰度图同名加 `-gray`。
> 参考图：标杆 `refs/lvbu-tight-a2.jpg`（a2）+ 画风来源 `refs/lvbu-C3-b-canonical.jpg`（C3-b）。画风与前缀见 `style-C-flat-ink.md`。验收：每项在 70×98 灰度图里可见。

## 标志特征
| # | 特征 | prompt 写法 | 70 灰度可见要求 |
|---|---|---|---|
| 1 | 松散发髻 + 金黑发带（不戴冠，区别于曹操高冠、刘备小冠） | loose messy topknot tied with a gold-and-black ribbon, no crown | 头顶小黑团 + 飘带细线 |
| 2 | 朱漆酒葫芦 + 红流苏，持于胸前 | red-lacquered wine gourd with a red tassel, held against the chest | 胸前深色葫芦轮廓 |
| 3 | 靛蓝外袍 + 白色内袍 | indigo robe over a white inner robe | 白领 V 形亮面 + 两侧暗面 |
| 4 | 慵懒浅笑 | languid half-smile, relaxed tilted head | 眉眼可辨 |

> 酒葫芦对应 render-spec §13 对郭嘉的建议（病弱谋士、持酒葫芦），与“持扇文士”剪影拉开。

## Prompt（【通用前缀】+【气质·谋士】+ G2a 描述）
```
Card game character portrait of Guo Jia, Three Kingdoms strategist, modern stylized ink illustration for mobile game: ink linework with flat muted color blocks (ink black, deep red, ochre, gold), dry-brush uneven line weight, loose flying hair strands, splashed red cape/ink accents, simple beige rice-paper background, no text.
young, strikingly handsome, refined slim face, sharp brows, languid knowing smile; elegant and unrestrained, not rugged, not bulky, not old, not cartoon/anime/clean vector.
loose messy topknot tied with a gold-and-black ribbon, red-lacquered wine gourd with a red tassel held against the chest, indigo robe over a white inner robe.
half-body, full topknot with headroom above, gourd inside the frame.
```
Reference images: `lvbu-tight-a2.jpg` (a2) + `lvbu-C3-b-canonical.jpg` (C3-b)，整图文生图，每次生成都传入。

## 定稿 G2a 竖裁记录（`guojia-G2a-source.jpg`，1280×720，全高 518 宽窗口 x400–918）✅ 用户已确认
- 发髻完整，髻顶距顶边约 9px；葫芦完整（源图约 x640–804），距左边约 240px、右边约 114px。只裁掉右侧墨溅与发梢。
- 70×98 灰度图里眉眼与浅笑清楚，葫芦在白领前成深色块。

## 剪影对比
- 70 灰度剪影对比图：`refs/guojia-silhouette-compare.png`（依次为刘备 L1、吕布 a2、曹操 C1、郭嘉 G2a）。G2a 无冠、只有松髻，胸前葫芦，与刘备小冠 + 交叉双剑、吕布戟 + 双翎、曹操高冠 + 竖剑都能一眼分开。

## 候选与用户决定
- **第一轮 G1–G3**：用户选 G2 方向（酒葫芦），但 G2 原图髻顶被源图裁掉、竹简大半出框，要求重出：髻完整留顶部余量、葫芦贴身。G1（黑冠 + 羽扇）、G3（高黑帽 + 毛氅 + 杖）弃用，不存档。
- **重出 G2a / G2b / G2c**：
  - **G2a：主立绘**，进游戏。
  - **G2b：弃用，不存档**。葫芦举在肩旁离身，距左边仅约 38px。
  - **G2c：弃用，不存档**。金色发带左半被裁，脸被葫芦遮挡偏小。
