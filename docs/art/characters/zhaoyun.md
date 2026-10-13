# 赵云 · 标志性特征清单

> 定稿立绘：`docs/art/refs/zhaoyun-Z2-source.jpg`（Z2 源图）；竖裁四尺寸 `refs/zhaoyun-512x712.png` / `-256x356.png` / `-128x178.png` / `-70x98.png`，灰度图同名加 `-gray`。
> 参考图：标杆 `refs/lvbu-tight-a2.jpg`（a2）+ 画风来源 `refs/lvbu-C3-b-canonical.jpg`（C3-b）。画风与前缀见 `style-C-flat-ink.md`。验收：每项在 70×98 灰度图里可见。

## 标志特征
| # | 特征 | prompt 写法 | 70 灰度可见要求 |
|---|---|---|---|
| 1 | 不戴头盔，束发髻 + 银冠 | no helmet, hair tied in a topknot with a small silver crown | 头顶亮块 + 发髻轮廓 |
| 2 | 银枪 + 红缨 | silver spear with a red tassel below the spearhead | 枪尖与枪杆斜线可辨，红缨成暗块 |
| 3 | 白甲青绿点缀 | white armor with teal accents | 大块浅色甲面 |
| 4 | 白披风 | flowing white cape | 浅色大面与背景分开 |
| 5 | 俊美冷傲的脸 | young, strikingly handsome, refined slim face, sharp brows, cold proud gaze | 眉眼可辨 |

## Prompt（【通用前缀】+【气质】+ Z2 描述）
```
Card game character portrait of Zhao Yun, Three Kingdoms warrior, modern stylized ink illustration for mobile game: ink linework with flat muted color blocks (ink black, deep red, ochre, gold), dry-brush uneven line weight, loose flying hair strands, splashed red cape/ink accents, simple beige rice-paper background, no text.
young, strikingly handsome, refined slim face, sharp brows, cold proud gaze; elegant and domineering, not rugged, not bulky, not old, not cartoon/anime/clean vector.
no helmet, hair tied in a topknot with a small silver crown, white armor with teal accents, flowing white cape, silver spear with a red tassel.
half-body, room for a vertical crop, spearhead and crown inside the frame.
```
Reference images: `lvbu-tight-a2.jpg` (a2) + `lvbu-C3-b-canonical.jpg` (C3-b)，每次生成都传入。

## 定稿 Z2 竖裁记录（`zhaoyun-Z2-source.jpg`，全高 518 宽窗口 x300–818）✅ 用户已确认
- 枪尖完整，在源图里就贴顶边；银冠与发髻完整。
- 脸宽约占框宽 23%。
- 70×98 灰度图里眉眼是三张候选中最清楚的。

## 候选与用户决定
- **Z2：主立绘**，进游戏（上面四个尺寸）。
- **Z3：存档备选，不进游戏**。文件：`refs/zhaoyun-Z3-archive.jpg`、`refs/zhaoyun-Z3-archive-512x712.png`。注意：Z3 **未通过 70 灰度眉眼检查**（头盔压住眉部，脸与银甲混在一起）；若日后启用，70 尺寸需要贴脸重裁。
- **Z1：用户否决**，不入库。
