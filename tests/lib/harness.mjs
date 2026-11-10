/**
 * QA 检查公共工具。零依赖：只用 node:fs / node:path / node:url。
 * 不做断言抛错，而是把每条结论收集成 { name, ok, detail }，方便逐条打印和汇总。
 */

import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 仓库根目录（tests/lib/../..）。 */
export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function abs(rel) {
  return path.join(ROOT, rel);
}

export function exists(rel) {
  return existsSync(abs(rel));
}

export function read(rel) {
  return readFileSync(abs(rel), 'utf8');
}

export function bytes(rel) {
  return statSync(abs(rel)).size;
}

/** 仓库相对路径，统一用 /，方便贴进报告。 */
export function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

/** 递归列文件（不用 readdir recursive，兼容旧 Node）。 */
export function walk(dirRel) {
  const start = abs(dirRel);
  const out = [];
  if (!existsSync(start)) return out;
  const visit = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === '.DS_Store') continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) visit(p);
      else out.push(p);
    }
  };
  visit(start);
  return out.sort();
}

/** 实际会部署的文本/脚本产物；docs/ 与 .orchestration/ 是内部文档，不部署。 */
export function deployFiles() {
  const files = [];
  for (const name of ['index.html', '404.html', 'robots.txt', 'sitemap.xml']) {
    if (exists(name)) files.push(abs(name));
  }
  for (const dir of ['styles', 'assets', 'workers']) files.push(...walk(dir));
  return files;
}

export function result(name, ok, detail = []) {
  return { name, ok: Boolean(ok), detail: Array.isArray(detail) ? detail : [detail] };
}

/** 行号：给 grep 类检查定位用。 */
export function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

/**
 * HTML 可见文本：去注释、去 script/style 块、去标签、还原常见实体。
 * 用在禁用词 / 文案一致性检查，避免把代码和注释算进去。
 */
export function htmlVisibleText(html) {
  let s = html.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return s.replace(/\s+/g, ' ').trim();
}

/** 粗略去 JS 注释；保护 http:// 这类字符串里的 //。 */
export function stripJsComments(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"\\])\/\/.*$/, '$1'))
    .join('\n');
}

/** 解析一个标签里的属性，键统一小写。 */
export function parseAttrs(tag) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  const body = tag.replace(/^<\s*[a-zA-Z0-9-]+/, '');
  let m;
  while ((m = re.exec(body)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

export function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => m[0]);
}

/** 元素带内部文本的标签（button / label / h1 等）。 */
export function elements(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)<\\/${name}>`, 'gi'))].map(
    (m) => ({ attrs: parseAttrs(`<${name} ${m[1]}>`), inner: m[2], raw: m[0] }),
  );
}

export function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function fmtBytes(n) {
  return `${n} B (${(n / 1024).toFixed(1)} KB)`;
}

/** WCAG 相对亮度与对比度，用作静态对比度检查。 */
export function contrast(hexFg, hexBg) {
  const lum = (hex) => {
    const h = hex.replace('#', '');
    const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = ch.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };
  const a = lum(hexFg);
  const b = lum(hexBg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export function printSuite(mod, results) {
  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n[${mod.id}] ${mod.title} — ${fails === 0 ? 'PASS' : `FAIL (${fails} 项)`}`);
  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);
    for (const line of r.detail) console.log(`      ${line}`);
  }
  return fails;
}

/** 单条检查可独立运行：node tests/checks/xx.mjs */
export async function runCli(metaUrl, mod) {
  if (!process.argv[1]) return;
  if (path.resolve(process.argv[1]) !== fileURLToPath(metaUrl)) return;
  const results = await mod.run();
  const fails = printSuite(mod, results);
  console.log(`\n结果：${results.length - fails} 通过 / ${fails} 失败`);
  process.exit(fails ? 1 : 0);
}
