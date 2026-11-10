# 线上运维 Runbook（图小鱼）

> 适用对象：拿到 incident 单的人（哪怕不是写代码的人）。目标：**在用户投诉之前发现，在用户流失之前恢复**。
> 相关文件：`.github/workflows/monitor.yml`（探活 / 告警 / 关单）、`.github/workflows/weekly.yml`（周报）、`docs/launch.md`（部署与回滚步骤）。
> 线上地址：`https://freddywang12138.github.io/tuxiaoyu/`

---

## 0. 先搞清楚这套监控在干什么

| 项 | 值 | 说明 |
| --- | --- | --- |
| 频率 | 每 30 分钟（UTC `*/30 * * * *`） | 北京时间每小时 `:00`、`:30` |
| 探活目标 | 首页 + `styles/main.css` + `assets/js/app.js` + `workers/compress.worker.js` | 首页断言含 H1 文案「把图片压小，不必上传」且 > 2000 B |
| 失败重试 | 每个 URL 失败后 3 秒重试 1 次，`curl --max-time 15` | 抗单次网络抖动 |
| 开单条件 | **连续 2 次运行失败** | 第 1 次只让运行变红，不打扰人 |
| 查重 | 开单前查 `label:incident state:open` | 已有就只追加评论，**绝不开第二张** |
| 恢复 | 一次成功 + 存在未关闭 incident | 自动评论恢复时间并关单 |
| 周报 | 每周一 09:00（北京时间） | `[weekly] YYYY-Www 健康周报` |

判"连续"的方法：失败且没有未关闭 incident 时，调 GitHub API 读**本 workflow 上一次已完成运行**的结论；是 `failure` 才开单。所以：

- 第 1 次失败：运行红，**不开单**（日志里有一行 `第 1 次连续失败，按策略暂不开单`）。
- 第 2 次失败（约 30 分钟后）：开单，标题 `[incident] 站点探活失败 YYYY-MM-DD`（日期取北京时间）。
- 第 3 次及以后：只在那张单追加「故障仍在持续」，2 小时内不重复评论，避免刷屏。
- 任意一次成功：如果那张单还开着，评论「已恢复 + 恢复时间」并**自动关闭**。

> 上线顺序提醒：`monitor.yml` 一旦进 `main` 就会开始跑。**先确认 `deploy.yml` 成功、线上 200，再让 monitor 进 main**；否则上线前它会连续报警并开单（当前站点还是 404，属于"未发布"而不是"故障"）。

手动跑一次（验证 workflow 没写坏）：

```bash
gh workflow run monitor.yml
gh run list --workflow=monitor.yml --limit 3
gh run watch "$(gh run list --workflow=monitor.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

运维事实（踩过就知道）：

- `schedule` **只在默认分支 `main` 上生效**；在 PR 分支里等不到定时运行，只能 `workflow_dispatch`。
- 仓库连续 60 天无提交时，GitHub 可能自动停用定时任务。发现周报/探活"几天没跑"先看 Actions 页顶部的 enable 提示，手动 enable 或推一个无意义小提交即可恢复——这也是为什么周一要读周报：没周报本身就是告警。
- Pages 有 CDN 缓存，回滚/重新部署后线上生效可能滞后几分钟；回滚后若探活仍红，先等 5 分钟再判断，别在同一分钟内二次回滚。
- 同一天内"恢复 → 又挂"会再开一张同标题的新单（标题只精确到日期）。这是有意的：旧单已带恢复记录，混在一起会看不清第二次故障的时间线。

---

## 1. 故障分级

| 级别 | 定义 | 用户感受 | 首次响应 | 止血目标 |
| --- | --- | --- | --- | --- |
| **P0** | 站点打不开：首页非 200、白屏、证书/域名错误 | 完全不能用，等于下线 | **15 分钟内**有人认领 | 2 小时内恢复或回滚 |
| **P1** | 站点能开但坏了：关键资源 404 / content-type 错 / H1 等特征文案被改 / 页面报错 | 打开是残的、功能不可用、被篡改 | **4 小时内** | 当个工作日恢复 |
| **P2** | 部署失败但线上旧版仍可用；体积异常增长；周报显示 CI 反复红 | 用户暂时无感，但下次发布危险 | **1 个工作日内** | 下个发布窗口修掉 |

升级规则：P1 若 24 小时未定位 → 升 P0 处理；P0 若 2 小时未恢复 → 直接回滚，不在线上调试。

### P0 · 站点打不开

**怎么确认**（3 步，别只看探活单）：

1. 手机流量 + 电脑各开一次 `https://freddywang12138.github.io/tuxiaoyu/`，排除本地网络/DNS。
2. `curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' --max-time 15 https://freddywang12138.github.io/tuxiaoyu/`
3. 看仓库 **Actions → deploy.yml** 最近一次是否红；再看 **Settings → Pages** 的 Source 是否还是 `GitHub Actions`、最近部署时间。

**先做什么**：

1. 在 incident 单里回一句「已认领 + 当前判断（P0）+ 正在看 deploy 记录」，让别人知道有人在。
2. 如果是最近一次 deploy 把它弄挂的 → **立刻回滚**（见下），不要在 main 上边修边等。
3. 如果是 GitHub Pages 平台侧故障（status.github.com 有事故）→ 记录，等平台恢复，同时在单里说明"非我方变更"。
4. 恢复后用隐私窗口复验首页 + 拖一张图能压，再等 monitor 自动关单。

**回滚**：见 `docs/launch.md` §3（§3.1 `git revert` 走完整重新部署 / §3.2 应急重跑旧 commit / §3.3 下线止血）。原则是**回到上一个已知绿的 commit**，用 `git revert` 产生一个新提交（不改历史），由 `deploy.yml` 重新发布；紧急情况下可在 Actions 里 re-run 上一个成功的 deploy 运行。回滚后必须在本单写清回滚到哪个 commit。

**incident 里记什么**：发现时间（北京时间）、认领人、影响（"全站打不开"）、deploy 运行链接、回滚 commit、恢复时间、根因一句话。

### P1 · 资源 404 / 文案被改 / 页面报错

**怎么确认**：

1. 看探活单里具体哪一项 ❌（首页 / css / app.js / worker），失败原因是 HTTP 码、content-type 还是缺特征串。
2. 本地对照：`curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://freddywang12138.github.io/tuxiaoyu/styles/main.css`（把路径换成失败项）。
3. 打开页面按 F12 → Console / Network，看是否有 404、MIME 报错、CSP 拦截。
4. 文案类：`curl -sS https://freddywang12138.github.io/tuxiaoyu/ | grep -c '把图片压小，不必上传'`，返回 0 说明页面确实被改或返回了错误页。

**先做什么**：

1. 判断是**线上产物坏**还是**探活断言过时**：如果是有意改文案/改文件名，先改 `monitor.yml` 里的 `FEATURE_TEXT` / 资源路径，再验证一次；如果是无意的，按线上产物坏处理。
2. 线上产物坏 → 回滚到上一个绿 commit（同 P0 回滚步骤），再补一个修复 PR，不在线上手改。
3. 若只是单个资源 404 但页面核心可用：可先回滚该资源对应改动，级别保持 P1，当个工作日修完。
4. 如果是被外部篡改（页面出现非本项目内容）：按 P0 处理并保留证据（截图存到 incident 单的**文字描述**里，别贴用户图片链接）。

**incident 里记什么**：哪一项断言失败、HTTP 码与 content-type 实际值、页面截图结论（文字）、是否回滚、回滚 commit、修复 PR 链接。

### P2 · 部署失败但旧版还在

**怎么确认**：

1. `gh run list --workflow=deploy.yml --limit 5` 看红在哪一步（构建 / 上传 artifact / deploy-pages）。
2. 线上 `curl` 仍是 200 → 用户无感，属于 P2，不要半夜叫醒人。
3. 看是不是权限问题（`pages: write` / `id-token: write`）、artifact 体积超限、或 `ci.yml` 先红了。

**先做什么**：

1. 在单里记录失败运行链接与错误摘要。
2. 本地复现同一命令；修好后走正常 PR → CI → 合入 → 自动部署。
3. 不要为了"让部署变绿"去删 CI 检查或跳过测试；也不要手动往 Pages 上传本地文件（会造成线上与仓库不一致）。

**incident 里记什么**：失败步骤、错误摘要（≤ 10 行）、是否影响线上、修复 PR、下次发布计划。

---

## 2. 误报处理：是站点真挂，还是探活脚本的问题？

先看证据，再动手。**探活失败 ≠ 站点挂了**，两者处理方式相反：真挂要回滚，脚本坏要修脚本。

| 现象 | 更像 | 判定方法 |
| --- | --- | --- |
| 4 项全 ❌ 且都是 `HTTP 000` / 超时 | 脚本/网络/GitHub 侧 | 本机 `curl` 同一 URL 是否 200；GitHub Status 是否有事故 |
| 只有首页 ❌ 但 curl 手测 200 且含文案 | 脚本问题 | 检查是否 locale/grep 问题、`FEATURE_TEXT` 是否被改过 |
| 只有某个资源 ❌ 且是 404 | 站点真坏（或路径被改） | 手测该资源 URL；看最近 commit 是否改名 |
| content-type 不符（如 `text/plain`） | 站点真坏 | 手测 `-w '%{content_type}'`；Pages 可能因文件后缀/`.nojekyll` 异常 |
| 隔一次红一次（抖动） | 外部网络抖动 | 看失败运行是否集中在同一时段、是否 `HTTP 000` |
| 只有 `schedule` 红、`workflow_dispatch` 绿 | 调度延迟/平台 | 看运行开始时间是否比 cron 晚很多；属平台侧，调阈值而非改代码 |
| 运行在「探活步骤没有交出完整结果」处失败 | workflow 脚本 bug | 看该步日志最后 30 行，通常是 bash 语法/环境变量问题 |

**抖动怎么调阈值**（从保守到激进，改完必须手动 dispatch 验证）：

1. 先确认不是真故障：连续手动 dispatch 3 次，看是否稳定复现。
2. 只是偶发网络抖动 → 把 `curl --max-time 15` 放宽到 20–25，重试间隔 3s 放宽到 10s；**不要**直接删掉断言。
3. 失败太频繁但站点确实偶尔慢 → 把开单门槛从"连续 2 次"提到"连续 3 次"（改 alert 步骤里的 `PREV != "failure"` 判断为读最近两次结论），响应时间会从 ~30 分钟拉到 ~60 分钟，属于可用性 vs 噪音的取舍。
4. 探活太稀疏 → 把 cron 从 `*/30` 改 `*/15`（Actions 配额与噪音都会翻倍，非必要不改）。
5. 页面有意改版 → 同步更新 `FEATURE_TEXT`、资源清单、`min_bytes`；**更新断言必须同时给出手测证据**（curl 实际输出），不能"为了让绿灯通过"把断言删成 `true`。

改完在 PR 描述里写：改了什么阈值、为什么、验证命令与输出。禁止直接把 `check` 调用注释掉。

---

## 3. 诚实边界：这套监控**测不到访问量**

必须对指挥官、对用户都说清楚，避免拿"监控全绿"当成"有人在用"。

| 想知道 | 能不能测 | 说明 |
| --- | --- | --- |
| 站点是否可用 | ✅ 能 | 每 30 分钟 HTTP 探活 |
| 页面是否被改坏/篡改 | ✅ 能（有限） | 只断言特征文案与关键资源，防不了细微改动 |
| 静态资源是否 404 / MIME 错 | ✅ 能 | 3 个关键资源 |
| 部署是否成功 | ✅ 能 | deploy.yml 运行结论 |
| **有多少访问（UV/PV）** | ❌ **不能** | 纯静态站无服务端日志、无埋点上报；GitHub Pages 不提供访问统计 |
| 用户从哪来（渠道/搜索词） | ❌ 不能 | 同上；需要 Search Console 等外部工具，需账号授权 |
| 用户在哪个环节放弃 | ❌ 不能 | 只能靠反馈单间接推断 |
| 压缩效果好不好 | ✅ 能（本地） | 固定样本图做基线，不进线上监控 |

**结论**：这套监控只能证明"站点活着且没被改坏"，**不能证明有人访问，也不能证明用户满意**。周报里出现的数字只有 workflow 成功率、incident 数、反馈数，**没有任何流量指标**——不是没统计，是这套架构根本测不到。

不要为了"看起来有数据"去编造 UV/PV、不要用"监控全绿"推导"用户很多"。要真实流量，只有两条路：接第三方统计（需指挥官注册授权）或在页面加自建计数接口（违反"无后端"硬约束，需指挥官裁决）。

---

## 4. 三条"不要做"

1. **不要为了绿灯把断言放宽到无意义**：删 `check`、把特征串改成空、把 `min_bytes` 改成 0、把 `curl` 的 `-f` 去掉只判"命令能跑"，都是在把监控变成装饰。改断言必须附手测证据。
2. **不要让告警自动改代码**：monitor 只允许 `issues: write` + 只读 API；不要给它 `contents: write`、不要让它自动 revert/commit/push。止血由人决策，回滚走 `docs/launch.md` 的流程。
3. **不要在 incident 里贴用户图片链接或任何个人信息**：用户上传的是私人照片，单子是公开的。需要证据时贴**你自己的复现图**，或只写文字描述；截图前先打码。同理不要贴 token、cookie、完整请求头。

---

## 5. incident 单怎么记（模板）

复制到单子里，按时间线填，别写散文：

```markdown
## 影响
- 级别：P0 / P1 / P2
- 用户感知：（全站打不开 / 资源缺失 / 无感）
- 开始时间：YYYY-MM-DD HH:MM（北京时间）

## 时间线（北京时间）
- HH:MM monitor 第 1 次失败（运行链接）
- HH:MM monitor 第 2 次失败 → 自动开单
- HH:MM 某人认领
- HH:MM 确认原因 / 决定回滚
- HH:MM 回滚到 commit <sha>
- HH:MM 线上复验通过

## 根因
一句话，能复述给非技术同学听。

## 处置
- 回滚 commit：
- 修复 PR：
- 防复发（加了什么断言/检查）：

## 复盘
- 监控是否提前发现？提前了多久？
- 下次同样故障能更快吗？改了什么？
```

关单由 monitor 自动做；如果修完但 monitor 还没跑，可手动 dispatch 一次 `monitor.yml` 触发"成功 → 关单"，不要手工关单绕过恢复验证（除非确认是探活脚本问题，那就先修脚本）。

---

## 附录：常用命令

```bash
# 手测首页
curl -sS -o /dev/null -w '%{http_code} %{content_type} %{size_download}\n' --max-time 15 \
  https://freddywang12138.github.io/tuxiaoyu/

# 断言特征文案（返回 1 即存在）
curl -sS --max-time 15 https://freddywang12138.github.io/tuxiaoyu/ | grep -c '把图片压小，不必上传'

# 手测关键资源
for p in styles/main.css assets/js/app.js workers/compress.worker.js; do
  curl -sS -o /dev/null -w "$p %{http_code} %{content_type}\n" --max-time 15 \
    "https://freddywang12138.github.io/tuxiaoyu/$p"
done

# 最近的 monitor / deploy 运行
gh run list --workflow=monitor.yml --limit 10
gh run list --workflow=deploy.yml --limit 10

# 手动触发一次探活（会真实开/关单）
gh workflow run monitor.yml

# 看未关闭的 incident 与反馈
gh issue list --label incident --state open
gh issue list --state open --label type:bug
```
