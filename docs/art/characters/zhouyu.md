# 周瑜 · 标志性特征清单

> 定稿立绘：`docs/art/refs/zhouyu-Y2d-3-source.jpg`（Y2d-3 源图）；竖裁四尺寸 `refs/zhouyu-512x712.png` / `-256x356.png` / `-128x178.png` / `-70x98.png`，灰度图同名加 `-gray`。
> 参考图：标杆 `refs/lvbu-tight-a2.jpg`（a2）+ 画风来源 `refs/lvbu-C3-b-canonical.jpg`（C3-b）。画风与前缀见 `style-C-flat-ink.md`。验收：每项在 70×98 灰度图里可见。

## 标志特征
| # | 特征 | prompt 写法 | 70 灰度可见要求 |
|---|---|---|---|
| 1 | 小金冠 + 红发带（冠小，区别于曹操高冠、吕布翎冠） | small gold crown with a red ribbon | 头顶小亮块 + 飘带细线 |
| 2 | 深红袍 + 白色内领 | deep red robe with a white inner collar | 白领 V 形亮面 + 大块暗面 |
| 3 | 竖持通长黑漆古琴，白色琴缘，金朱火焰纹 | long full-length upright black-lacquer guqin with a white rim and a gold-and-vermilion flame pattern | 白边勾出竖长琴身，内有亮色波纹 |

> 古琴呼应「曲有误，周郎顾」，火焰纹呼应赤壁之火（技能 纵火 / 赤焰）。

## Prompt（【通用前缀】+【气质】+ Y2d-3 描述）
```
Card game character portrait of Zhou Yu, Three Kingdoms commander, modern stylized ink illustration for mobile game: ink linework with flat muted color blocks (ink black, deep red, ochre, gold), dry-brush uneven line weight, loose flying hair strands, splashed red cape/ink accents, simple beige rice-paper background, no text.
young, strikingly handsome, refined slim face, sharp brows, cold proud gaze; elegant and domineering, not rugged, not bulky, not old, not cartoon/anime/clean vector.
small gold crown with a red ribbon, deep red robe with a white inner collar, long full-length upright black-lacquer guqin with a white rim and a gold-and-vermilion flame pattern held against the body.
half-body, crown with headroom above, whole guqin inside the frame including its bottom end.
```
Reference images: Y2b（`zhouyu` 前一版定稿，作为主参考，只加长古琴）+ `lvbu-tight-a2.jpg` (a2) + `lvbu-C3-b-canonical.jpg` (C3-b)，整图重绘。

## 定稿 Y2d-3 竖裁记录（`zhouyu-Y2d-3-source.jpg`，1280×720，全高 518 宽窗口 x400–918）✅ 用户已确认
- 冠顶距顶边约 7px。
- 古琴通长约 616px（源图约 y96–712，比 Y2b 的约 537px 长约 15%），琴首完整，琴尾下缘距底边约 8px，完整在框内。
- 70 灰度：白色琴缘勾出琴身，火焰纹为中灰波纹，仍可辨；眉眼清楚。

## 剪影对比
- 70 灰度剪影对比图：`refs/zhouyu-silhouette-compare.png`（依次为刘备 L1、吕布 a2、曹操 C1、郭嘉 G2a、周瑜 Y2d-3）。小冠 + 白边通长竖琴与刘备交叉双剑、吕布戟 + 双翎、曹操高冠 + 竖剑、郭嘉松髻 + 葫芦都能一眼分开。

## 候选与用户决定
- **第一轮 Y1–Y3**：用户选 Y2 方向（古琴）。Y1（金红冠 + 火焰剑，剪影接近曹操）、Y3（凤翼头饰 + 令旗，旗杆顶被裁、双翼像吕布双翎）弃用，不存档。
- **加火焰纹重出 Y2a / Y2b / Y2c**：选 Y2b（黑漆白边琴 + 朱金火焰）；Y2a（琴尾被裁、火焰 70 灰度看不出）、Y2c（横琴过宽）弃用。
- **加长古琴**：用户要求 Y2b 其余保持不变、只把琴加长。以 Y2b 为主参考整图重绘 Y2d-1…5：
  - **Y2d-3：主立绘**，进游戏。脸与 Y2b 接近，琴加长约 15%，琴尾完整。
  - Y2d-1（琴尾出框、脸偏离）、Y2d-2（琴几乎没加长、头部角度变）、Y2d-4（琴尾出框）、Y2d-5（火焰 70 灰度太淡）弃用，不存档。
  - Y2b 不再入库（被 Y2d-3 取代）。中途另试的 Y2b-1…3、Y2c-1…3 已取消，不存档。
