# 画风规范 C · 墨线工笔（以参考原图为唯一基准）

> 状态：用户否决了 C1/C2/C3（粗剪影、面具脸），改为**以参考原图 `refs/lvbu-C-flat-ink.jpg` 为唯一基准**。竖版变体 R1/R2/R3 待用户挑选；**选定前不批量出图**。
> 槽位与尺寸以 `docs/ui/render-spec.md` §8.8.4 为准；本文与其冲突时以 render-spec 为准。

## 1. 总风格（对照参考原图）
- **细腻墨线勾勒**：细而有变化的黑色墨线，甲片、纹饰、羽毛逐片勾出；允许少量线描排线做暗部，不用喷枪渐变。
- **写实而有神的东亚（中国）面孔**：五官写实、眼神锐利有神，不夸张、不卡通、不做面具化处理。
- **华丽铠甲**：鱼鳞/札甲甲片配**金色兽首纹**（胸口、腰带兽首吞口），肩甲金饰卷云纹。
- **纸底红黑金**：米白纸纹底，主色朱砂红披风、墨黑甲片、哑金纹饰。

| 名称 | 色值 | 用途 |
|---|---|---|
| 墨黑 | `#1E1A17` | 描线、甲片、头发 |
| 米白纸 | `#FBF5E6` | 背景纸底（允许淡纸纹） |
| 朱砂 | `#B8322A` | 披风、衣袍、缨穗 |
| 哑金 | `#C9A24A` | 兽首纹、盔饰、戟头雕饰 |

- 背景：纯纸底，无场景、无地面、**无画面边框**。
- 标志物（吕布）：双雉翎（长、羽纹清楚）+ **方天画戟**（月牙刃、金色龙形吞口、细节完整）+ 红披风 + 金冠。

## 2. 构图规则
- 竖版 **256:356**；**兵器竖放、贴身**（握在身侧或靠肩），**人物压在画面中间三分之一宽度里**，戟刃和雉翎都收进画框。
- 上方留白放名字/势力印：左上 40×120@2x 竖排名，右上 48×48@2x 势力印；头部在上 1/3。
- 底部 80@2x 为渐隐区（卡框底部叠 40px 暗渐变），不放脸、手、兵刃尖。
- 小尺寸可读：1x 主将 128×178、副将 70×98 下仍能认出人物、雉翎和戟。

## 3. 固定 prompt
**前缀（`...` 处填角色描述）：**
```
Tall vertical portrait of a Chinese Three Kingdoms general ..., in the exact style of the reference: fine detailed black ink line art, realistic and spirited East Asian (Chinese) face with sharp eyes, ornate Chinese lamellar armor with gold beast-head (tiger/lion mask) motifs, vermilion red cape, cream paper background, palette of red, black and gold. Weapon held upright close to the body, figure within the central third of the width, empty space at top. No text, no watermark.
```
吕布示例 `...` = `Lü Bu, gold crown with two long pheasant tail feathers, holding a fangtian huaji (Chinese crescent-bladed halberd with gold dragon fittings) upright`。

**负面约束：**
```
no bold silhouette, no thick uniform outlines, no mask-like face, no cartoon face, no western battle axe, no western knight armor, no european plate armor, no frame, no border, no decorative frame, no text, no letters, no calligraphy, no seal stamps, no watermark, no signature, no logo, no scenery, no ground, no gradient background, no 3D render, no airbrush shading, no extra limbs, no cropped head, no weapon cut off at frame edge
```
> 生成中出过一张西式骑士 + 西式战斧，已废弃；所以 prompt 必须写明 **"Chinese"** 和 **"fangtian huaji"**。

**推荐生成方法：** 图生图，参考图**同时放**原图 `refs/lvbu-C-flat-ink.jpg` 和已选定的竖版立绘 `refs/lvbu-R*.png`，prompt 写明 "Chinese" 与 "fangtian huaji"（其他武将换成其兵器的中文拼音名 + 英文描述）。

## 4. 吕布竖版变体（待选）
| 变体 | 参考 | pose prompt |
|---|---|---|
| R1 全身立戟 | `refs/lvbu-R1.png` | full body standing, fangtian huaji held upright in right hand, pheasant feathers sweeping from behind to both sides, tattered red cape |
| R2 半身握戟 | `refs/lvbu-R2.png` | half body, fangtian huaji upright with the blade above his left shoulder, two long pheasant feathers rising from the crown, stern gaze |
| R3 四分之三身立戟 | `refs/lvbu-R3.png` | three-quarter body, fangtian huaji upright at his side, two long pheasant feathers, red cape draping wide |

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
- [ ] 墨线细腻、脸写实有神，无粗剪影/面具感，无西式铠甲兵器。
- [ ] 1x（主将 128×178、副将 70×98）**灰度**下能认出人物、雉翎和兵器。
- [ ] 戟刃、雉翎完整在框内；底部渐隐区无关键内容。
- [ ] 放进 `mockups-v3/battle.html` 主将牌框后不与金屏风背景糊在一起。
- [ ] 同批次与参考原图风格一致（线宽、甲片密度、红黑金配色）。
