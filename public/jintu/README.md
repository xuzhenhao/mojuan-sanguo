# 烬途防线 P4 独立壳预览包

《烬途防线》Godot 4.7 Web（大厅 → 武装库/商店/庇护 → 出征选关 → 空投/精英 → Boss → 结算入账）。

- 导出：Godot 4.7.2 Web **无线程**（适合 GitHub Pages，无需 COOP/COEP）
- 基线：`jintu-defense` 本地 `main` @ `86ba096`（P4：独立壳 arsenal/shop/shelter/result + AD7 + Enrage 名 + hub 多关 + P3.1 cache-bust）
- `index.pck` md5：`4955b337a0431f56fb692aa70023772f`
- cache-bust：`v=d56f75739523`
- CJK：包内嵌 `NotoSansCJKsc-Regular.ttc`（`resources/ui_theme.tres` 默认字体）
- 路径：合入 `main` 后由 Pages workflow 将 `public/` 拷入站点，访问 `/mojuan-sanguo/jintu/`
- 源工程：本机 Godot playground（不在本仓）

试玩：打开 [index.html](./index.html)（需等 Deploy Pages 完成；无痕冷启动确认 Network 中 `index.pck?v=d56f75739523`）。
