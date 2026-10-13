# 曹操 · 标志性特征清单

> 定稿立绘：`docs/art/refs/caocao-C1-source.jpg`（C1 源图）；竖裁四尺寸 `refs/caocao-512x712.png` / `-256x356.png` / `-128x178.png` / `-70x98.png`，灰度图同名加 `-gray`。
> 参考图：标杆 `refs/lvbu-tight-a2.jpg`（a2）+ 画风来源 `refs/lvbu-C3-b-canonical.jpg`（C3-b）。画风与前缀见 `style-C-flat-ink.md`。验收：每项在 70×98 灰度图里可见。

## 标志特征
| # | 特征 | prompt 写法 | 70 灰度可见要求 |
|---|---|---|---|
| 1 | 黑金高冠（约为刘备小冠的两倍高，二者一眼可分） | tall black-and-gold crown | 头顶高方块，明显高于刘备小冠 |
| 2 | 倚天剑，胸前竖握剑柄（单剑竖直，区别于刘备双剑交叉） | Yitian sword held upright by the hilt in front of the chest | 中轴一条竖线 + 金色剑格 |
| 3 | 紫黑袍 + 黑金甲 | purple-black robe over black-and-gold armor | 大块暗面 + 金色细边 |
| 4 | 暗红披风 | dark red cape | 两侧暗面 |
| 5 | 细八字胡 + 山羊胡 | thin mustache and goatee | 唇上与下巴暗线 |

## Prompt（【通用前缀】+【气质】+ C1 描述）
```
Card game character portrait of Cao Cao, Three Kingdoms warrior, modern stylized ink illustration for mobile game: ink linework with flat muted color blocks (ink black, deep red, ochre, gold), dry-brush uneven line weight, loose flying hair strands, splashed red cape/ink accents, simple beige rice-paper background, no text.
young, strikingly handsome, refined slim face, sharp brows, cold proud gaze; elegant and domineering, not rugged, not bulky, not old, not cartoon/anime/clean vector.
tall black-and-gold crown, Yitian sword held upright by the hilt in front of the chest, purple-black robe over black-and-gold armor, dark red cape, thin mustache and goatee.
half-body, room for a vertical crop, crown and sword hilt inside the frame.
```
Reference images: `lvbu-tight-a2.jpg` (a2) + `lvbu-C3-b-canonical.jpg` (C3-b)，每次生成都传入。

## 定稿 C1 竖裁记录（`caocao-C1-source.jpg`，1280×720，全高 518 宽窗口 x385–903）✅ 用户已确认
- 高冠完整，冠顶距源图顶边约 2px；剑柄、剑格在框内，剑身向下出框。只裁掉右侧披风墨溅和左侧发梢。
- 脸宽约占框宽 23%。
- 70×98 灰度图里眉眼清楚（剑眉、细目、胡须）。

## 剪影对比
- 70 灰度剪影对比图：`refs/caocao-silhouette-compare.png`（依次为刘备 L1、吕布 a2、C1、C2、C3；源文件在 box `/workspace/art-caocao/silhouette-compare.png`）。C1 的高冠 + 单竖剑与刘备的小冠 + 交叉双剑、吕布的戟与双翎都能一眼分开。

## 候选与用户决定
- **C1：主立绘**，进游戏。
- **C2：弃用，不存档**。冠顶被源图裁掉，脸太柔，70 灰度下毛领与甲糊在一起。
- **C3：弃用，不存档**。冠顶被裁，面相偏粗犷，斜持剑与刘备的交叉双剑相似。
