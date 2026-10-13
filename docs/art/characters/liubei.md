# 刘备 · 标志性特征清单

> 定稿立绘：`docs/art/refs/liubei-L1-source.jpg`（L1 源图）；竖裁四尺寸 `refs/liubei-512x712.png` / `-256x356.png` / `-128x178.png` / `-70x98.png`，灰度图同名加 `-gray`。
> 参考图：标杆 `refs/lvbu-tight-a2.jpg`（a2）+ 画风来源 `refs/lvbu-C3-b-canonical.jpg`（C3-b）。画风与前缀见 `style-C-flat-ink.md`。验收：每项在 70×98 灰度图里可见。

## 标志特征
| # | 特征 | prompt 写法 | 70 灰度可见要求 |
|---|---|---|---|
| 1 | 青玉镶金小冠（刻意区别于曹操的高冠） | small green-jade-and-gold crown, not a tall crown | 头顶小亮块，高度明显低于曹操高冠 |
| 2 | 双股剑，胸前交叉 | twin swords held crossed in front of the chest | 两条斜线交叉成 X |
| 3 | 青绿袍 + 札甲 | green robe over lamellar armor | 中灰袍面 + 甲片纹理 |
| 4 | 红披风 | red cape | 两侧大块暗面 |
| 5 | 短山羊胡 | short goatee | 下巴暗点 |

## Prompt（【通用前缀】+【气质】+ L1 描述）
```
Card game character portrait of Liu Bei, Three Kingdoms warrior, modern stylized ink illustration for mobile game: ink linework with flat muted color blocks (ink black, deep red, ochre, gold), dry-brush uneven line weight, loose flying hair strands, splashed red cape/ink accents, simple beige rice-paper background, no text.
young, strikingly handsome, refined slim face, sharp brows, cold proud gaze; elegant and domineering, not rugged, not bulky, not old, not cartoon/anime/clean vector.
small green-jade-and-gold crown (not a tall crown), twin swords held crossed in front of the chest, green robe over lamellar armor, red cape, short goatee.
half-body, room for a vertical crop, sword tips and crown inside the frame.
```
Reference images: `lvbu-tight-a2.jpg` (a2) + `lvbu-C3-b-canonical.jpg` (C3-b)，每次生成都传入。

## 定稿 L1 竖裁记录（`liubei-L1-source.jpg`，1280×720，全高 518 宽窗口 x387–905）✅ 用户已确认
- 两剑尖与冠完整；右剑尖距右边约 7px。只裁掉右侧红色墨溅和披风边缘。
- 脸宽约占框宽 23%。
- 70×98 灰度图里眉眼、胡须清楚，冠为亮块。

## 候选与用户决定
- **L1：主立绘**，进游戏。
- **L2：弃用，不存档**。双股剑读不出来（一剑竖持、一剑入鞘），70 灰度眉部偏淡。
- **L3：弃用，不存档**。头巾读起来像士兵，且与陆逊的纶巾冲突。
