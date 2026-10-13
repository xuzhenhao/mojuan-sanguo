# 画风规范 C · 扁平墨线（以参考原图为唯一基准）

> 状态：用户否决了 C1–C3（粗剪影/面具脸）、R1–R3（太干净端正）、S1–S3（缺双长雉翎）、L1–L3（泼墨厚涂偏离 Style C）。**回到最早 Style C 质感**：干净墨线 + 平涂色块。竖版变体 **F1/F2/F3** 待用户挑选；**选定前不批量出图**。
> 槽位与尺寸以 `docs/ui/render-spec.md` §8.8.4 为准；本文与其冲突时以 render-spec 为准。

## 0. 硬规则：先列标志性特征清单
- 每个武将出图前，先在 `docs/art/characters/<武将>.md` 列「标志性特征清单」（模板见 `characters/lvbu.md`）。
- 参考三国杀、真三国无双等作品时**只借用识别元素，不描摹、不图生图**；外部图不入仓库，来源记在 `refs/<武将>/SOURCES.md`。
- 清单每一项都必须在 **70×98 灰度图**下仍然可见。
- prompt 必须带 ICONIC FEATURES 段，写法如下（逐项从清单抄）：
```
ICONIC FEATURES, must be clearly visible:
- TWO VERY LONG pheasant tail feathers … curving like antennae, fully inside the frame
- <特征 2>
- <特征 3> …
```

## 1. 总风格（对照参考原图 `refs/lvbu-C-flat-ink.jpg`）
- **Clean ink linework with flat muted color blocks**（干净墨线 + 平涂色块）：线宽稳定、色块边界清晰。
- 色板：ink black / deep red / ochre（哑金）/ cream paper；允许少量一层硬边暗部，**不用渐变、喷枪、厚涂、泼墨、飞白溅墨**。
- 写实而有神的东亚（中国）面孔；眉压眼、眼神锐利。
- 背景：米白纸底，无场景、无地面、无边框。

| 名称 | 色值 | 用途 |
|---|---|---|
| 墨黑 | `#1E1A17` | 描线、甲片、头发 |
| 米白纸 | `#FBF5E6` | 背景纸底 |
| 朱砂 / deep red | `#B8322A` | 披风、衣袍、缨穗 |
| 哑金 / ochre | `#C9A24A` | 冠饰、兽首纹、戟头 |

- 禁止：泼墨、飞白干笔擦痕、厚涂光影、3D 渲染、照片质感、文字/印章/水印/边框。

## 2. 构图规则
- 半身竖版 **256:356**，脸要大（脸宽约占画面 1/3），头部在上 1/3。
- 兵器竖放、贴身；人物与兵器压在中央约 40% 宽度内；**双长雉翎整根在画框内**。
- 底部 80@2x 为渐隐区（卡框底部叠 40px 暗渐变），不放脸和戟刃。
- 小尺寸可读：1x 主将 128×178、副将 70×98，灰度下仍能认出脸、雉翎和戟。

## 3. 固定 prompt
**前缀（`...` 处填角色）：**
```
Tall vertical portrait of a Chinese Three Kingdoms general ..., in the exact style of the reference: clean ink linework with flat muted color blocks (ink black, deep red, ochre), cream paper background, realistic and spirited East Asian face with sharp eyes, minimal hard-edge shading only. Figure centered within the central 40% of the image width, empty space at top. No text, no watermark.
```
**负面约束：**
```
no ink splash, no ink splatter, no flying-white dry brush, no thick painterly shading, no realistic painterly rendering, no bold silhouette, no mask-like face, no western battle axe, no western knight armor, no frame, no border, no text, no letters, no seal stamps, no watermark, no signature, no logo, no scenery, no 3D render, no airbrush, no gradient shading, no extra limbs, no cropped head, no weapon cut off at frame edge
```
> 出图中曾出现西式骑士 + 西式战斧，已废弃；prompt 必须写明 "Chinese" 和兵器名（吕布写 "fangtian huaji"）。

**推荐生成方法：** 只用参考原图 `refs/lvbu-C-flat-ink.jpg` 做参考（可附已选定的竖版立绘）。工具常输出横图，prompt 写主体和兵器压在中央 40% 宽度内。

## 4. 吕布竖版变体（待选）
prompt = §3 前缀 + `characters/lvbu.md` 的 ICONIC FEATURES 段 + pose：
| 变体 | 参考 | pose |
|---|---|---|
| F1 侧身立戟 | `refs/lvbu-F1.png` | three-quarter body, fangtian huaji upright at his side, two long pheasant feathers arching over both sides, gold beast-face chest plate |
| F2 半身握戟 | `refs/lvbu-F2.png` | half body, fangtian huaji upright near the shoulder, striped pheasant feathers, scale armor with red cape |
| F3 握戟半身 | `refs/lvbu-F3.png` | half body gripping the halberd across the torso, ochre pheasant feathers, gold beast-head pauldron |

> 历史否决：C1–C3 粗剪影/面具；R1–R3 太干净端正；S1–S3 缺双长雉翎；L1–L3 泼墨厚涂偏离 Style C（参考图曾存 `refs/lvbu-L*.png`，已换为 F 系列）。

## 5. 三类资源模板（尺寸均为 @2x 交付）
### 5.1 武将 `generals_battle`
- 主将 **256×356**；副将 **140×196**（同一原画裁胸像，脸中心 (76,64)@2x，左上 32×80 留名）。
- 模板：`{前缀，... = "<武将名>, <标志外观/兵器/配色>"} + ICONIC FEATURES + {选定变体 pose}`

### 5.2 敌人 `enemies_ch1`（含 Boss）
- 前排 **176×248**（后排由前排缩 0.77，不单独出图）；Boss **216×304**（含 B1 张角·墨魇）。
- 避让：底部 32@2x（Boss 28@2x）放体力/血条；右上 56×36 被意图牌遮挡、左上 36×36 被倒计时遮挡。
- 模板：`Tall vertical portrait of a Chinese Three Kingdoms enemy <名称/身份>, <武器/标志>, clean ink linework with flat muted color blocks (ink black, deep red, ochre), cream paper background. No text.`；Boss 追加 `imposing, larger presence`。

### 5.3 卡牌插画 `cards_art`
- **116×136**；四周 4@2x 出血，主体在中心 100×110，左上 28×56 被费用珠/花色遮挡。
- 模板：`Small square-ish card illustration of <物件或动作>, single centered object, clean ink linework with flat muted color blocks (ink black, deep red, ochre), cream paper background. No text, no watermark.`

## 6. 已知问题：工具输出横图
当前出图工具常输出 **16:9 横图**（实测 1280×720），即便 prompt 写 3:4。处理：
1. prompt 保留 "figure within the central 40% of the image width, empty space at top"。
2. 竖裁到 256:356（720 高约 518 宽）；宽度不够时把裁切窗口往兵器/雉翎一侧偏。
3. 若生成了装饰边框，裁切时去掉，不进卡框。

## 7. 验收清单
- [ ] 尺寸正确（§5），纸底 `#FBF5E6`，无文字/水印/印章/边框。
- [ ] **干净墨线 + 平涂色块**（ink black / deep red / ochre），无泼墨、飞白、厚涂。
- [ ] `characters/<武将>.md` 特征清单**逐项**在 70×98 灰度图下可见（吕布：双长雉翎整根在框内、金冠、兽首铠、方天画戟、红披风）。
- [ ] 戟刃、雉翎完整在框内；底部渐隐区无关键内容。
- [ ] 放进 `mockups-v3/battle.html` 主将牌框后不与金屏风背景糊在一起。
- [ ] 同批次与参考原图 `lvbu-C-flat-ink.jpg` 风格一致。
