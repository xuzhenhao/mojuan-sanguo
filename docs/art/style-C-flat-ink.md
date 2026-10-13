# 画风规范 C · 扁平墨线（Flat Ink）

> 状态：画风已由用户选定（C）。变体 C1/C2/C3 待用户挑选；**选定前不批量出图**。
> 槽位与尺寸以 `docs/ui/render-spec.md` §8.8.4 为准；本文与其冲突时以 render-spec 为准。

## 1. 总风格
- 扁平插画（flat illustration），**自信、粗细稳定的黑色墨线**勾边，大块平涂，阴影极少（最多一层硬边暗部，不用渐变/喷枪）。
- 色板（从参考图取色校准，生成后允许 ±6 色差）：

| 名称 | 色值 | 用途 |
|---|---|---|
| 墨黑 | `#1E1A17` | 描线、甲片、头发 |
| 米白纸 | `#FBF5E6` | 背景、皮肤高光（参考图实测背景约 `#FEF3DF`，导出前统一校到 `#FBF5E6`） |
| 朱砂 | `#B8322A` | 披风、衣袍、羽饰 |
| 哑金 | `#C9A24A` | 纹饰、兵刃金属、盔饰 |

- 背景：纯米白，无场景、无地面、无边框。
- 禁止：文字、印章字、签名、水印、logo、照片质感、3D 渲染、复杂渐变。

## 2. 构图规则
- 竖版 **256:356**（武将），主体居中，剪影清晰（灰度下轮廓不与背景粘连）。
- 上方留白放名字/势力印：武将左上 40×120@2x 留竖排名，右上 48×48@2x 留势力印；脸中心约 (128,110)@2x，头部在上 1/3。
- 底部 80@2x 是渐隐区，放勾玉/护甲，不放脸、手、兵刃尖等关键内容。
- 标志物必须出现在画面内且够大：吕布 = 双雉翎 + 方天画戟 + 红披风。
- 小尺寸可读：1x 主将 128×178、副将 70×98 下仍能认出人物和武器。

## 3. 固定 prompt
**前缀（必须原样使用，`...` 处填角色描述）：**
```
Tall vertical portrait of a fictional Three Kingdoms warlord ..., in the exact style of the reference: flat illustration, confident black ink outlines, flat fills of ink black, cream, vermilion red and muted gold, minimal shading. Plain cream background, figure centered, clear silhouette, empty space at top. No text, no watermark.
```
**负面约束：**
```
no text, no letters, no calligraphy, no seal stamps, no watermark, no signature, no logo, no frame or border, no scenery, no ground, no gradient background, no photorealism, no 3D render, no soft airbrush shading, no extra limbs, no cropped head, no weapon cut off at frame edge
```
**必附参考图：** `docs/art/refs/lvbu-C-flat-ink.jpg`（另附选定变体的 `refs/lvbu-C*.png`）。

## 4. 变体 pose prompt（吕布样稿）
| 变体 | 参考 | pose prompt |
|---|---|---|
| C1 立守 | `refs/lvbu-C1.png` | Variant 1 'standing guard': three-quarter body, facing slightly left, halberd held upright beside him, two long pheasant tail feathers curving up from helmet, red cape. |
| C2 冲阵 | `refs/lvbu-C2.png` | Variant 2 'charging': dynamic diagonal pose, halberd swung forward across the body, cape flaring, two pheasant tail feathers, fierce glare, half body filling the frame. |
| C3 粗剪影 | `refs/lvbu-C3.png` | Variant 3 'bold silhouette': thicker outlines, fewer details, large flat shapes; bust to waist, frontal, halberd over shoulder, two pheasant tail feathers. |

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
- 模板：`Small square-ish card illustration of <物件或动作，如 a sword slash / a wooden shield / a peach>, single centered object, in the exact style of the reference: flat illustration, confident black ink outlines, flat fills of ink black, cream, vermilion red and muted gold, minimal shading. Plain cream background. No text, no watermark.`

## 6. 已知问题：工具输出横图
当前出图工具无论 prompt 如何都输出 **16:9 横图**（实测 1280×720）。处理：
1. prompt 里保留 "figure centered, empty space at top"，让人物落在画面中间。
2. 用整张高度、以脸/身体为中心竖裁到目标比例（武将 256:356 → 720 高裁约 518 宽），再缩放到交付尺寸。
3. 裁后若脸贴上边，在上方用 `#FBF5E6` 补边，而不是缩小人物。
4. 横裁会丢掉画面两侧的兵刃：生成时要求兵器竖持或贴身，检查兵器是否被裁断。

## 7. 验收清单
- [ ] 尺寸正确（§5），背景为 `#FBF5E6`，无文字/水印/印章。
- [ ] 色板只用 §1 四色及其明暗，线条为黑色墨线。
- [ ] 1x（主将 128×178、副将 70×98）**灰度**下能认出人物身份和武器。
- [ ] 脸与标志物在安全区内，左上/右上留名与印位，底部渐隐区无关键内容。
- [ ] 放进 `mockups-v3/battle.html` 主将牌框后不与金屏风背景糊在一起。
- [ ] 同一批次和参考图风格一致（线宽、平涂、阴影层数）。
