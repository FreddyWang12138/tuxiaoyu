# Queenfish · 项目简报（指挥官版）

> 本文件是团队唯一事实来源。任何角色不得擅自修改"硬约束"一节；有异议写进汇报的"待决策项"，由指挥官裁决。

## 一句话定位

一个**完全在浏览器本地**运行的图片压缩 / 格式转换工具：图片不上传服务器，压缩完直接下载。

## 为什么是这个

- 品类本身有海量真实搜索需求（"图片压缩""png 转 jpg""图片转 webp""批量压缩图片"），用户是普通人 + 卖家 + 学生 + 办公人群，不是只有开发者。
- 纯前端可实现、零托管成本，所以**能真上线、真被访问、真收到反馈**。
- 隐私（不上传）+ 速度（无需等待上传）是可以真讲、可被验证的差异点。

## 硬约束（已定，勿改）

1. **静态站，零构建**：纯 `HTML + CSS + ES Module`。不引入 bundler、不引入框架、不引入 npm 运行时依赖。目标是 `git clone` 后直接 `python3 -m http.server` 就能跑。
2. **无后端**：没有 API、没有数据库、没有上传接口。图片只在标签页内存里流转。
3. **只用浏览器原生能力**做图像处理：`createImageBitmap` / `canvas` / `toBlob` / `OffscreenCanvas`；批量任务放进 Web Worker，主线程不能卡。
4. 依赖库若必须引入（如 zip 打包），**必须 vendored 到仓库内**（`assets/vendor/`），不得依赖 CDN 运行时。
5. **无第三方追踪脚本**。埋点只允许预留一个可插拔的 `track(event, payload)` 空实现，默认不上报任何东西。
6. 性能门槛：首屏传输 < 80KB（未 gzip），无网络请求阻塞渲染；批量 10 张图处理时 UI 不冻结。
7. 可访问性：全部交互键盘可达、有可见 focus、对比度达标、图片/按钮有可读名称。
8. 语言：界面中文，文案克制，**不写"最快""第一""无损"这类无法自证的绝对化承诺**。
9. 托管：GitHub Pages，公开仓库，建在 `FreddyWang12138` 账号下。CI/CD 与监控一律用 GitHub Actions。
10. **提交纪律**：worker 自行 `git commit` 到本地分支可以，但**不要 push、不要 `gh repo create`、不要改仓库远端**。上线动作统一由指挥官执行。

## 团队分工与文件所有权（防并发冲突）

同一轮里，各角色**只写自己名下的文件**，不要碰别人的。

| 角色 | 本轮负责文件 | 轮次 |
| --- | --- | --- |
| 产品设计 | `docs/prd.md` | R1 |
| 调研 | `docs/research.md` | R1 |
| 品牌/文案 | `docs/brand.md` | R1 |
| 开发 | `index.html`、`styles/**`、`assets/**`、`workers/**` | R2 |
| QA | `tests/**`、`docs/qa-report.md` | R2 |
| 发布 | `.github/workflows/deploy.yml`、`scripts/**`、`docs/launch.md` | R3 |
| 运维 | `.github/workflows/monitor.yml`、`docs/runbook.md` | R3 |
| 反馈闭环 | `.github/ISSUE_TEMPLATE/**`、`docs/feedback.md` | R3 |

## 阶段验收（指挥官 gate）

- **G1 立项**：PRD + 调研 + 品牌三份产出到位 → 指挥官拍板 MVP 范围。
- **G2 开发**：本地能跑、QA 报告通过 → 指挥官验收。
- **G3 上线**：公开 URL 可访问、CI 绿 → 指挥官点击发布。
- **G4 监控**：探活工作流真跑过一次并留下证据 → 交给自动化，不必每次盯着。
- **G5 迭代**：从真实反馈/监控里挑 1 条，走完 工单 → PR → 自动部署 → 复盘。

## 汇报格式（所有 worker 必须遵守）

结束前用以下结构汇报，不要长篇散文：

```
做了什么：
关键决策（及理由）：
证据（命令 + 关键输出 / 文件列表）：
待指挥官决策：
```

## 工作区

当前仓库根目录：`/Users/wangzhitao/orca/workspaces/MyAgentTeam/queenfish`
