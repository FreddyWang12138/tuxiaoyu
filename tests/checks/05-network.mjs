/** 检查 5：上报行为审计——不允许任何远程请求 API 或 http(s) 目标。 */
import { read, exists, result, stripJsComments, walk, rel, lineOf, parseAttrs, tags, runCli } from '../lib/harness.mjs';

export const id = '05';
export const title = '上报行为：fetch/XHR/beacon/WS/SSE/Image 全清';

const PATTERNS = [
  [/\bfetch\s*\(/g, 'fetch('],
  [/\bXMLHttpRequest\b/g, 'XMLHttpRequest'],
  [/\bsendBeacon\b/g, 'navigator.sendBeacon'],
  [/new\s+WebSocket\s*\(/g, 'new WebSocket('],
  [/new\s+EventSource\s*\(/g, 'new EventSource('],
  [/new\s+Image\s*\(/g, 'new Image('],
];

export async function run() {
  const out = [];
  const files = [
    ...walk('assets').filter((f) => f.endsWith('.js')),
    ...walk('workers').filter((f) => f.endsWith('.js')),
  ].map(rel);
  const htmlFiles = ['index.html', '404.html'].filter(exists);

  for (const [re, label] of PATTERNS) {
    const found = [];
    for (const file of [...files, ...htmlFiles]) {
      const src = file.endsWith('.html') ? read(file).replace(/<!--[\s\S]*?-->/g, '') : stripJsComments(read(file));
      for (const m of src.matchAll(re)) found.push(`${file}:${lineOf(src, m.index)} ${label}`);
    }
    out.push(result(`未使用 ${label}`, found.length === 0, found.length ? found : ['全仓 0 处']));
  }

  const remote = [];
  for (const file of files) {
    const src = stripJsComments(read(file));
    for (const m of src.matchAll(/['"`]https?:\/\/[^'"`\s]+['"`]/g)) remote.push(`${file}:${lineOf(src, m.index)} ${m[0]}`);
  }
  out.push(result('JS 内没有 http(s) 字符串（无远程请求目标）', remote.length === 0, remote.length ? remote : ['0 处']));

  const html = exists('index.html') ? read('index.html') : '';
  const cspMeta = tags(html, 'meta')
    .map((t) => parseAttrs(t))
    .find((a) => (a['http-equiv'] || '').toLowerCase() === 'content-security-policy');
  const cspText = cspMeta ? cspMeta.content || '' : '';
  out.push(result('CSP 存在且 connect-src 为 none', /connect-src\s+'none'/i.test(cspText), cspText ? [cspText] : ['没有 CSP meta']));
  out.push(result('无第三方脚本引用', !/<script\b[^>]*\bsrc\s*=\s*["']https?:/i.test(html), ['仅 ./assets/js/app.js']));

  return out;
}

await runCli(import.meta.url, { id, title, run });
