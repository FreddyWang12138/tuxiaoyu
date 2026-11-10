# 需人工 / 需浏览器验证清单

以下项目 QA 的静态脚本无法判定，**没有假装验过**。每条给了具体验法与期望结果；
执行后把「实际」填进 `docs/qa-report.md` 的对应表格即可。

## A. 图片正确性

### A1. EXIF Orientation=6 的手机照片方向
1. 找一张带 `Orientation=6` 的竖拍手机照片（ExifTool 确认：`exiftool -Orientation 样本.jpg` → `Rotate 90 CW`）。
2. 拖进页面，输出 JPG。
3. 用系统看图器 / 手机相册打开输出。
- 期望：方向与相册里一致，不躺倒、不镜像。
- 代码依据：`workers/compress.worker.js` 与 `compress.js` 都用 `createImageBitmap(file, { imageOrientation: 'from-image' })`。
- 风险：Safari 旧版本对 `'from-image'` 的支持要单独验；若抛 `TypeError`，该浏览器整条压缩链路会失败。

### A2. 透明 PNG 转 JPG 的白底
1. 做一张 500×500、中间半透明/全透明、四周有内容的 PNG（透明区应为纯白，不是黑或灰）。
2. 输出格式选「转 JPG」，均衡档。
3. 用取色器点透明区域。
- 期望：`#ffffff`；半透明边缘不出现黑边。
- 代码依据：worker 在 `drawImage` 前 `fillStyle='#ffffff'` + `fillRect`，主线程兜底同样处理。

### A3. 输出剥离 EXIF
1. 用带 GPS 的照片压一张 JPG。
2. `exiftool 输出.jpg`。
- 期望：没有 GPS、机身型号、拍摄时间等原始 EXIF（canvas 重编码天然剥离）。
- 注意：页面目前**没有**写「输出不含拍摄信息」这句话，见报告 P0-10。

### A4. 压缩率与三档单调性（P0-2 / P0-4）
1. 准备同一张 3MB JPG，分别用「体积更小 / 均衡 / 质量更高」各压一次，记录输出字节。
2. 均衡档期望 ≤ 原图 70%；三档体积应递增（容差 ±2%）。
3. 100% 放大对照细节，看有无色块/涂抹；系统看图器能打开。
- 代码前提已单测：`qualityFor` 三档数值严格递增（8 个 node:test 全过）。
- 真实体积由编码器决定，必须浏览器实测。

### A5. WebP 输出
1. 同一张图分别选「保持原格式（JPG）」与「转 WebP」。
2. 期望 WebP 更小、Chrome 能打开；DevTools Console 里下载 blob 的 `type === 'image/webp'`。
- 风险：`app.js` 的 `applyResult` 在输出 ≥ 原图 98% 时会**静默改用原图**；
  用户明确选「转 WebP / 转 JPG」时也可能拿到原格式文件。见报告「格式转换被静默回退」。

## B. 隐私与离线

### B1. 零上传
1. 打开 DevTools → Network，勾选 Preserve log，清空。
2. 拖 3 张图压缩、下载。
- 期望：只有本站静态资源（html/css/js/worker），没有任何图片上传请求、没有第三方域。

### B2. 断网后仍可压缩（P0-8）
1. 页面完全加载后，DevTools → Network → Offline。
2. 再拖一张图压缩。
- 期望：正常完成（Worker 已加载、逻辑全本地）。若刷新页面后断网则必然失败，这是正常的。

## C. 交互与性能

### C1. 取消剩余（P0-5）—— 静态已判定失效，仍建议复现留证
1. 一次选 10 张 3MB JPG。
2. 开始后 1 秒内点「取消剩余」。
- 期望：未开始的行变「已取消」，已完成行保留。
- 当前代码预期：提示已取消，但所有行仍会跑完（`processOne` 在排队前就把行标成 working，`cancelRest` 只改 pending）。

### C2. 处理中追加文件
1. 选 10 张大图，处理中再选 1 张。
- 期望：新图进入队列并在当前批次后继续处理。
- 当前代码预期：新行永远停在「等待处理」（`startProcessing` 处理中直接 return，结束后不再触发）。

### C3. 批量性能（P0-5）
1. 10 张 3MB JPG，4 核 8GB 机器，从开始到全部完成计时。
- 期望：≤ 20s；期间页面可滚动、可点按钮、不冻结。
- 并发上限：`concurrency() = clamp(cores-1, 1, 4)`。

### C4. 全部下载（P0-7）
1. 压 5 张，点「全部下载」。
2. 浏览器若弹「允许下载多个文件」，先点「阻止」。
- 期望：有可见提示说明被拦截，且每行「下载这张」仍可用（替代路径）。
- 当前实现：`downloadAll` 每 300ms 触发一个 `<a download>`；提示文案存在。

### C5. 键盘全流程（P0-11）
1. 只用键盘：Tab 到拖拽区 → Enter 打开文件框 → 选图 → Tab 到格式/质量 → 选结果 → Tab 到下载。
- 期望：每一步 focus 可见（3:1 以上），无焦点陷阱。
- 已知问题：`input#file-input` 是 `.sr-only`，会多出一个看不见的 Tab 停留点（见报告）。

### C6. 移动端布局
1. Chrome DevTools 选 iPhone SE（375×667）/ 安卓 360 宽。
- 期望：结果行变成卡片（缩略图+信息在上、按钮整行在下），无横向滚动，按钮 ≥ 44px 高。

## D. 部署 / SEO

### D1. 子路径真实部署
1. 合并后访问 `https://freddywang12138.github.io/tuxiaoyu/`。
2. 直接访问一个不存在的深链接，例如 `/tuxiaoyu/a/b/c`。
- 期望：404 页面样式正常、「回到压缩图片」能回首页。
- 本地已用 `node tests/server-check.mjs` 模拟出问题：`./styles/main.css` 和 `./` 会相对 `/tuxiaoyu/a/b/` 解析 → 404。

### D2. sitemap
1. 打开 `/tuxiaoyu/sitemap.xml`，确认 404.html 是否该出现。
- 现状：sitemap 收录了带 `noindex` 的 `404.html`，两者矛盾，建议移除。

## 记录模板

| 项 | 环境（浏览器/版本/机型） | 实际结果 | 判定 |
|---|---|---|---|
| A1 EXIF 方向 |  |  |  |
| A2 透明 PNG 白底 |  |  |  |
| A3 EXIF 剥离 |  |  |  |
| A4 压缩率/三档 |  |  |  |
| A5 WebP |  |  |  |
| B1 零上传 |  |  |  |
| B2 断网压缩 |  |  |  |
| C1 取消剩余 |  |  |  |
| C2 处理中追加 |  |  |  |
| C3 批量性能 |  |  |  |
| C4 全部下载 |  |  |  |
| C5 键盘全流程 |  |  |  |
| C6 移动端 |  |  |  |
| D1 深链 404 |  |  |  |
| D2 sitemap |  |  |  |
