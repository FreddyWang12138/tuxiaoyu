# 指挥官手册：怎么指挥这支 agent team

> 这份手册是给"下一个我"看的。它不解释产品，只解释**怎么把活派下去、怎么验收、在哪儿会被坑**。

## 1. 角色与产出物（谁写什么，不许越界）

| 角色 | 只写这些文件 | 产出判据 |
| --- | --- | --- |
| 产品 | `docs/prd.md` | 有 P0/P1/P2、有"不做"清单、每条 P0 可被验 |
| 调研 | `docs/research.md` | 竞品结论有取证、不确定项标"未验证"、给得出可执行动作 |
| 品牌文案 | `docs/brand.md` | 文案能直接抄进页面、无绝对化承诺、有 SEO 三件套 |
| 开发 | `index.html` `styles/**` `assets/**` `workers/**` | 本地能跑 + 自测清单逐条过 |
| QA | `tests/**` `docs/qa-report.md` | 真跑出输出、区分"产物缺陷"与"规则缺陷" |
| 发布 | `.github/workflows/ci.yml` `deploy.yml` `scripts/**` `docs/launch.md` | 测试未过则部署不启动 |
| 运维 | `.github/workflows/monitor.yml` `weekly.yml` `docs/runbook.md` | 告警不刷屏、恢复能自动关单 |
| 反馈 | `.github/ISSUE_TEMPLATE/**` `docs/feedback.md` | 模板能被页面链接命中、标签名与模板逐字一致 |

**为什么强制分文件**：多个 agent 并行改同一个文件 = 必然冲突，而且没人知道是谁弄坏的。

## 2. 五个检查点（G0–G5）

| Gate | 什么时候 | 你要做的动作 | 不许跳过的理由 |
| --- | --- | --- | --- |
| G0 | 开工前 | 写 `BRIEF.md`，把硬约束钉死 | 没有硬约束，每个 agent 都会按自己的口味改架构 |
| G1 | 三份文档到位 | 拍板 MVP 范围，**并亲自修掉文档之间的冲突** | 冲突留给开发 = 开发替你随机选一个 |
| G2 | 代码到位 | **自己跑测试**，不看 agent 的自评 | 自评会说"应该通过" |
| G3 | 上线 | 验证真 URL 的 200 与资源 | 部署 job success ≠ 站点能用 |
| G4 | 监控 | 手动跑一次 workflow，看日志里真有断言 | 未跑过的 workflow 只是 YAML |
| G5 | 首轮迭代 | 工单 → 分支 → PR → CI → 合并 → 验证线上 → 回评关单 | 不回评，反馈闭环就断在最后一环 |

## 3. 必须知道的三条踩坑记录（都是这次真踩的）

### 坑 1：agent 会在第一分钟开始"读文档"，然后 12 分钟一个字不写

本次 R2 开发 worker 读了 12 分钟文档、零落盘，最后被撤掉由指挥官接管。

**对策**：派活时把"落盘优先"写进任务书第一句——
> 第一件事就是创建文件；先落最小可运行版本，再增量补。不要连续多轮只读文档。

### 坑 2：Orca worker 派发失败会假装成功

`worker-start --agent claude/codex/dsh` 时遇到三种失败，其中第三种最危险：

| 现象 | 根因 | 处理 |
| --- | --- | --- |
| `unknown option '--setting-sources'` | 本机 claude 是 2025-08 的旧版 | 升级 CLI 或换 agent |
| `cliMissing` | codex 未安装 | 装或换 |
| `stage=input_accepted` 但终端停在欢迎页 | dsh 被起成交互式 TUI，吃不到 stdin 任务书 | **不可信，要 `worker-read` 看终端** |

**对策**：`worker-start` 之后不要只看 `ok:true`，一定 `worker-read --dispatch <id>` 看终端里到底有没有活干。另外 `~/.dsh-tui/onboarding.json` 写 `{"completed":true,"version":1}` 可以跳过首次引导。

### 坑 3：AI 自己写的代码，自己看不出自己的 bug

`new URL('../workers/x.js', import.meta.url)` 从 `assets/js/` 出发会解析成 `assets/workers/`——线上必 404，而我自己"验证"时只 curl 了首页。

**对策**：QA 必须独立于开发，而且 QA 的检查要覆盖"运行时才会暴露的路径解析"，不能只扫文件存在性。这次是发布角色的 `verify-site.sh` 递归跟进 `new URL(..., import.meta.url)` 才抓到的。

## 4. 一轮迭代的标准动作（照着做）

```bash
# 1. 从反馈里挑一条，落成 issue（带 type:* 与 needs-triage 标签）
gh issue create --label "type:feature" --label "needs-triage" --title "..." --body-file /tmp/body.md

# 2. 开分支实现，本地先跑测试
git checkout -b feat/xxx
node tests/run.mjs && node tests/server-check.mjs

# 3. 提 PR（正文写清"为什么/做了什么/验证命令与输出/已知未验"）
gh pr create --base main --head feat/xxx --body-file /tmp/pr.md

# 4. 等 CI 绿再合
gh pr checks <n>
gh pr merge <n> --squash

# 5. 合并 → deploy 自动跑 → 必须验线上真实 URL，别只看 job 绿
curl -sS -o /dev/null -w "%{http_code}\n" https://freddywang12138.github.io/tuxiaoyu/
curl -sS https://freddywang12138.github.io/tuxiaoyu/ | grep -c "<新特征>"

# 6. 回评提出者并关单（PR 里写 Closes #n 会自动关，但回评不能省）
gh issue comment <n> --body-file /tmp/comment.md
```

## 5. 日常节奏

- **每 30 分钟**：`monitor.yml` 自动探活。连续 2 次失败才开 `[incident]` 单；恢复自动评论关单。
- **每周一 09:00（北京）**：`weekly.yml` 开健康周报（run 成功率 / 未闭环 incident / 未处理反馈）。
- **每周**：从 `type:feature` 里挑 1 条做迭代，其余保持 backlog。
- **每次上线后**：写 3 行复盘（改了什么 / 预期什么 / 下周看什么）。

## 6. 不能做的事

1. **不要为了让检查变绿而放宽检查**。这次 QA 有三条外链规则是误报，我让 QA 改规则并写明理由，但拒绝"删掉页脚源代码链接"这种变绿方式。
2. **不要把 star 当流量**。没有后端就没有真实访问量，只有 GitHub Traffic（14 天）和 Issue 能推断。
3. **不要用无法自证的文案**：最快 / 第一 / 无损 / 永久免费 / 100%。
4. **不要在 incident 里贴用户图片链接**（会打脸"图片不上传"）。
