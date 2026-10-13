# 画风规范 C · 扁平墨线（以参考原图为唯一基准）

> 状态：**已定稿**，标杆图 `refs/lvbu-tight-a2.jpg`（a 基础上换宽月牙双刃方天画戟、金纹、红缨）；画风来源 `refs/lvbu-C3-b-canonical.jpg`；512 竖裁见 `refs/lvbu-final-512.png`（a2 竖裁）。
> 槽位与尺寸以 `docs/ui/render-spec.md` §8.8 为准；本文与其冲突时以 render-spec 为准。
> 历史（已否决，图已删）：C1–C3 粗剪影 / R1–R3 太干净 / S1–S3 缺双翎 / L1–L3 泼墨厚涂 / F1–F3 偏卡通 / G 系列过渡稿 → C3-b（画风来源）→ 紧构图 a → 定稿 a2。

## 风格规范
【标杆与参考】
- 最终标杆是 /workspace/art-style-samples/lvbu-tight-a2.jpg。生成每张图都必须把它作为参考图传入。
- 画风来源是 lvbu-C3-b-canonical.jpg，作为第二参考。

【通用前缀】（每位武将都一样，{武将} 换成名字）
Card game character portrait of {武将}, Three Kingdoms warrior, modern stylized ink illustration for mobile game: ink linework with flat muted color blocks (ink black, deep red, ochre, gold), dry-brush uneven line weight, loose flying hair strands, splashed red cape/ink accents, simple beige rice-paper background, no text.

【气质】（男性猛将默认加这段，谋士、女将按人物调整）
young, strikingly handsome, refined slim face, sharp brows, cold proud gaze; elegant and domineering, not rugged, not bulky, not old, not cartoon/anime/clean vector.
- 关键词是俊美 + 霸气 + 略带凌乱。
- 用户已经否掉过两类：一是粗犷、大胡子、太硬核；二是线条均匀干净、偏卡通。

【标志物】（每位武将都必须写明）
- 吕布：金冠、两根带分节斑纹的长雉翎、方天画戟（宽月牙双刃、金纹、红缨）。
- 其他武将参考三国杀和真三国无双的标志元素，再用本画风重新画。

【构图】
- 半身像，武器贴着身体竖着拿，翎羽向内弯。
- 主体压在画面中间 40% 的宽度内；武器、翎羽、冠饰都不能出框。
- 生图工具实际只出横图（1280×720），不管写 3:4 还是 9:16 都一样，所以必须靠居中紧凑构图，保证能竖裁 518 宽。

【武器比例】
- 武器要接近真实比例，可以有气势，但戟头这类不能夸张放大到失真，以 a2 为上限。
- 戟头、套口、红缨和杆子要连成一体，红缨从套口垂下来。手工拼接的版本用户嫌接口生硬，已经否掉。

【修图方式】
- 只改局部的时候，图生图会连人脸一起改掉。实测过一次，脸变成了女性，所以不能拿它做局部修改。
- 想改局部，要么在提示词里写清楚只改哪里，再从多张里挑；要么整张重出。
- 不要手工拼贴部件。

【交付】
- 竖裁 518 宽、全高，再出 512/256/128/70 四个尺寸。
- 验收：70 尺寸灰度图里眉眼能看清，武器头和翎羽完整。
- 新武将要先给用户看竖裁效果，确认后才能批量出。

## 验收清单
- [ ] 尺寸符合 render-spec §8.8（主将 512×712 / 256×356 / 128×178，副将 70×98），无文字/水印/印章/边框。
- [ ] 画风与标杆图 `lvbu-tight-a2.jpg`（画风来源 C3-b）一致：干笔不匀墨线 + 平涂哑色块，非卡通/动漫/矢量。
- [ ] `characters/<武将>.md` 的**每项标志特征在 70×98 灰度图里都可见**。
- [ ] 竖裁后脸、武器头和翎主体不出框；底部 40px 渐变区无关键内容。
- [ ] 放进 `mockups-v3/battle.html` 主将牌框后不与背景糊在一起。
- [ ] 不描摹第三方作品（三国杀、无双等只借识别元素，外部图不入仓库，来源记 `refs/<武将>/SOURCES.md`）。
