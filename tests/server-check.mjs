#!/usr/bin/env node
/**
 * 子路径部署验证（可选，不属于 run.mjs）：
 * 用 Node 内置 http 把仓库挂到 /tuxiaoyu/ 下，逐个请求页面与引用资源，
 * 并模拟深层 404 链接，验证相对路径在子路径下是否真的能解析。
 *
 * 用法：node tests/server-check.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT, deployFiles, rel } from './lib/harness.mjs';

const PREFIX = '/tuxiaoyu/';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

let notFoundCount = 0;
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith(PREFIX)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('outside prefix');
    return;
  }
  const relPath = decodeURIComponent(url.pathname.slice(PREFIX.length)) || 'index.html';
  let file = path.join(ROOT, relPath);
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
    return;
  }
  notFoundCount += 1;
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(path.join(ROOT, '404.html')));
});

const port = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const base = `http://127.0.0.1:${port}${PREFIX}`;
console.log(`本地服务：${base}  →  ${ROOT}`);
console.log('仓库文件（部署口径）：');
for (const f of deployFiles()) console.log(`  ${rel(f)} (${statSync(f).size} B)`);

const targets = [
  ['首页', ''],
  ['CSS', 'styles/main.css'],
  ['app.js', 'assets/js/app.js'],
  ['compress.js', 'assets/js/compress.js'],
  ['detect.js', 'assets/js/detect.js'],
  ['format.js', 'assets/js/format.js'],
  ['worker', 'workers/compress.worker.js'],
  ['404 页', '404.html'],
  ['robots', 'robots.txt'],
  ['sitemap', 'sitemap.xml'],
];

let failed = 0;
console.log('\n资源请求：');
for (const [label, p] of targets) {
  const res = await fetch(base + p);
  const body = await res.text();
  const ok = res.status === 200 && body.length > 0;
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${String(res.status).padStart(3)} ${res.headers.get('content-type')}  ${label} ${body.length} chars`);
}

// 深链接 404：GitHub Pages 会把任意不存在路径渲染成 404.html，
// 但页面里的 ./styles/main.css、./ 会相对「不存在的深路径」解析，这里验证是否 404。
console.log('\n深层 404 模拟（/tuxiaoyu/a/b/c）：');
const deep = `${PREFIX}a/b/c`;
const page = await fetch(`http://127.0.0.1:${port}${deep}`);
const html = await page.text();
console.log(`  页面状态 ${page.status}，返回 404.html 内容：${/<h1[^>]*>这个页面不存在<\/h1>/.test(html) ? '是' : '否'}`);
const refs = [...html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)]
  .map((m) => m[1])
  .filter((u) => !/^(?:#|https?:|mailto:|data:)/i.test(u));
for (const ref of refs) {
  const resolved = new URL(ref, `http://127.0.0.1:${port}${deep}`);
  const res = await fetch(resolved);
  const ok = res.status === 200;
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${res.status}  ${ref}  →  ${resolved.pathname}`);
}

console.log(`\n服务端 404 次数：${notFoundCount}（只统计上面这些请求）`);
console.log(`结果：${failed === 0 ? 'PASS' : `FAIL（${failed} 项）`}`);
server.close();
process.exit(failed === 0 ? 0 : 1);
