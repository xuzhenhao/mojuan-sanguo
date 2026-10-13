# 画风规范 C · 写意墨线（以参考原图为唯一基准）

> 状态：用户否决了 C1/C2/C3（粗剪影、面具脸）和 R1/R2/R3（太干净、太端正）。**以参考原图 `refs/lvbu-C-flat-ink.jpg` 为唯一基准**，要原图那种霸气又有点凌乱的美感。竖版变体 S1/S2/S3 待用户挑选；**选定前不批量出图**。
> 槽位与尺寸以 `docs/ui/render-spec.md` §8.8.4 为准；本文与其冲突时以 render-spec 为准。

## 1. 总风格关键词
- **粗细不匀的墨线**，带笔锋和顿挫；**飞白、干笔擦痕**。
- **头发、雉翎、红缨、披风被风吹乱**；**边缘泼墨、溅墨**，衣摆可散入墨点。
- **纸底纹理看得见**（米白宣纸）。
- **侧身、有动势**；**眉压眼、眼神凌厉**；写实的中国（东亚）面孔。
- **用色克制：红黑金 + 大面积留白**。

| 名称 | 色值 | 用途 |
|---|---|---|
| 墨黑 | `#1E1A17` | 墨线、头发、甲片、泼墨 |
| 米白纸 | `#FBF5E6` | 纸底留白（保留纸纹） |
| 朱砂 | `#B8322A` | 披风、雉翎、红缨 |
| 哑金 | `#C9A24A` | 冠饰、兽首纹、戟头 |

- 标志物（吕布）：双雉翎 + 方天画戟（月牙刃）+ 红黑披风 + 金冠。

## 2. 构图规则
- **半身竖版 256:356，脸要大**（脸宽约占画面 1/3），头部在上 1/3。
- 兵器竖放、贴身，戟刃尽量收进画框；人物与兵器压在中央。
- 底部 80@2x 为渐隐区（卡框底部叠 40px 暗渐变），不放脸和戟刃。
- 小尺寸可读：1x 主将 128×178、副将 70×98，灰度下仍能认出脸、雉翎和戟。

## 3. 固定 prompt
**前缀（`...` 处填角色）：**
```
Same art style as the reference: rough expressive ink brush linework with uneven stroke weight, dry-brush flying-white streaks, ink splashes and splatter at the edges; windswept hair, feathers, tassels and cape; brows pressed low over sharp fierce eyes; visible cream rice-paper texture; restrained palette of red, black, gold and empty paper. Chinese Three Kingdoms general ..., close bust framing, body turned three-quarters with motion, weapon held vertically close to the body. Keep the figure and the weapon within the central 40% of the image width. No text.
```
**负面约束：**
```
no thick painterly shading, no realistic painterly rendering, no stiff upright pose, no overly clean look, no bold silhouette, no mask-like face, no western battle axe, no western knight armor, no frame, no border, no text, no letters, no seal stamps, no watermark, no signature, no logo, no scenery, no 3D render, no extra limbs, no cropped head
```
> 出图中曾出现西式骑士 + 西式战斧，已废弃；prompt 必须写明 "Chinese" 和兵器名（吕布写 "fangtian huaji"）。

**推荐生成方法：** **只用参考原图 `refs/lvbu-C-flat-ink.jpg` 做参考**。工具输出横图，prompt 里必须写「主体和兵器压在中央 40% 宽度内」(within the central 40% of the image width)，否则竖裁时兵器会被裁掉。

## 4. 吕布竖版变体（待选）
| 变体 | 参考 | prompt |
|---|---|---|
| S1 侧身风吹 | `refs/lvbu-S1.png` | Same character, same art style as the reference, nearly identical: rough expressive ink brush linework with uneven stroke weight, dry-brush flying-white streaks, ink splashes and splatter at the edges; wild windswept black hair and red pheasant feathers, red tassels and torn red-black cape whipping in the wind; brows pressed low over sharp fierce eyes, goatee; visible cream rice-paper texture; restrained palette of red, black, gold and empty paper. Close bust framing like the reference, body turned three-quarters with motion, crescent halberd (fangtian huaji) blade rising vertically right beside his head inside the frame. No painterly realistic shading, no stiff upright pose, no border, no text. |
| S2 回首睥视 | `refs/lvbu-S2.png` | Variation of the reference image keeping its exact look: messy energetic ink strokes, uneven line weight, dry brush scratches, ink splatter, flying hair and red feathers, crown ornament with red jewel, red-black cape edges dissolving into ink splashes, paper texture. Lu Bu glancing sideways over his shoulder with a menacing glare, head and shoulders large in frame, halberd held near-vertical behind him with the crescent blade above his shoulder, red tassels flying. Restrained red/black/gold with lots of blank paper. No thick painterly rendering, no border, no text. |
| S3 泼墨半身 | `refs/lvbu-S3.png` | Outpaint the reference into a tall vertical composition, extending blank paper, ink splashes and windswept cape; crescent blade upright left of his face. |

## 5. 三类资源模板（尺寸均为 @2x 交付）
### 5.1 武将 `generals_battle`
- 主将 **256×356**；副将 **140×196**（同一原画裁胸像，脸中心 (76,64)@2x，左上 32×80 留名）。
- 模板：`{前缀，... = "<武将名>, <标志外观/兵器/配色>"} + {选定变体 pose prompt，替换兵器与标志物}`

### 5.2 敌人 `enemies_ch1`（含 Boss）
- 前排 **176×248**（后排由前排缩 0.77，不单独出图）；Boss **216×304**（含 B1 张角·墨魇）。
- 避让：底部 32@2x（Boss 28@2x）放体力/血条；右上 56×36 被意图牌遮挡、左上 36×36 被倒计时遮挡。
- 模板：`Tall vertical portrait of a fictional Three Kingdoms enemy <名称/身份，如 Yellow Turban foot soldier>, <武器/标志>, ...` + 第 1 节其余前缀原文；Boss 追加 `imposing, larger presence, ink-smoke aura in ink black only`。
- 名称/glyph 对照 render-spec §8.8.4 第 1 章敌人清单。

### 5.3 卡牌插画 `cards_art`
- **116×136**；四周 4@2x 出血，主体在中心 100×110，左上 28×56 被费用珠/花色遮挡。
- 模板：`Small square-ish card illustration of <物件或动作，如 a sword slash / a wooden shield / a peach>, single centered object, in the exact style of the reference: fine detailed black ink line art, cream paper background, palette of red, black and gold. No frame. No text, no watermark.`

## 6. 已知问题：工具输出横图
当前出图工具输出 **16:9 横图**（实测 1280×720）。处理：
1. prompt 保留 "figure within the central third of the width, empty space at top"。
2. 竖裁到 256:356（720 高约 518 宽）；可不用整张高度（如去掉边框时），但比例必须保持 256:356。宽度不够时把裁切窗口往兵器一侧偏，保证戟刃和雉翎在框内。
3. 若生成了装饰边框，裁切时去掉，不进卡框。

## 7. 验收清单
- [ ] 尺寸正确（§5），纸底 `#FBF5E6`，无文字/水印/印章/边框。
- [ ] 墨线粗细不匀、有飞白泼墨，脸大且眼神凌厉；不端正、不过分干净，无厚涂、面具感、西式铠甲兵器。
- [ ] 1x（主将 128×178、副将 70×98）**灰度**下能认出人物、雉翎和兵器。
- [ ] 戟刃、雉翎完整在框内；底部渐隐区无关键内容。
- [ ] 放进 `mockups-v3/battle.html` 主将牌框后不与金屏风背景糊在一起。
- [ ] 同批次与参考原图风格一致（线宽、甲片密度、红黑金配色）。
