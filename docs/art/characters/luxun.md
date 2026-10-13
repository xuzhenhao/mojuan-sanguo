# 陆逊 · 标志性特征清单

> 定稿立绘：`docs/art/refs/luxun-X4c-source.jpg`（X4c 源图）；竖裁四尺寸 `refs/luxun-512x712.png` / `-256x356.png` / `-128x178.png` / `-70x98.png`，灰度图同名加 `-gray`。
> 参考图：标杆 `refs/lvbu-tight-a2.jpg`（a2）+ 画风来源 `refs/lvbu-C3-b-canonical.jpg`（C3-b）。画风与前缀见 `style-C-flat-ink.md`。验收：每项在 70×98 灰度图里可见。

## 标志特征
| # | 特征 | prompt 写法 | 70 灰度可见要求 |
|---|---|---|---|
| 1 | 不戴冠，长发低束，白玉簪 | no crown, long hair loosely tied low with a white jade hairpin | 深色长发轮廓（簪太小，70 下不要求可见） |
| 2 | 白色长袍 + 青灰领缘 | white scholar's robe with grey-teal collar trim | 袍、图与纸底有约 40 级亮度差 + 墨线勾边 |
| 3 | 双手展开舆图，图上朱红连营线 | holding an unrolled campaign map marked with a vermilion line of linked camps | 横向展开的卷轴轮廓；朱红线为细弱波线 |

> 朱红连营线呼应技能「连营」（火烧连营）。刻意不用火焰（周瑜）、不戴冠、不持剑，与已定武将拉开。

## Prompt（【通用前缀】+【气质·书生】+ X4c 描述）
```
Card game character portrait of Lu Xun, Three Kingdoms strategist, modern stylized ink illustration for mobile game: ink linework with flat muted color blocks (ink black, deep red, ochre, gold), dry-brush uneven line weight, loose flying hair strands, splashed red cape/ink accents, simple beige rice-paper background, no text.
young, strikingly handsome, refined slim face, calm thoughtful gaze; gentle and composed scholar, not rugged, not bulky, not old, not cartoon/anime/clean vector.
no crown, long hair loosely tied low with a white jade hairpin, white scholar's robe with grey-teal collar trim, holding an unrolled campaign map marked with a vermilion line of linked camps.
half-body, headroom above the hair, whole map inside the frame.
```
Reference images: `lvbu-tight-a2.jpg` (a2) + `lvbu-C3-b-canonical.jpg` (C3-b)，整图文生图。

## 定稿 X4c 竖裁记录（`luxun-X4c-source.jpg`，1280×720，全高 518 宽窗口 x319–837）✅ 用户已确认
- 发顶距顶边约 22px。
- 舆图通宽约 532px（源图约 x312–844），超出 518，两端卷轴轴头各被裁约 7px；图面与朱红线完整在框内。

## 70 灰度检查
- 纸底约 204，白袍约 164，舆图约 162：袍与图比纸底暗约 40 级，加上墨线勾边，仍能与纸底分开，但整体偏浅。
- 朱红连营线在 70 灰度下只剩细弱的波线（70 彩图红色像素约 53，X4a 圆点版约 120），能看出“图上有一条线”，但不如圆点版醒目。用户知情后选定 X4c。
- 脸、眉眼与深色长发清楚。

## 剪影对比
- 70 灰度剪影对比图：`refs/luxun-silhouette-compare.png`（依次为刘备 L1、吕布 a2、曹操 C1、郭嘉 G2a、周瑜 Y2d-3、陆逊 X4c）。
- 区分：唯一不戴冠、不束高髻（对比刘备小冠、曹操高冠、周瑜小冠、郭嘉松髻、吕布双翎）；唯一浅色袍（其余都是深色或红色大面）；道具是横向展开的舆图，无兵器、无火焰（对比刘备交叉双剑、曹操竖剑、吕布戟、周瑜火纹琴、郭嘉葫芦）。

## 候选与用户决定
- **X1–X3**（白抹额 + 鞘剑、红绳马尾 + 书卷火把、玉冠 + 交叉火焰剑）：弃用。X2 书卷与火把放不进 518；X3 交叉双剑撞刘备、火焰撞周瑜。
- **按三国杀陆逊形象调研出的 X4–X6**（白衣舆图、白鹿书卷、纶巾连营图）：用户选 X4 方向，要求加 X6 的朱红连营点。X5 鹿角放不进 518，X6 弃用。
- **X4a / X4b / X4c**（同一白衣舆图，连营分别画成大圆点、细链、朱红线）：
  - **X4c：主立绘**，进游戏。
  - X4a（大圆点）、X4b（细链）弃用，不存档。
