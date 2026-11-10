# 上线手册（launch）

> 站点：纯静态、零构建。线上地址 **https://freddywang12138.github.io/tuxiaoyu/**（GitHub Pages **子路径**）。
> 仓库：`FreddyWang12138/tuxiaoyu`。分支：`main` 唯一长期分支。
> 本文所有命令都可直接复制；需要指挥官手动执行的动作已标注 **【指挥官】**。

---

## 0. 这件事怎么运转

| Workflow | 触发 | 干什么 |
| --- | --- | --- |
| `ci.yml` | 所有 `pull_request` + 所有分支的 `push` | `node tests/run.mjs`，红了就不许合 |
| `deploy.yml` | `push` 到 `main` + 手动 `workflow_dispatch` | 先跑同一套测试 → 打包整站 → 部署 Pages |

要点：**测试是部署的 `needs`**，测试不过，部署 job 根本不会开始（不是跑完再回滚）。
线上永远是"最后一次测试通过的 main"。

---

## 1. 上线前检查单（每次发布前逐条勾）

在仓库根目录执行，全部打勾才允许推 `main`。

- [ ] **主线 CI 绿**：`gh run list --workflow=ci.yml --limit 5` 里最新一条是 `success`（或本地 `node tests/run.mjs` 通过）
- [ ] **本地全 200**：`bash scripts/verify-site.sh` 输出 `结果: PASS ✅`、退出码 0
- [ ] **相对路径无 `/` 开头**：`grep -nE '(href|src)="/[^/]' index.html 404.html` 无输出（子路径部署下 `/xxx` 会打到域名根，必 404）
- [ ] **80KB 预算**：`verify-site.sh` 打印的首屏传输 < 81920B（当前 40,654B，未 gzip）
- [ ] **无第三方请求**：`grep -nE 'https?://[^"]+' index.html | grep -vE 'schema.org|freddywang12138.github.io|github.com'` 无输出；DevTools → Network，只用本站静态请求
- [ ] **robots + sitemap 存在**：`ls robots.txt sitemap.xml`；`curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/robots.txt`
- [ ] **404.html 存在**：`ls 404.html`；线上 `curl -s -o /dev/null -w '%{http_code}\n' https://freddywang12138.github.io/tuxiaoyu/no-such-page` 应为 404 且返回本站 404 页面
- [ ] **手机上能用**：真机（或 DevTools 设备模拟 375px）打开首页，拖图/选图、压缩、下载走通；不出现横向滚动
- [ ] **`.nojekyll` 存在**：`ls -a .nojekyll`（避免 Jekyll 处理，保证资源目录原样发布）

> 已知阻塞项：**无**。2026-11-10 曾发现 `assets/js/compress.js` 的 Worker 路径 `../workers/compress.worker.js` 从 `assets/js/` 解析成 `assets/workers/...` → 404（`verify-site.sh` 当场红了）。
> 开发已改为 `../../workers/compress.worker.js`，复验通过：
>
> ```
>   ok  200     1970B  /workers/compress.worker.js
>   结果: PASS ✅
> ```
>
> 今后任何一次"新增/移动资源后 worker 或 import 404"，`verify-site.sh` 会以同样的 FAIL 行 + 非零退出拦住。

---

## 2. 首次上线（按顺序执行）

> 以下 `gh` 命令假设已 `gh auth status` 登录且有该账号权限。**全部由指挥官执行**，worker 不 push、不建仓、不开 Pages。

### 2.1 建仓库

```bash
# 在仓库根目录；--source=. 会把当前目录设为 origin，但先不推
gh repo create FreddyWang12138/tuxiaoyu \
  --public \
  --source=. \
  --remote=origin \
  --description "图小鱼 · 浏览器本地图片压缩与格式转换（不上传）"
```

### 2.2 推代码

```bash
git branch -M main
git remote -v                     # 确认 origin 指向 FreddyWang12138/tuxiaoyu
git push -u origin main
```

推送后 `deploy.yml` 会自动跑一次 —— 但**此时 Pages 还没开，部署会失败**，属预期。先做完 2.3 再重跑。

### 2.3 开 Pages（关键：`build_type=workflow`）

```bash
# 首次启用（必须 build_type=workflow，否则 Actions 部署不生效）
gh api -X POST repos/FreddyWang12138/tuxiaoyu/pages -f build_type=workflow

# 若返回 409 "Pages already enabled"，改用 PUT 覆盖配置
gh api -X PUT repos/FreddyWang12138/tuxiaoyu/pages -f build_type=workflow

# 确认状态：应看到 "build_type": "workflow"，以及 html_url
gh api repos/FreddyWang12138/tuxiaoyu/pages --jq '{build_type, html_url, status}'
```

### 2.4 触发部署

```bash
# 手动触发（build_type=workflow 之后，main 上的 push 也会自动触发）
gh workflow run deploy.yml --repo FreddyWang12138/tuxiaoyu --ref main

# 等它跑完，看结果
gh run watch "$(gh run list --repo FreddyWang12138/tuxiaoyu --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run list --repo FreddyWang12138/tuxiaoyu --workflow=deploy.yml --limit 3
```

`deploy` job 的日志末尾会打印 `Reported success!` 与 `page_url`。

### 2.5 验证线上

```bash
BASE=https://freddywang12138.github.io/tuxiaoyu

curl -sI "$BASE/" | head -1                          # HTTP/2 200
curl -s  "$BASE/" | grep -q "<title>图小鱼" && echo "首页文案 OK"
curl -s -o /dev/null -w '%{http_code} %{size_download}B  %{url_effective}\n' \
  "$BASE/styles/main.css" "$BASE/assets/js/app.js" "$BASE/assets/js/compress.js" \
  "$BASE/workers/compress.worker.js" "$BASE/robots.txt" "$BASE/sitemap.xml" "$BASE/404.html"
```

期望：全部 200；`/workers/compress.worker.js` 必须 200（否则线上压缩功能是坏的）。

浏览器终验：打开 `$BASE`，DevTools → Network 勾选 "Disable cache"，拖一张 JPG 进来，确认产出可下载、且没有非本站请求。

---

## 3. 回滚

### 3.1 首选：`git revert` 走一次完整重新部署（推荐）

适合"最新提交把线上搞坏了，但上一版是好的"。历史干净，且回滚本身也经过测试与部署流水线。

```bash
git switch main && git pull --ff-only
git log --oneline -5                      # 找到坏提交 <bad-sha>
git revert --no-edit <bad-sha>
git push origin main                      # 触发 deploy.yml：测试 → 部署

# 盯住这次部署
gh run watch "$(gh run list --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
curl -sI https://freddywang12138.github.io/tuxiaoyu/ | head -1
```

回滚本身也是一次发布，第 1 节的检查单同样适用（至少跑 `bash scripts/verify-site.sh`）。

### 3.2 应急：用 `workflow_dispatch` 直接重跑旧 commit

适合 `main` 上还有别的改动、不方便 revert，或想 30 秒内把线上内容换回旧版。

```bash
GOOD=<上一个已知良好的 commit sha>
gh workflow run deploy.yml --repo FreddyWang12138/tuxiaoyu --ref "$GOOD"

# 确认这次部署的 head sha 是 GOOD
gh run list --workflow=deploy.yml --limit 1 --json headSha,displayTitle --jq '.[0]'
```

⚠️ 两个前提：

1. 那个 commit 上**必须已经存在 `.github/workflows/deploy.yml`**（workflow 不存在时 dispatch 直接 404/失败）。
2. 这只是把**线上内容**换回旧版；`main` 指向的仍是坏代码。**必须紧接着做 3.1 的 revert**，否则下一次任何人推 `main` 都会把坏版本再部署上去。

### 3.3 最后手段：先下线止血

```bash
gh api -X DELETE repos/FreddyWang12138/tuxiaoyu/pages   # 取消发布，线上变 404
# 修好后重新启用（回到 2.3 的 POST，然后 2.4 触发部署）
gh api -X POST repos/FreddyWang12138/tuxiaoyu/pages -f build_type=workflow
```

---

## 4. 失败排查

### 4.1 整站 404（首页都打不开）

| 可能原因 | 怎么确认 | 怎么修 |
| --- | --- | --- |
| Pages 没开 | `gh api repos/FreddyWang12138/tuxiaoyu/pages` 返回 404 | 走 2.3 `POST ... -f build_type=workflow` |
| `build_type` 不是 `workflow` | 上面命令输出里有 `"build_type": "legacy"`/`"branch"` | `PUT ... -f build_type=workflow`，再重跑 deploy |
| 部署 job 没成功 | `gh run list --workflow=deploy.yml` 无 success | `gh run view <id> --log-failed` |
| 刚部署完还在生效 | deploy 日志有 `Reported success!`，但 curl 仍 404 | 等 1–2 分钟；`gh api repos/.../pages --jq .status` 应为 `built` |

### 4.2 首页 200，但资源 404（白屏/无样式）

几乎都是**绝对路径**：`/styles/main.css` 在 Pages 子路径下会被解析到 `https://freddywang12138.github.io/styles/main.css`。

```bash
grep -nE '(href|src)="/[^/]' index.html 404.html assets/js/*.js   # 应无输出
curl -s -o /dev/null -w '%{http_code}\n' https://freddywang12138.github.io/tuxiaoyu/styles/main.css
```

修法：改成 `./styles/main.css` 这类相对路径（这也是 `scripts/verify-site.sh` 里的 ABS 断言在做的事）。
注意 ES module 里用 `import.meta.url` 的相对路径要以**该文件所在目录**为基准解析，`assets/js/x.js` 引用根目录的 worker 必须写 `../../workers/...`。

### 4.3 CI 红

```bash
gh run view <run-id> --log-failed          # 只看失败步骤
node tests/run.mjs                          # 本地复现（Node 22；零依赖，不需要 npm i）
```

- `tests/run.mjs` 不存在 → workflow 会以 `::error::` 主动失败，这是设计行为，不要加 `continue-on-error` 或 `if:` 绕过。
- 本地过、CI 不过 → 看 Node 版本（workflow 固定 22）与大小写敏感（Linux 区分大小写，macOS 不区分）。改文件名大小写必须两处一起改。

### 4.4 部署成功但线上还是旧内容

1. 浏览器缓存：DevTools 勾 "Disable cache" 硬刷新；`curl -sI` 看 `etag`/`last-modified`。
2. 确认部署的是哪个 commit：`gh run list --workflow=deploy.yml --limit 1 --json headSha --jq '.[0].headSha'`，与 `git rev-parse main` 对比。
3. 确认 artifact 内容：deploy 日志里 `upload-pages-artifact` 会列出文件数；数量明显偏少说明 `path` 配错。

### 4.5 `configure-pages` 报 "Get Pages site failed"

Pages 还没启用或 token 权限不足。先 2.3 启用；再确认 workflow 顶部 `permissions` 未被改动（`pages: write`、`id-token: write` 缺一不可）。

---

## 5. 部署参数速查

| 项 | 值 |
| --- | --- |
| Owner / Repo | `FreddyWang12138` / `tuxiaoyu` |
| 线上地址 | https://freddywang12138.github.io/tuxiaoyu/ |
| Pages build_type | `workflow`（Actions 部署，不是 branch 部署） |
| Node | 22（CI 与部署前测试一致） |
| 测试入口 | `node tests/run.mjs`（零依赖） |
| 站点根 | 仓库根 `path: "."`（`index.html` 在根） |
| 部署并发 | `group: pages`，`cancel-in-progress: false` |
| 权限 | `contents: read` / `pages: write` / `id-token: write` |

> 监控（探活、incident、每周 digest）由 `monitor.yml` 负责，见 `docs/runbook.md`。本文件只管"怎么发上去、怎么退回来"。
