# tests/ · 图小鱼 QA 检查

零依赖，只用 Node 内置模块（`node:fs` / `node:path` / `node:http` / `node:test`）。
不需要 `npm install`，不会发起外网请求。

## 跑全部

```bash
node tests/run.mjs        # 11 组静态检查 + node:test 单元测试；失败退出码 1
```

## 单跑某一组（每组都能独立执行）

```bash
node tests/checks/01-structure.mjs      # 结构
node tests/checks/02-paths.mjs          # 相对路径
node tests/checks/03-budget.mjs         # 体积预算
node tests/checks/04-external.mjs       # 外链白名单
node tests/checks/05-network.mjs        # 上报行为
node tests/checks/06-banned-words.mjs   # 禁用词
node tests/checks/07-copy.mjs           # 文案一致性
node tests/checks/08-a11y.mjs           # 无障碍静态检查
node tests/checks/09-scope.mjs          # 首版范围
node tests/checks/10-worker.mjs         # Worker 接线
node tests/checks/11-p0-static.mjs      # P0 静态验收（尺寸/EXIF 声明/取消/切档）
node --test tests/unit.test.mjs         # 纯函数行为（format/detect/compress）
```

## 人工/浏览器清单

`tests/manual-checklist.md`：EXIF 方向、透明 PNG 白底、离线、键盘、移动端、性能等
无法静态判定的项目，逐条给了验法与期望。

## 子路径部署验证（可选）

```bash
node tests/server-check.mjs   # 把仓库挂到 /tuxiaoyu/，逐个请求页面与被引用资源
```

## 口径

- **外链白名单**只扫「会部署的产物」：`index.html`、`404.html`、`robots.txt`、
  `sitemap.xml`、`styles/**`、`assets/**`、`workers/**`。
  `docs/` 与 `.orchestration/` 是内部文档、不部署，其中调研外链不计入。
- **允许**：`github.com/FreddyWang12138/tuxiaoyu`（仓库根）、
  `github.com/FreddyWang12138/tuxiaoyu/issues/...`、`freddywang12138.github.io`。
- **豁免**：XML 命名空间 / JSON-LD `@context`（`schema.org`、`www.sitemaps.org` 等）——
  它们是标识符，不是可导航地址或请求目标（指挥官 2026-11-10 裁决）。
- **禁用词 / 旧口径**只看页面可见文本 + meta description + alt/aria-label/title，
  已排除 `<script>`、`<style>`、HTML 注释。
- 单元测试直接 `import` 站点里的 `assets/js/*.js`。仓库没有 `package.json`，
  依赖 Node 的 ESM 语法探测（Node ≥ 22.7；本机 v26.13.0）。
- 浏览器/真机项（EXIF 方向、白底、断网、键盘、移动端布局、体积实测）不做假装验证，
  见 `docs/qa-report.md` 的「需人工/需浏览器」一节。
