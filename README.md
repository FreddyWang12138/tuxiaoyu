# 图小鱼

浏览器本地图片压缩与格式转换。图片不上传、不经过任何服务器。

线上地址：<https://freddywang12138.github.io/tuxiaoyu/>

## 它解决什么

手机上拍的商品图、课程照片动辄 6–9MB，很多平台限制单张 5MB 以内。常见在线压缩工具要把图片上传到别人服务器，传完还得等，而且图片去哪了没人知道。

这个项目只做一件事：**在你自己的浏览器里把图压小、把格式转对，然后给你下载。** 页面没有上传接口，`Content-Security-Policy` 里写着 `connect-src 'none'`——浏览器层面就不允许它往外连。

## 本地运行

零构建、零依赖，不需要 `npm install`：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000/
```

因为部署在 GitHub Pages 的**子路径**下，所有资源都必须是相对路径。想验证子路径是否正常：

```bash
mkdir -p /tmp/subtest && ln -s "$PWD" /tmp/subtest/tuxiaoyu
cd /tmp/subtest && python3 -m http.server 8001
# 打开 http://localhost:8001/tuxiaoyu/
```

## 目录结构

```
index.html                    单页应用
404.html                      Pages 的 404 兜底
styles/main.css               全部样式
assets/js/app.js              主逻辑：入队、编排、渲染、下载
assets/js/compress.js         压缩池（Web Worker 并行 + 主线程兜底）
assets/js/detect.js           格式/体积校验、WebP 能力检测（worker 也 import）
assets/js/format.js           体积与文件名纯函数
workers/compress.worker.js    解码 → 绘制 → 编码，全在 worker 里
robots.txt / sitemap.xml / .nojekyll
tests/                        QA 的零依赖检查脚本（node tests/run.mjs）
.github/workflows/            CI / 部署 / 监控 / 周报
docs/                         产品、调研、品牌、决策日志、运行手册
```

## 支持范围（有意为之的限制）

- 输入：JPG / PNG / WebP。**不支持** GIF（动图会被压成静态首帧）、HEIC、AVIF、RAW。
- 单张 ≤ 80MB、≤ 1.2 亿像素；一次 ≤ 60 张。
- 输出：JPG / WebP / 保持原格式。PNG 默认转 WebP（保留透明且更小）。
- 压缩后如果反而变大（输出 ≥ 原图 × 0.98），默认给你原图，并明确标注"没变小"。
- 输出不含 EXIF（canvas 重新编码天然剥离，包括 GPS 与机型）。

## 隐私怎么自己验证

1. 打开页面，按 F12，切到 **Network** 面板。
2. 拖一张图进来压缩。
3. 你只会看到本站静态文件的请求，不会有任何图片被发出去。
4. 断网，再压一张——照样能用。

## 已知限制

- **没有后端，就测不到访问量。** 这个项目不装任何统计脚本，因此"有多少人用"只能靠 GitHub Traffic（14 天窗口）和 Issue 反馈间接判断，不能对外声称日活。
- GitHub Pages 无 ICP 备案，中国大陆访问速度与稳定性不由我们控制。整站纯静态、全相对路径，必要时可原样迁到任意静态托管。
- 压缩质量取决于浏览器自带的编码器，不同浏览器结果会有差异。

## 路线

首版之后按真实反馈排序，候选已记录在 `docs/DECISIONS.md`：

1. 「压到指定大小」（200KB / 500KB / 2MB 预设 + 最接近值提示）—— 调研显示这是被竞品收费验证过的硬需求。
2. 批量打包 zip。
3. 最长边缩放、前后对比预览、记住上次设置。

## 反馈

<https://github.com/FreddyWang12138/tuxiaoyu/issues/new?template=feedback.yml>
