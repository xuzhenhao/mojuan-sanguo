# 烬途防线 P3 二次热修预览包

《烬途防线》Godot 4.7 Web（大厅 → 武装库/商店/庇护 → 出征选关 → 空投/精英 → Boss → 结算入账）。

- 导出：Godot 4.7.2 Web **无线程**（适合 GitHub Pages，无需 COOP/COEP）
- 基线：`jintu-defense` 本地 `main` @ `dec64ad`（P3 Pages 阻塞二次热修：deferred 全卸景 / hub 底栏四入口含庇护 / shop name+boost / 结算去壳）
- `index.pck` md5：`1f7f7e638d8c6e200e56288c76613fe7`
- CJK：包内嵌 `NotoSansCJKsc-Regular.ttc`（`resources/ui_theme.tres` 默认字体）
- 路径：合入 `main` 后由 Pages workflow 将 `public/` 拷入站点，访问 `/mojuan-sanguo/jintu/`
- 源工程：本机 Godot playground（不在本仓）

试玩：打开 [index.html](./index.html)（需等 Deploy Pages 完成）。
