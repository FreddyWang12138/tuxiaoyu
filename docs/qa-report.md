# 图小鱼 · QA 报告（R2）

- 角色：QA（出证据，不改站点代码）
- 生成时间：2026-11-10 11:47（Asia/Shanghai）
- 快照：`assets/js/app.js` SHA-256 `726a6f6c…`、`styles/main.css` `93999515…`、
  `index.html` `65c58f68…`（完整哈希见 §1.3）
- 结论：**FAIL — G2 不建议通过**。静态检查 91/93 条通过、2 条真缺陷未修；
  另有 5 项浏览器验收尚未执行（本环境没有浏览器，已写验法，未假装验过）。

```
$ node tests/run.mjs
...
静态检查：91/93 条通过，失败 2 条
单元测试：PASS
总判定：FAIL
$ echo $?
1
```

---

## 0. 结论摘要

### 0.1 数字

| 维度 | 结果 |
|---|---|
| 静态检查组 | 11 组，91/93 条通过 |
| 失败条数 | 2（都在 [11] P0 静态验收） |
| `node:test` 单元测试 | 8/8 通过 |
| `node tests/run.mjs` 退出码 | **1** |
| 子路径资源检查（`tests/server-check.mjs`） | 10/10 资源 200；深链 404 页面 2 个资源 404 → 失败 |

### 0.2 产物缺陷 vs 检查规则缺陷（按指挥官要求分开计数）

| 类别 | 数量 | 状态 |
|---|---|---|
| **产物缺陷** | **10** | 已修复并回归通过 5；未关闭 5 |
| **检查规则缺陷（误报）** | **3** | 全部已修正，产物无需为此改动 |
| 待产品决策（不计缺陷） | 2 | 下载名后缀、`track()` 占位 |
| 需人工/浏览器验收 | 12 项 | **未执行**，见 §6 |

产物缺陷明细：

| # | 缺陷 | 级别 | 状态 |
|---|---|---|---|
| 1 | `--ink-3` 13px 文本对比度 3.47:1（需 4.5:1） | P0-11 | ✅ 已修：`#6f6f69`，实测 5.06:1 |
| 2 | 结果行不显示像素尺寸 | P0-6 | ✅ 已修：`width×height` 已渲染 |
| 3 | 页面没写「输出图不含原始拍摄信息」 | P0-10 | ✅ 已修：FAQ 已加 |
| 4 | 「取消剩余」无效（全部行提前标 working） | P0-5 | ✅ 已修：分道 + 游标 + `pool.cancelQueued()` |
| 5 | `.sr-only` 文件输入有不可见 Tab 焦点 | P0-11 | ✅ 已修：input 嵌进 label + `.drop:focus-within` 外框 |
| 6 | 处理中追加文件永久停在「等待处理」 | P0-5 | ❌ 未修（本次红项） |
| 7 | 显式「转 JPG/WebP」被静默回退成原格式 | P0-3 | ❌ 未修（本次红项，需产品确认） |
| 8 | 深链 404 时 `./styles/main.css`、`./` 解析到深路径 → 404 | 部署 | ❌ 未修（server-check 红） |
| 9 | sitemap 收录 `noindex` 的 404.html | SEO/P2 | ❌ 未修 |
| 10 | 下载名 `原名-压缩后.ext`，偏离 P0-6 字面「原名+后缀」 | P3/口径 | ❌ 待决策 |

### 0.3 Gate 判定

- **G2（开发）**：不通过。`node tests/run.mjs` 退出码 1，2 条真缺陷；
  即使这两条修完，P0-2/3/5/7/8/9 的浏览器项仍未执行，不能签「QA 通过」。
- **G3（上线）**：不建议发布。缺陷 8 在 GitHub Pages 的真实深链 404 场景会复现；
  缺陷 9 会让搜索引擎收录一个 `noindex` 页面。

---

## 1. 口径与快照

### 1.1 命令

```bash
cd /Users/wangzhitao/orca/workspaces/MyAgentTeam/queenfish
node tests/run.mjs                 # 总入口：11 组静态 + node:test 单元；失败退出 1
node tests/server-check.mjs        # 把仓库挂到 /tuxiaoyu/，验证子路径与深链 404
node --test tests/unit.test.mjs    # 单跑单元测试
node tests/checks/08-a11y.mjs      # 任意一组都能单跑
```

### 1.2 检查口径（写死在脚本里）

- **外链白名单只扫「会部署的产物」**：`index.html`、`404.html`、`robots.txt`、
  `sitemap.xml`、`styles/**`、`assets/**`、`workers/**`。
  `docs/`、`.orchestration/` 是内部文档、不部署，其中的外链（含本报告引用的地址）不计入。
- **允许**：`github.com/FreddyWang12138/tuxiaoyu`（仓库根）、
  `.../issues/...`、`freddywang12138.github.io`。
- **豁免**：XML 命名空间 / JSON-LD `@context`（`schema.org`、`www.sitemaps.org`）——
  标识符，不是导航地址，也不是请求目标（指挥官 2026-11-10 裁决）。
  页脚「源代码」仓库根链接保留，不通过删链接变绿。
- **禁用词 / 旧口径只看页面可见文本** + meta description + alt/aria-label/title；
  已排除 `<script>`、`<style>`、HTML 注释。
- **零依赖**：没有 `package.json`、没有 `npm install`；只 import Node 内置模块。
  单元测试直接 import 站点真实模块，依赖 Node ≥ 22.7 的 ESM 语法探测（本机 v26.13.0）。

### 1.3 快照哈希（报告里的行号以此为准）

```
65c58f68ae89af52643669f8f648143bb27b167daceb98ce20c66aeef86097a6  index.html
10110ff4d4652c7eee8329f53fad1e0f3764c4419a14c060008d8eb8564909d8  404.html
9399951547d818bf4e569bfdca22a8fccc211ab32cd1e397a0d101cb88bde51b  styles/main.css
726a6f6ce95111cb91e67a590880df5619ed2bacb40a7ad663650c55386531e8  assets/js/app.js
1a6ccdeca11a452786259f64360a857879ed73a20ac781b4a503dd442d287b0f  assets/js/compress.js
a6e8b4848aa4a3f27afb424fb96a58d446600bd0eeea417234d58aef1b001dd6  assets/js/detect.js
a5f6c83802034944bb934ea43974c703cdbe93091feb6947ed18b971daaeba71  assets/js/format.js
3145bf66d2982c13a8b057e0a0fd06e0a15c5e35f9e175f6c747a2dd45d4c9af  workers/compress.worker.js
cf5b5b85d8f2f74bb800b23e2014261c45b2b244ebf49b12354b3d9e2f3d214d  robots.txt
4a272bded25a42d5c1f2f79b08c9172d3a0852e0cecd3f9e56c2414ad04eb223  sitemap.xml
```

> 注：开发在 QA 期间仍在修站点（11:45 前后连改了对比度、像素尺寸、EXIF 文案、取消逻辑、
> sr-only 焦点）。本报告是上述哈希的**定格快照**；之后若有改动，请重跑 `node tests/run.mjs`。

---

## 2. 逐项检查结果

每组的完整真实输出见 §10 附录。单跑验证（11 个文件全部可独立执行）：

```
tests/checks/01-structure.mjs          exit=0  结果：9 通过 / 0 失败
tests/checks/02-paths.mjs              exit=0  结果：6 通过 / 0 失败
tests/checks/03-budget.mjs             exit=0  结果：2 通过 / 0 失败
tests/checks/04-external.mjs           exit=0  结果：6 通过 / 0 失败
tests/checks/05-network.mjs            exit=0  结果：9 通过 / 0 失败
tests/checks/06-banned-words.mjs       exit=0  结果：8 通过 / 0 失败
tests/checks/07-copy.mjs               exit=0  结果：12 通过 / 0 失败
tests/checks/08-a11y.mjs               exit=0  结果：12 通过 / 0 失败
tests/checks/09-scope.mjs              exit=0  结果：10 通过 / 0 失败
tests/checks/10-worker.mjs             exit=0  结果：10 通过 / 0 失败
tests/checks/11-p0-static.mjs          exit=1  结果：7 通过 / 2 失败
```

（[11] 退出码 1 对应下面两条未关闭缺陷；其余 10 组退出码 0。）

下表「关键输出」是从真实输出里摘的原文。

### [01] 结构 — PASS（9/9）

```bash
node tests/checks/01-structure.mjs
```

| 检查 | 真实输出 | 结论 |
|---|---|---|
| `<!doctype html>` | 命中 | ✅ |
| `<html lang="zh-CN">` | 命中 | ✅ |
| viewport | `<meta name="viewport" content="width=device-width, initial-scale=1">` | ✅ |
| title | `<title>图小鱼 · 本地压缩图片｜PNG 转 JPG、转 WebP</title>` | ✅ |
| meta description | 67 字 | ✅ |
| H1 | `<h1>把图片压小，不必上传</h1>`，唯一、非 sr-only | ✅ |

### [02] 相对路径 — PASS

10 个本地引用全部相对路径、文件存在：

```
./styles/main.css → styles/main.css
./assets/js/app.js → assets/js/app.js
./format.js / ./detect.js / ./compress.js → 均存在
../../workers/compress.worker.js → workers/compress.worker.js
../assets/js/detect.js → assets/js/detect.js
```

`404.html` 的 `./` 与 `./styles/main.css` 在**文件层面**存在，但深链解析问题见 §3.3（检查 2 只校验
「相对仓库根解析」，不能替代浏览器按 URL 解析，所以单独用 server-check 验）。

### [03] 体积预算 — PASS

```
合计 42933 B = 41.9 KB，预算 81920 B = 80.0 KB
  16454 B  38.3%  assets/js/app.js
   7958 B  18.5%  styles/main.css
   6791 B  15.8%  index.html
   6024 B  14.0%  assets/js/compress.js
   2087 B   4.9%  assets/js/detect.js
   1970 B   4.6%  workers/compress.worker.js
   1649 B   3.8%  assets/js/format.js
首屏余量 38987 B
```

结论：41.9 KB < 80 KB，余量充足；站点没有图片/字体等额外首屏资产。

### [04] 外链白名单 — PASS（规则已按裁决修正）

9 个绝对地址，7 个白名单、2 个命名空间豁免、0 个违规：

```
OK      index.html:9   https://freddywang12138.github.io/tuxiaoyu/
EXEMPT  index.html:13  https://schema.org                         # JSON-LD @context
OK      index.html:16  https://freddywang12138.github.io/tuxiaoyu/
OK      index.html:119 https://github.com/FreddyWang12138/tuxiaoyu/issues/new?template=feedback.yml
OK      index.html:120 https://github.com/FreddyWang12138/tuxiaoyu   # 仓库根，保留
OK      robots.txt:4   https://freddywang12138.github.io/tuxiaoyu/sitemap.xml
EXEMPT  sitemap.xml:2  http://www.sitemaps.org/schemas/sitemap/0.9   # XML xmlns
OK      sitemap.xml:4  https://freddywang12138.github.io/tuxiaoyu/
OK      sitemap.xml:10 https://freddywang12138.github.io/tuxiaoyu/404.html
```

### [05] 上报行为 — PASS

`fetch(`、`XMLHttpRequest`、`navigator.sendBeacon`、`new WebSocket(`、`new EventSource(`、
`new Image(` 全部 0 处；JS 内 0 个 `http(s)` 字符串。
CSP 真实值：

```
default-src 'self'; img-src 'self' blob: data:; connect-src 'none'; style-src 'self';
script-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'
```

### [06] 禁用词 — PASS

`最快 / 第一 / 无损 / 永久免费 / 100% / 绝对 / 秒杀` 各 0 处；扫描 859 字可见文本
（含首页 + 404 + meta description + 可读属性），已排除注释与脚本。

### [07] 文案一致性 — PASS

`50MB / 50 张 / GIF / AVIF` 在页面可见文本中 0 处；`80MB / 60 张 / JPG / PNG / WebP` 均出现。
代码常量一致：

```
MAX_BYTES = 80 * 1024 * 1024;
MAX_FILES = 60;
```

`detect.js:11` 的 `GIF`/`AVIF` 只出现在「不支持格式」的用户提示映射里，不构成支持声明。

### [08] 无障碍静态检查 — PASS（修复后回归）

- 静态 `<img>` 0 个；动态缩略图 `createElement('img')` 1 处，`alt=''` 已设置。
- 静态 `<button>` 3 个、动态 2 个，均有可读文本。
- `input[type=file]` 有 `label[for]`；无 `tabindex="-1"`。
- `#live` 有 `aria-live="polite"`，`announcedDone` 去重后写入。
- focus 样式 `outline: 3px solid #0b6b4f`。

对比度（真实计算值）：

| 用途 | 颜色 | 比值 | 要求 | 判定 |
|---|---|---|---|---|
| 正文 | `#1a1a19` on `#fbfbfa` | 16.82:1 | 4.5 | ✅ |
| 次要文本 | `#5b5b58` on `#fbfbfa` | 6.58:1 | 4.5 | ✅ |
| 弱化文本 13px | `#6f6f69` on `#ffffff` | **5.06:1** | 4.5 | ✅（修复前 3.47） |
| 链接/强调 | `#16624a` on `#fff` | 7.29:1 | 4.5 | ✅ |
| 主按钮 | `#fff` on `#16624a` | 7.29:1 | 4.5 | ✅ |
| 提示条 | `#6b4d12` on `#fdf4e3` | 7.13:1 | 4.5 | ✅ |
| 错误文字 | `#9c2b1f` on `#fff` | 7.56:1 | 4.5 | ✅ |
| 焦点框 | `#0b6b4f` on `#fff` | 6.50:1 | 3 | ✅ |

文件输入焦点：input 已嵌进 `label.drop`，`.drop:focus-within` 有 3px 外框 → 焦点可见，**通过**。
小瑕疵（不阻断）：label 仍有 `tabindex="0"`，Tab 会依次停在 label 和 input 两处，两处都可见。

### [09] 首版范围 — PASS

`localStorage / sessionStorage / zip / alert( / confirm( / prompt(` 全部 0 处；
无 `document.cookie` 写入、无 `eval` / `new Function`、无第三方脚本。

### [10] Worker 接线 — PASS

```
new URL('../../workers/compress.worker.js', import.meta.url)
new Worker(WORKER_URL, { type: 'module' })
解析后：workers/compress.worker.js 存在
worker import：../assets/js/detect.js → 存在
self.onmessage + self.postMessage 均在
index.html: <script type="module" src="./assets/js/app.js">
CSP worker-src 'self' blob:
主线程兜底 compressOnMainThread 存在
```

### [11] P0 静态验收 — **FAIL（2/9）**

| 检查 | 结论 |
|---|---|
| P0-6 每行展示像素尺寸 | ✅ 已修（`item.out.width×height` 渲染） |
| P0-10 页面声明不含拍摄信息 | ✅ 已修（FAQ 已加 EXIF 说明） |
| P0-5「取消剩余」有效 | ✅ 已修（分道派发 + `cancelQueued()`，未开始行保持 pending） |
| P0-4 切档自动重算 | ✅ `onSettingsChange → reprocess(done) → startProcessing` |
| P0-1 Enter/Space 打开文件框 | ✅ `keydown → input.click()` |
| P0-2 转 JPG 前铺白底 | ✅ 代码已实现（像素效果仍需浏览器） |
| P0-6 下载名 = 原名+后缀 | ⚠️ 实际 `photo-压缩后.jpg`，口径待决 |
| 处理中追加文件 | ❌ 卡在「等待处理」 |
| 显式转格式不被回退 | ❌ 输出变大时静默回退原格式 |

两条失败的完整输出见 §3.1、§3.2。

### [12] 单元测试（node:test）— PASS 8/8

```
✔ formatBytes：B / KB / MB 边界与非法输入
✔ savedText：省 2% 以上才算 smaller，变小为负归零
✔ uniqueName：同批次重名递增，且大小写不敏感
✔ extForMime / baseName：后缀映射与非法字符清理
✔ detect：首版常量是 80MB / 60 张 / 120MP / 仅 JPG+PNG+WebP
✔ classify：空文件 / 超大小 / 不支持格式 / 正常
✔ fileKey：同文件稳定，不同文件可区分（P0-1 去重依据）
✔ qualityFor：三档严格单调递增（P0-4 的数值前提）
```

这些测试直接 `import` 站点里的 `assets/js/format.js`、`detect.js`、`compress.js`，
不是复制一份逻辑。

---

## 3. 未关闭缺陷详情（可复现 + 最小修复）

### 3.1 [P0-5] 处理中追加文件，永远停在「等待处理」

**证据（真实输出）**

```
✗ 处理中追加的文件会被继续处理（不会卡在等待）
    addFiles 入队后调用 startProcessing：是
    startProcessing 在处理中直接 return：是
    本批结束后重新扫描 pending：否
```

**代码位置**（快照 `app.js`）

- `addFiles()` 入队后调用 `startProcessing()`（约 L127–135）。
- `startProcessing()` 第一行 `if (state.processing) return;`（约 L172）；
  `queue` 是开始时的快照，`finally` 里只 `render()/announce()`，不再扫描 pending（约 L173–207）。

**复现**

1. 一次选 10 张大图，确认开始处理。
2. 处理过程中再选 1 张。
3. 等前 10 张全部结束。
4. 第 11 张一直显示「等待处理」，不会再动；只有切格式/质量或点「重试」才会重新触发。

**影响**：批量场景里「边压边加」是常见动作；用户会以为图丢了。P0-5 批量队列不过关。

**最小修复**：`finally` 里若 `state.items.some(i => i.status === 'pending')` 则再调一次
`startProcessing()`；或把新文件放进当前 `CompressPool` 的等待队列。注意避免递归/竞态。

### 3.2 [P0-3] 显式「转 JPG / 转 WebP」被静默回退成原格式

**证据（真实输出）**

```
✗ 显式「转 JPG / 转 WebP」不会静默回退成原格式
    applyResult 有「没变小就用原图」分支：是
    该分支会判断用户是否显式选了目标格式：否
```

**代码位置**：`app.js` 的 `applyResult()`：

```js
const grew = result.blob.size >= item.file.size * 0.98;
const blob = grew ? item.file : result.blob;
const type = grew ? item.file.type : result.blob.type || result.type;
const name = grew ? keepOriginalName(item.file.name) : uniqueName(...);
```

**复现**

1. 选一张透明 PNG（或本身压得很好的 JPG）。
2. 输出格式选「转 JPG」（或「转 WebP」）。
3. 若编码结果 ≥ 原图 98%，下载得到的是**原 PNG**，不是 JPG。

**影响**：格式转换的核心承诺可能不兑现；P0-3 明确要求
`file.type === 'image/webp'`。对「PNG 转 JPG」这个搜索意图伤害最大。

**最小修复**：只有当 `state.settings.format === 'keep'` 时才走「没变小用原图」；
显式选了目标格式就始终输出目标类型，体积变大可用文案提示「转换后体积变大」。
**这条也请产品拍板**：是否允许「转换后更大」的结果。

### 3.3 [P1/部署] 深链 404 时样式与「回到首页」链接 404

**证据（`node tests/server-check.mjs` 真实输出）**

```
深层 404 模拟（/tuxiaoyu/a/b/c）：
  页面状态 404，返回 404.html 内容：是
  FAIL 404  ./styles/main.css  →  /tuxiaoyu/a/b/styles/main.css
  FAIL 404  ./  →  /tuxiaoyu/a/b/
结果：FAIL（2 项）
```

**原因**：GitHub Pages 的 404.html 在**被请求的深路径**下渲染，
`./styles/main.css`、`./` 会相对 `/tuxiaoyu/a/b/` 解析（见 `404.html:8`、`404.html:14`）。

**影响**：任何深链接 404 都会变成无样式白页，且「回到压缩图片」按钮点了还是 404。
主站首页不受影响。

**最小修复**：404 页改用白名单内的绝对地址
`https://freddywang12138.github.io/tuxiaoyu/`（样式同理），或加
`<base href="/tuxiaoyu/">`（注意：`/` 开头会与 QA 相对路径规则冲突，推荐前者）。

### 3.4 [P2/SEO] sitemap 收录了 `noindex` 的 404.html

`404.html` 有 `<meta name="robots" content="noindex">`，但 `sitemap.xml:10` 把
`https://freddywang12138.github.io/tuxiaoyu/404.html` 列为可收录 URL。

**修复**：从 sitemap 删掉 404 条目（保留首页即可）。

### 3.5 [P3/口径] 下载名与 P0-6 字面不一致

P0-6 写「下载文件名 = 原名 + 目标后缀」；实现是 `photo-压缩后.jpg`。
P1 才规划「后缀规范化（-compressed / -webp）」。当前实现可区分原图、不覆盖，实际可用；
但验收字面不一致，建议指挥官二选一：改 PRD 措辞，或改实现为 `photo.jpg`（同名会覆盖，需谨慎）。

---

## 4. 已修复并回归通过（开发改动 + QA 复验）

| 缺陷 | 修复 | 复验证据 |
|---|---|---|
| 13px 弱化文本对比度 3.47:1 | `--ink-3: #6f6f69` | 实测 5.06:1，[08] PASS |
| 结果行缺像素尺寸 | `metaParts` 增加 `width×height` | [11] 该条 PASS |
| 页面缺 EXIF 声明 | FAQ 增加「输出的图片不含原始拍摄信息（EXIF）…」 | [11] 该条 PASS |
| 取消剩余无效 | 分道 + 游标派发；`pool.cancelQueued()`；`discard` 在途结果 | [11] 该条 PASS，真实输出：`cancelRest() 处理的状态：status === 'pending'、status === 'working'` |
| 文件输入不可见焦点 | input 嵌进 label，`.drop:focus-within` 3px 外框 | [08] 该条 PASS |

---

## 5. 检查规则修正记录（3 条误报，产物未为此改动）

| # | 原规则命中 | 为什么是误报 | 处理 |
|---|---|---|---|
| 1 | `https://schema.org` | JSON-LD `@context` 命名空间标识符，不发起请求、不可点 | 计入 `EXEMPT` |
| 2 | `http://www.sitemaps.org/schemas/sitemap/0.9` | XML `xmlns` 命名空间，同上 | 计入 `EXEMPT` |
| 3 | `https://github.com/FreddyWang12138/tuxiaoyu` | 仓库根链接，是「可验证的零上传」叙事；白名单应允许仓库根 + `/issues/...` | 列为 `allowed`，并新增断言「仓库根链接必须保留」 |

另外修了 4 处 **QA 工具自身的 bug**（不是产物问题，透明记录）：
CSP meta 内容被单引号截断（改用属性解析）、`uniqueName` 大小写测试夹具写错、
取消逻辑的启发式在开发改成分道派发后过期、sr-only 焦点说明在修复后仍打印「真缺陷」。
这些都已修正并重跑。

规则没有被放宽：命名空间只豁免已知命名空间主机；github.com 只允许精确仓库根或
`/FreddyWang12138/tuxiaoyu/issues/` 前缀，其他路径仍会红。

---

## 6. 需人工 / 需浏览器验证（**未执行，不算通过**）

本环境没有浏览器/真机。以下项目不能由静态脚本判定；详细验法与记录模板见
`tests/manual-checklist.md`。**在打勾之前，G2 不能签「QA 通过」**。

| # | 项 | 对应 P0 | 验法摘要 |
|---|---|---|---|
| A1 | EXIF Orientation=6 方向 | P0-9 | 竖拍手机照 → 输出方向与相册一致；Safari 单独验 `imageOrientation:'from-image'` |
| A2 | 透明 PNG → JPG 白底 | P0-2 | 取色器点透明区应为 `#ffffff`，无黑边 |
| A3 | 输出剥离 EXIF | P0-10 | `exiftool 输出.jpg` 无 GPS/机身型号 |
| A4 | 3MB JPG 均衡档 ≤70%、三档单调 | P0-2/4 | 同图三档各压一次记字节；100% 放大对照 |
| A5 | WebP 更小且 `type==='image/webp'` | P0-3 | 同图出 JPG/WebP 各一份，Chrome 打开 |
| B1 | 零上传 | P0-8 | DevTools Network 全程无第三方域/无图片上传 |
| B2 | 断网仍可压缩 | P0-8 | 页面加载后 Offline，再拖图压缩 |
| C3 | 10×3MB ≤20s，UI 不冻结 | P0-5 | 4 核 8GB 计时 + 滚动/点击 |
| C4 | 全部下载被拦截有提示与替代路径 | P0-7 | 点「阻止」多文件下载，看提示 + 行内下载 |
| C5 | 键盘全流程 + 可见焦点 | P0-11 | 全程 Tab/Enter；含 label+input 两个停留点确认 |
| C6 | 移动端布局 | — | 375/360 宽无横向滚动，按钮 ≥44px |
| D1 | 真实 GitHub Pages 深链 404 | 部署 | 访问 `/tuxiaoyu/a/b/c` 看样式与返回链接 |

---

## 7. 子路径 200 检查（python3 + curl，真实输出）

用 `python3 -m http.server` 起服务，把仓库软链到 `/tuxiaoyu/`，逐个请求被引用资源：

```
$ python3 -m http.server 58307 --bind 127.0.0.1   # cwd=/tmp/qa-tuxiaoyu，tuxiaoyu/ 软链到仓库
/tuxiaoyu/                                                 200  6791B  text/html
/tuxiaoyu/styles/main.css                                  200  7958B  text/css
/tuxiaoyu/assets/js/app.js                                 200  16454B  text/javascript
/tuxiaoyu/assets/js/compress.js                            200  6024B  text/javascript
/tuxiaoyu/assets/js/detect.js                              200  2087B  text/javascript
/tuxiaoyu/assets/js/format.js                              200  1649B  text/javascript
/tuxiaoyu/workers/compress.worker.js                       200  1970B  text/javascript
/tuxiaoyu/404.html                                         200  635B  text/html
/tuxiaoyu/robots.txt                                       200  88B  text/plain
/tuxiaoyu/sitemap.xml                                      200  468B  application/xml

$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:58307/tuxiaoyu/a/b/c
404
```

**结论**：10 个资源全部 200，体积/类型正确。深路径返回 404 是预期的
（python 内置服务器不会渲染自定义 404.html；自定义 404 的深链解析用
`node tests/server-check.mjs` 模拟，见 §3.3）。

---

## 8. 阻断性缺陷清单（按严重度）

| 排序 | 严重度 | 缺陷 | 为什么会挡上线 | 证据 | 修复 |
|---|---|---|---|---|---|
| 1 | **P0 阻断** | 处理中追加文件永久卡住 | 批量场景核心路径；用户以为图丢了；P0-5 不过 | `node tests/run.mjs` [11] 红；app.js `startProcessing` 早退 + finally 不重扫 | finally 重扫 pending 或并入当前 pool |
| 2 | **P0 阻断** | 显式转格式被静默回退 | 「PNG 转 JPG / 转 WebP」是核心搜索意图；P0-3 无法保证 | `applyResult` 的 `grew` 分支 | 仅 `format==='keep'` 时保留原图；需产品拍板 |
| 3 | P1 发布阻断 | 深链 404 无样式、返回链接 404 | GitHub Pages 真实深链会复现；G3 观感/可用性 | `server-check` 2 个 FAIL | 404 页用白名单绝对地址 |
| 4 | P2 | sitemap 收录 `noindex` 404 | 搜索质量；不挡功能 | `sitemap.xml:10` + `404.html` noindex | 删 404 条目 |
| 5 | P3 | 下载名 `-压缩后` 偏离字面 | 不挡功能，验收口径不一致 | [11] WARN | 改 PRD 或改实现 |
| 6 | 待决策 | 未预留 `track()` 空实现 | 不挡功能（也没有任何上报） | [09] 说明 | BRIEF 允许但不强制；建议确认 |

**另外**：§6 的 12 个浏览器项未执行。它们不是「已发现的缺陷」，但在执行前
不能宣称 P0-2/3/5/7/8/9/11 验收通过。

---

## 9. 待指挥官决策

1. **转换变大时的行为**：显式「转 JPG/WebP」是否允许输出比原图大？
   建议：允许，并提示「转换后体积变大」；只在「保持原格式」时做「没变小用原图」。
2. **下载名**：改 PRD 接受 `-压缩后`，还是改成严格「原名+后缀」？
3. **404 修法**：用 `https://freddywang12138.github.io/tuxiaoyu/` 绝对地址
   （符合白名单），还是引入 `<base>`（会与相对路径规则冲突）？
4. **`track()` 占位**：是否要求开发补一个空函数（当前没有任何上报，也不影响隐私承诺）。
5. **sitemap**：是否同意删除 404 条目（我判断应该删）。

---

## 10. 附录：完整真实输出

### 10.1 `node tests/run.mjs`（含退出码）

```
图小鱼 · QA 检查（零依赖 / 静态 + 单元）
repo : /Users/wangzhitao/orca/workspaces/MyAgentTeam/queenfish/
node : v26.13.0
时间 : 2026-11-10T03:48:21.802Z

[01] 结构：lang / viewport / title / description / H1 — PASS
  ✓ index.html 存在
  ✓ 声明 <!doctype html>
  ✓ <html lang="zh-CN">
  ✓ viewport meta 存在且含 width=device-width
      <meta name="viewport" content="width=device-width, initial-scale=1">
  ✓ title 存在且非空
      <title>图小鱼 · 本地压缩图片｜PNG 转 JPG、转 WebP</title>
  ✓ meta description 存在且非空
      67 字
  ✓ charset 声明
  ✓ 首屏 H1 存在、非空、非隐藏
      <h1>把图片压小，不必上传</h1>
  ✓ H1 唯一
      共 1 个 <h1>

[02] 相对路径：html src/href、css url()、js import — PASS
  ✓ index.html：2 个本地引用
      ./styles/main.css → styles/main.css
      ./assets/js/app.js → assets/js/app.js
  ✓ 404.html：2 个本地引用
      ./styles/main.css → styles/main.css
      ./ → index.html
  ✓ assets/js/app.js：3 个本地引用
      ./format.js → assets/js/format.js
      ./detect.js → assets/js/detect.js
      ./compress.js → assets/js/compress.js
  ✓ assets/js/compress.js：2 个本地引用
      ./detect.js → assets/js/detect.js
      ../../workers/compress.worker.js → workers/compress.worker.js
  ✓ workers/compress.worker.js：1 个本地引用
      ../assets/js/detect.js → assets/js/detect.js
  ✓ 无任何以 / 开头的本地引用
      共检查 10 个引用

[03] 体积预算：html + css + js 未压缩合计 < 80KB — PASS
  ✓ 合计 41.9 KB < 80 KB
       16454 B   38.3%  assets/js/app.js
        7958 B   18.5%  styles/main.css
        6791 B   15.8%  index.html
        6024 B   14.0%  assets/js/compress.js
        2087 B    4.9%  assets/js/detect.js
        1970 B    4.6%  workers/compress.worker.js
        1649 B    3.8%  assets/js/format.js
      合计 42933 B = 41.9 KB，预算 81920 B = 80.0 KB
      首屏余量 38987 B；只计 index.html + CSS + JS（不含图片/字体，站点当前没有）
  ✓ 单文件都不超过预算
      最大文件 assets/js/app.js = 16454 B

[04] 外链白名单：仓库根/issue + Pages 域名（命名空间豁免） — PASS
  ✓ 扫描 10 个部署文件，共 9 个绝对地址
      OK      index.html:9 [allowed] https://freddywang12138.github.io/tuxiaoyu/ — Pages 域名
      EXEMPT  index.html:13 [exempt] https://schema.org — XML/JSON-LD 命名空间，非导航/请求目标
      OK      index.html:16 [allowed] https://freddywang12138.github.io/tuxiaoyu/ — Pages 域名
      OK      index.html:119 [allowed] https://github.com/FreddyWang12138/tuxiaoyu/issues/new?template=feedback.yml — issue 路径
      OK      index.html:120 [allowed] https://github.com/FreddyWang12138/tuxiaoyu — 仓库根
      OK      robots.txt:4 [allowed] https://freddywang12138.github.io/tuxiaoyu/sitemap.xml — Pages 域名
      EXEMPT  sitemap.xml:2 [exempt] http://www.sitemaps.org/schemas/sitemap/0.9 — XML/JSON-LD 命名空间，非导航/请求目标
      OK      sitemap.xml:4 [allowed] https://freddywang12138.github.io/tuxiaoyu/ — Pages 域名
      OK      sitemap.xml:10 [allowed] https://freddywang12138.github.io/tuxiaoyu/404.html — Pages 域名
  ✓ 所有可导航/可请求的绝对地址都在白名单内
      无违规可导航地址
  ✓ 命名空间地址按豁免处理（不当作违规）
      EXEMPT index.html:13 https://schema.org — XML/JSON-LD 命名空间，非导航/请求目标
      EXEMPT sitemap.xml:2 http://www.sitemaps.org/schemas/sitemap/0.9 — XML/JSON-LD 命名空间，非导航/请求目标
  ✓ 页脚「源代码」仓库根链接保留
      index.html:120 https://github.com/FreddyWang12138/tuxiaoyu
  ✓ Pages 域名下地址均为 https
      共 7 个白名单地址
  ✓ 内部文档（docs/）不计入外链白名单
      11 个 md 文件共 62 个外链；按「可部署产物」口径排除，见报告口径说明

[05] 上报行为：fetch/XHR/beacon/WS/SSE/Image 全清 — PASS
  ✓ 未使用 fetch(
      全仓 0 处
  ✓ 未使用 XMLHttpRequest
      全仓 0 处
  ✓ 未使用 navigator.sendBeacon
      全仓 0 处
  ✓ 未使用 new WebSocket(
      全仓 0 处
  ✓ 未使用 new EventSource(
      全仓 0 处
  ✓ 未使用 new Image(
      全仓 0 处
  ✓ JS 内没有 http(s) 字符串（无远程请求目标）
      0 处
  ✓ CSP 存在且 connect-src 为 none
      default-src 'self'; img-src 'self' blob: data:; connect-src 'none'; style-src 'self'; script-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'
  ✓ 无第三方脚本引用
      仅 ./assets/js/app.js

[06] 禁用词：最快/第一/无损/永久免费/100%/绝对/秒杀 — PASS
  ✓ 无「最快」
      0 处
  ✓ 无「第一」
      0 处
  ✓ 无「无损」
      0 处
  ✓ 无「永久免费」
      0 处
  ✓ 无「100%」
      0 处
  ✓ 无「绝对」
      0 处
  ✓ 无「秒杀」
      0 处
  ✓ 检查范围说明
      已扫描 index.html、404.html 的可见文本 / meta description / alt、aria-label、title
      已排除 <script>、<style>、HTML 注释（避免把代码里的字符串当文案）
      合并文本 859 字

[07] 文案一致性：80MB / 60 张 / JPG+PNG+WebP — PASS
  ✓ 页面不含旧口径「50MB」
      0 处
  ✓ 页面不含旧口径「50 张」
      0 处
  ✓ 页面不含旧口径「GIF」
      0 处
  ✓ 页面不含旧口径「AVIF」
      0 处
  ✓ 首屏文案出现「80MB」
      已出现
  ✓ 首屏文案出现「60 张」
      已出现
  ✓ 首屏文案出现「JPG」
      已出现
  ✓ 首屏文案出现「PNG」
      已出现
  ✓ 首屏文案出现「WebP」
      已出现
  ✓ detect.js 常量 MAX_BYTES = 80 * 1024 * 1024
      MAX_BYTES = 80 * 1024 * 1024;
  ✓ detect.js 常量 MAX_FILES = 60
      MAX_FILES = 60;
  ✓ GIF/AVIF 仅作为不支持格式标签出现在代码中
      说明：assets/js/detect.js:11 AVIF（用户拖入该格式时的提示标签，不构成支持声明）
      说明：assets/js/detect.js:11 GIF（用户拖入该格式时的提示标签，不构成支持声明）

[08] 无障碍：img/button/label/tabindex/aria-live/对比度 — PASS
  ✓ 静态 <img> 都有 alt（0 个）
      页面无 <img>；缩略图由 JS 生成，见下一条
  ✓ 动态生成的 <img> 设置 alt（1 处）
      createElement('img') @9935 → alt 已设置
  ✓ 静态 <button> 都有可读文本/aria-label（3 个）
      「全部下载」
      「取消剩余」
      「再压一批」
  ✓ 动态生成的 <button> 都有可读文本（2 处）
      createElement('button') @10605 → 有文本
      createElement('button') @10880 → 有文本
  ✓ input[type=file] 有关联 <label for>（1 个）
      #file-input → 有 label
  ✓ 无 tabindex="-1"
      0 处
  ✓ 进度区域有 aria-live="polite"
      aria-live="polite" 1 处；#live 已标注
  ✓ aria-live 内容由 JS 节流更新
      app.js 用 announcedDone 去重后写 #live
  ✓ 存在可见 focus 样式
      :focus-visible { outline: 3px solid #0b6b4f }
  ✓ 关键文本/焦点对比度达标
      PASS 16.82:1（需 4.5:1） 正文 --ink #1a1a19 on --bg #fbfbfa
      PASS 6.58:1（需 4.5:1） 次要文本 --ink-2 #5b5b58 on --bg #fbfbfa
      PASS 5.06:1（需 4.5:1） 弱化文本（top-tag / drop-privacy / row-meta / opt-hint，13px） --ink-3 #6f6f69 on --panel #ffffff
      PASS 7.29:1（需 4.5:1） 链接/强调 --accent #16624a on --panel #ffffff
      PASS 7.29:1（需 4.5:1） 主按钮文字 --accent-ink #ffffff on --accent #16624a
      PASS 7.13:1（需 4.5:1） 提示条文字 --warn-ink #6b4d12 on --warn-bg #fdf4e3
      PASS 7.56:1（需 4.5:1） 错误文字 --danger #9c2b1f on --panel #ffffff
      PASS 6.50:1（需 3:1） focus 外框 #0b6b4f on #fff
  ✓ 文件输入在 Tab 序列中焦点可见
      input#file-input class="sr-only" tabindex=(未设置)；嵌套在 label 内：是；.drop:focus-within 有 outline：是
      通过：输入框被 .sr-only 裁成 0×0，但焦点落在它身上时 .drop:focus-within 会给整个拖拽区画 3px 外框，焦点可见。
      小瑕疵（不阻断）：label 仍有 tabindex="0"，Tab 会依次停在 label 和 input 两处；两处焦点都可见，可用。
  ✓ 404 页面同样有 lang/title/H1
      404.html 结构与首页一致

[09] 首版范围：无存储写入 / 无 zip / 无 alert-confirm-prompt — PASS
  ✓ 未使用 localStorage
      0 处
  ✓ 未使用 sessionStorage
      0 处
  ✓ 未使用 zip 相关依赖/引用
      0 处
  ✓ 未使用 alert(
      0 处
  ✓ 未使用 confirm(
      0 处
  ✓ 未使用 prompt(
      0 处
  ✓ 没有加载任何 zip/vendor 脚本
      只有 ./assets/js/app.js
  ✓ 没有 document.cookie 写入
      0 处
  ✓ 没有 eval / new Function
      0 处
  ✓ 埋点：无任何上报（track 占位可选）
      未发现 track() 占位；BRIEF 硬约束 5 是「只允许预留空实现」，未预留也不构成上报，记为待决策

[10] Worker 接线：new Worker(相对路径, { type: "module" }) — PASS
  ✓ workers/compress.worker.js 存在
  ✓ WORKER_URL 由 new URL(相对路径, import.meta.url) 解析
      new URL('../../workers/compress.worker.js', import.meta.url)
  ✓ new Worker(WORKER_URL, { type: "module" })
      new Worker(WORKER_URL, { type: 'module' })
  ✓ worker 路径从 compress.js 解析后存在：workers/compress.worker.js
      workers/compress.worker.js
  ✓ worker 路径不是以 / 开头的绝对路径
      ../../workers/compress.worker.js
  ✓ worker 内 import 都是相对路径且文件存在
      ../assets/js/detect.js → 存在
  ✓ worker 监听 onmessage 并回传结果
      self.onmessage + self.postMessage 均在
  ✓ index.html 以 type="module" 加载 app.js
      <script type="module" src="./assets/js/app.js">
  ✓ CSP worker-src 允许 self
      default-src 'self'; img-src 'self' blob: data:; connect-src 'none'; style-src 'self'; script-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'
  ✓ Worker 不可用时有主线程兜底
      compressOnMainThread fallback 存在

[11] P0 静态验收：像素尺寸 / EXIF 声明 / 取消剩余 / 切档重算 — FAIL (2 项)
  ✓ P0-6 每行结果展示像素尺寸
      item.out 已保存尺寸：是（width/height 已从 worker 结果写入）
      metaParts() 渲染内容： const parts = []; const orig = document.createElement('span'); orig.textContent = formatBytes(item.file.size); if (item.status === 'done' && item.out) { const arrow = document.createTextNode(' → '); const out = document…
  ✓ P0-10 页面声明「输出图不含原始拍摄信息」
      页面可见文本出现 EXIF/拍摄信息/元数据：是
  ✓ P0-5「取消剩余」能真正停掉未开始的任务
      派发方式：分道 + 游标（未轮到的行保持 pending）
      cancelRest() 处理的状态：status === 'pending'、status === 'working'
      processOne 在 await pool.run 之前写 working：是
      取消时未开始的行仍是 pending，cancelRest 能把它们标成 cancelled。
  ✓ P0-4 切档后已完成行自动重算（策略明确）
      实现：onSettingsChange → reprocess(done 行) → startProcessing，属于「自动重算」
  ✗ 处理中追加的文件会被继续处理（不会卡在等待）
      addFiles 入队后调用 startProcessing：是
      startProcessing 在处理中直接 return：是
      本批结束后重新扫描 pending：否
      FAIL 处理中 addFiles → startProcessing 直接 return；当前批次 queue 是开始时的快照，finally 里也不再启动 → 新行永远「等待处理」。
      复现：先选 10 张大图，开始压缩后再选 1 张，等前 10 张全部完成，第 11 张仍停在「等待处理」。
      最小修复：startProcessing 的 finally 里若还有 pending 行则再次调用；或把新文件放进当前 pool 的等待队列。
  ✗ 显式「转 JPG / 转 WebP」不会静默回退成原格式
      applyResult 有「没变小就用原图」分支：是
      该分支会判断用户是否显式选了目标格式：否
      FAIL 用户选「转 JPG」但输出比原图大时，applyResult 改用 item.file，type 变回原格式（PNG/WebP 仍是 PNG/WebP），下载名也回原名。
      影响：格式转换的核心承诺可能不兑现（P0-3 要求输出 file.type === image/webp）；对透明 PNG 转 JPG 尤其容易触发。
      最小修复：仅当 state.settings.format === "keep" 时才保留原图；显式转格式时始终输出目标类型（可附提示「转换后体积变大」）。
  ✓ P0-1 拖拽区 Enter/Space 可打开文件框
      keydown → input.click() 已接线
  ✓ P0-6 下载文件名 = 原名 + 目标后缀（当前加了「-压缩后」）
      WARN 实际名：photo-压缩后.jpg。能区分原图，但与 P0-6 字面「原名+后缀」有偏差，属产品口径，建议指挥官确认后改文案或改实现。
  ✓ P0-2 转 JPG 前铺白底（代码已实现）
      worker 在 drawImage 前 fillRect 白底；主线程兜底逻辑相同
      像素级效果（透明区是否纯白、边缘是否发灰）仍需浏览器验证

[12] 单元测试（node:test） — 直接 import assets/js 里的真实实现
  ✔ formatBytes：B / KB / MB 边界与非法输入 (1.087994ms)
  ✔ savedText：省 2% 以上才算 smaller，变小为负归零 (0.737796ms)
  ✔ uniqueName：同批次重名递增，且大小写不敏感 (0.23499ms)
  ✔ extForMime / baseName：后缀映射与非法字符清理 (0.303268ms)
  ✔ detect：首版常量是 80MB / 60 张 / 120MP / 仅 JPG+PNG+WebP (0.193857ms)
  ✔ classify：空文件 / 超大小 / 不支持格式 / 正常 (0.305944ms)
  ✔ fileKey：同文件稳定，不同文件可区分（P0-1 去重依据） (0.229122ms)
  ✔ qualityFor：三档严格单调递增（P0-4 的数值前提） (0.366709ms)
  ℹ tests 8
  ℹ suites 0
  ℹ pass 8
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 154.810751

================ 汇总 ================
静态检查：91/93 条通过，失败 2 条
单元测试：PASS
失败项：
  ✗ [11] 处理中追加的文件会被继续处理（不会卡在等待）
  ✗ [11] 显式「转 JPG / 转 WebP」不会静默回退成原格式
总判定：FAIL
$ echo $?
1
```

### 10.2 `node tests/server-check.mjs`

```
本地服务：http://127.0.0.1:58277/tuxiaoyu/  →  /Users/wangzhitao/orca/workspaces/MyAgentTeam/queenfish/
仓库文件（部署口径）：
  index.html (6791 B)
  404.html (635 B)
  robots.txt (88 B)
  sitemap.xml (468 B)
  styles/main.css (7958 B)
  assets/js/app.js (16454 B)
  assets/js/compress.js (6024 B)
  assets/js/detect.js (2087 B)
  assets/js/format.js (1649 B)
  workers/compress.worker.js (1970 B)

资源请求：
  OK   200 text/html; charset=utf-8  首页 5503 chars
  OK   200 text/css; charset=utf-8  CSS 7888 chars
  OK   200 text/javascript; charset=utf-8  app.js 15430 chars
  OK   200 text/javascript; charset=utf-8  compress.js 5814 chars
  OK   200 text/javascript; charset=utf-8  detect.js 1961 chars
  OK   200 text/javascript; charset=utf-8  format.js 1485 chars
  OK   200 text/javascript; charset=utf-8  worker 1831 chars
  OK   200 text/html; charset=utf-8  404 页 550 chars
  OK   200 text/plain; charset=utf-8  robots 88 chars
  OK   200 application/xml; charset=utf-8  sitemap 468 chars

深层 404 模拟（/tuxiaoyu/a/b/c）：
  页面状态 404，返回 404.html 内容：是
  FAIL 404  ./styles/main.css  →  /tuxiaoyu/a/b/styles/main.css
  FAIL 404  ./  →  /tuxiaoyu/a/b/

服务端 404 次数：3（只统计上面这些请求）
结果：FAIL（2 项）
$ echo $?
1
```

### 10.3 `node --test tests/unit.test.mjs`

```
✔ formatBytes：B / KB / MB 边界与非法输入 (1.161454ms)
✔ savedText：省 2% 以上才算 smaller，变小为负归零 (0.767804ms)
✔ uniqueName：同批次重名递增，且大小写不敏感 (0.233652ms)
✔ extForMime / baseName：后缀映射与非法字符清理 (0.367362ms)
✔ detect：首版常量是 80MB / 60 张 / 120MP / 仅 JPG+PNG+WebP (0.183348ms)
✔ classify：空文件 / 超大小 / 不支持格式 / 正常 (0.356392ms)
✔ fileKey：同文件稳定，不同文件可区分（P0-1 去重依据） (0.231813ms)
✔ qualityFor：三档严格单调递增（P0-4 的数值前提） (0.325688ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 143.334811
```

### 10.4 文件清单（QA 新增）

```
tests/run.mjs                    # 总入口
tests/lib/harness.mjs            # 零依赖工具（fs/path/WCAG 对比度/输出）
tests/checks/01-structure.mjs
tests/checks/02-paths.mjs
tests/checks/03-budget.mjs
tests/checks/04-external.mjs
tests/checks/05-network.mjs
tests/checks/06-banned-words.mjs
tests/checks/07-copy.mjs
tests/checks/08-a11y.mjs
tests/checks/09-scope.mjs
tests/checks/10-worker.mjs
tests/checks/11-p0-static.mjs
tests/unit.test.mjs              # node:test，直接 import 站点纯函数
tests/server-check.mjs           # 子路径 + 深链 404（可选）
tests/manual-checklist.md        # 浏览器/真机验法与记录模板
tests/README.md                  # 用法与口径
docs/qa-report.md                # 本文件
```
