# 画风规范 C · 扁平墨线（以参考原图为唯一基准）

> 状态：**已定稿**，标杆图 `refs/lvbu-C3-b-canonical.jpg`（俊美型、干笔墨线、斜纹双长雉翎）；512 竖裁见 `refs/lvbu-final-512.png`。
> 槽位与尺寸以 `docs/ui/render-spec.md` §8.8 为准；本文与其冲突时以 render-spec 为准。
> 历史（已否决，图已删）：C1–C3 粗剪影 / R1–R3 太干净 / S1–S3 缺双翎 / L1–L3 泼墨厚涂 / F1–F3 偏卡通 / G 系列过渡稿 → 定稿 C3-b。

## 风格规范
【通用前缀】Card game character portrait of {武将}, Three Kingdoms warrior, modern stylized ink illustration for mobile game: ink linework with flat muted color blocks (ink black, deep red, ochre, gold), dry-brush uneven line weight, loose flying hair strands, splashed red cape/ink accents, simple beige rice-paper background, no text.
【人物】young, strikingly handsome, refined slim face, sharp brows, cold proud gaze; elegant and domineering, not rugged, not bulky, not old, not cartoon/anime/clean vector.
【标志特征】每个武将必写识别特征（吕布：gold crown with two long banded pheasant tail feathers 雉翎 rising like antennae + fangtian ji halberd）。
【构图】half-body，为竖裁留位，武器和翎主体不出框。
【参考图】生图时一律带 lvbu-C3-b-canonical.jpg 做 reference 锁画风。

## 验收清单
- [ ] 尺寸符合 render-spec §8.8（主将 512×712 / 256×356 / 128×178，副将 70×98），无文字/水印/印章/边框。
- [ ] 画风与标杆图 `lvbu-C3-b-canonical.jpg` 一致：干笔不匀墨线 + 平涂哑色块，非卡通/动漫/矢量。
- [ ] `characters/<武将>.md` 的**每项标志特征在 70×98 灰度图里都可见**。
- [ ] 竖裁后脸、武器头和翎主体不出框；底部 40px 渐变区无关键内容。
- [ ] 放进 `mockups-v3/battle.html` 主将牌框后不与背景糊在一起。
- [ ] 不描摹第三方作品（三国杀、无双等只借识别元素，外部图不入仓库，来源记 `refs/<武将>/SOURCES.md`）。
