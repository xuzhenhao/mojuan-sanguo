# 美术素材上传与接入流程（阿里云 OSS）

> 适用范围：武将立绘及后续所有运行时美术素材。素材**不打进包**，统一放 OSS，按配置加载。

## 1. 原则

- 素材只放 OSS，不提交到仓库（`docs/art/refs/` 里的定稿源图除外，它们是母版）。
- 代码里不出现任何素材文件名或域名。路径写在 yaml，基址写在 `config/rules.yaml` 的一个配置项。
- 换图只需要重新上传并改配置，不改代码。

## 2. OSS 目录约定

- 根目录：`mojuan/assets/`
- 武将立绘：`mojuan/assets/portraits/heroes/<id>.webp`（大档 512×712）和 `<id>@s.webp`（小档 256×356）
- 新类别按 `mojuan/assets/<类别>/...` 扩展，例如 `portraits/enemies/`。
- 当前使用**测试 bucket** `test-oss-xiaobien`，访问域名 `https://test-oss.xiaobien.com`，已开公网读和 CORS `*`。正式上线前要换成正式 bucket，只改基址配置。

## 3. 出图规格（立绘）

| 档位 | 尺寸 | 用于 |
| --- | --- | --- |
| 大档 `xxx.webp` | 512×712 | 点将主位 176×240、副位 122×166，结算页 210×280 |
| 小档 `xxx@s.webp` | 256×356 | 点将格子 85×116、战斗主卡 128×178、战斗副卡 70×98、复活弹窗 |

- 母版：`docs/art/refs/` 下由高级UI设计确认的 512 竖裁图。两档都从母版缩，不重新裁。
- 格式 WebP，质量 82。源图 jpg 和 `-gray` 灰度图不上传。
- 槽位比例不一致时用 cover，水平居中，顶部对齐。副卡的脸部对齐用武将 yaml 里的 `portraitFocus`。

当前定稿：刘备 L1、曹操 C1、吕布 a2、郭嘉 G2a、周瑜 Y2d-3、陆逊 X4c、貂蝉 D1、赵云 Z2。

## 4. 上传流程

上传由制作人（Grok Bot）在共享 box 上执行，其他角色把待传文件交给制作人。

1. 高级UI设计确认定稿，母版合进 `docs/art/refs/`。
2. 按第 3 节缩图，产出到本地目录，例如 `/workspace/portraits-out/heroes/`（不提交）。
3. 运行上传器：
   ```bash
   cd /home/box/oss-upload
   .venv/bin/python upload.py /workspace/portraits-out mojuan/assets/portraits
   ```
   上传器流程：测服账号登录，拿临时 STS 凭证，用 oss2 上传，并设置 `Content-Type: image/webp` 和 `Cache-Control: public, max-age=31536000`。凭证过期会自动刷新后重试。
4. 用 `curl -I <url>` 抽查：返回 200，`Content-Type` 是 `image/webp`，带 CORS 头。
5. 把地址和变更的武将告诉高级开发，改 yaml。

注意：测服账号密码和接口常量只存在 box 的 `/home/box/oss-upload/` 下（权限 700），**绝不提交到仓库或贴到群里**。

### 换图规则

因为设置了一年缓存，**同名覆盖会命中旧缓存**。换图时请用新文件名（例如 `liubei.v2.webp`）上传，再改 yaml 指向新名字，旧文件保留。

## 5. 项目中如何引用

- `config/rules.yaml` 里有资源基址配置项（当前值 `https://test-oss.xiaobien.com/mojuan/assets/`）。
- 武将 yaml：`portrait: portraits/heroes/liubei.webp`。小档按 `@s` 约定派生，`portraitFocus` 写脸部对齐参数。敌人的 `portrait` 是可选字段，缺省时显示 glyph。
- 构建校验只检查 yaml 字段格式，不请求网络。
- 运行时：图没到先显示占位图，到了用 150ms 淡入替换；开了减少动态就直接替换。加载失败一直保留占位，不报错、不显示错误图标。
- 具体字段名以 #177 合入后的 schema 为准。

## 6. 微信小游戏（M2）

- 要在小游戏后台把 OSS 域名加进 downloadFile 合法域名，换正式 bucket 时同步更新。
- 远程图片可以用 `wx.downloadFile` 缓存到用户目录，属于 M2 的平台层实现。
