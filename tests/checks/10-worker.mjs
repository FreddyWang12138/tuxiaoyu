/** 检查 10：Worker 接线——文件存在、相对路径、module 类型。 */
import path from 'node:path';
import { read, exists, result, stripJsComments, parseAttrs, tags, runCli } from '../lib/harness.mjs';

export const id = '10';
export const title = 'Worker 接线：new Worker(相对路径, { type: "module" })';

export async function run() {
  const out = [];
  const compress = stripJsComments(read('assets/js/compress.js'));
  const html = read('index.html');

  out.push(result('workers/compress.worker.js 存在', exists('workers/compress.worker.js')));

  const urlDef = /new\s+URL\s*\(\s*['"]([^'"]*compress\.worker\.js)['"]\s*,\s*import\.meta\.url\s*\)/.exec(compress);
  out.push(result('WORKER_URL 由 new URL(相对路径, import.meta.url) 解析', Boolean(urlDef), urlDef ? [`new URL('${urlDef[1]}', import.meta.url)`] : ['未找到']));

  const workerCall = /new\s+Worker\s*\(\s*([^,]+),\s*(\{[^}]*\})\s*\)/.exec(compress);
  const typeModule = workerCall ? /type\s*:\s*['"]module['"]/.test(workerCall[2]) : false;
  out.push(result('new Worker(WORKER_URL, { type: "module" })', Boolean(workerCall) && /WORKER_URL/.test(workerCall[1]) && typeModule, workerCall ? [`new Worker(${workerCall[1].trim()}, ${workerCall[2].trim()})`] : ['未找到 new Worker 调用']));

  let resolved = null;
  if (urlDef) {
    resolved = path.posix.normalize(path.posix.join('assets/js', urlDef[1]));
    out.push(result(`worker 路径从 compress.js 解析后存在：${resolved}`, exists(resolved), [resolved]));
  }

  out.push(result('worker 路径不是以 / 开头的绝对路径', Boolean(urlDef) && !urlDef[1].startsWith('/'), urlDef ? [urlDef[1]] : []));

  const worker = read('workers/compress.worker.js');
  const workerImports = [...worker.matchAll(/import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const badImports = workerImports.filter((s) => !s.startsWith('./') && !s.startsWith('../'));
  const missingImports = workerImports.filter((s) => !exists(path.posix.normalize(path.posix.join('workers', s))));
  out.push(result('worker 内 import 都是相对路径且文件存在', badImports.length === 0 && missingImports.length === 0, [
    ...workerImports.map((s) => `${s} → ${exists(path.posix.normalize(path.posix.join('workers', s))) ? '存在' : '缺失'}`),
    ...badImports.map((s) => `FAIL 非相对 import：${s}`),
  ]));

  out.push(result('worker 监听 onmessage 并回传结果', /self\.onmessage\s*=/.test(worker) && /self\.postMessage\s*\(/.test(worker), ['self.onmessage + self.postMessage 均在']));

  const appScript = /<script\b[^>]*\bsrc\s*=\s*["']\.\/assets\/js\/app\.js["'][^>]*>/.exec(html);
  out.push(result('index.html 以 type="module" 加载 app.js', Boolean(appScript) && /\btype\s*=\s*["']module["']/.test(appScript[0]), appScript ? [appScript[0]] : ['未找到 app.js script 标签']));

  const cspMeta = tags(html, 'meta')
    .map((t) => parseAttrs(t))
    .find((a) => (a['http-equiv'] || '').toLowerCase() === 'content-security-policy');
  const cspText = cspMeta ? cspMeta.content || '' : '';
  out.push(result('CSP worker-src 允许 self', /worker-src\s+[^;]*'self'/.test(cspText), cspText ? [cspText] : ['CSP 未声明 worker-src']));

  out.push(result('Worker 不可用时有主线程兜底', /compressOnMainThread/.test(compress), ['compressOnMainThread fallback 存在']));

  return out;
}

await runCli(import.meta.url, { id, title, run });
