/** 检查 2：相对路径（禁止以 / 开头）且被引用文件真实存在。 */
import path from 'node:path';
import { read, exists, result, parseAttrs, stripJsComments, walk, rel, runCli } from '../lib/harness.mjs';

export const id = '02';
export const title = '相对路径：html src/href、css url()、js import';

const REMOTE = /^(?:[a-z]+:)?\/\//i;
const NON_ASSET = /^(?:#|mailto:|tel:|javascript:|data:|blob:)/i;

function resolveFrom(fileRel, spec) {
  const baseDir = path.posix.dirname(fileRel);
  let clean = spec.split('#')[0].split('?')[0];
  if (clean === '' || clean === '.') clean = './';
  const target = path.posix.normalize(path.posix.join(baseDir, clean));
  if (target.endsWith('/') || target === '.') return path.posix.join(target, 'index.html');
  return target;
}

function refsInHtml(fileRel) {
  const html = read(fileRel);
  const refs = [];
  for (const m of html.matchAll(/<(script|link|img|source|a|iframe)\b([^>]*)>/gi)) {
    const attrs = parseAttrs(m[0]);
    const url = attrs.src || attrs.href;
    if (!url || NON_ASSET.test(url) || REMOTE.test(url)) continue;
    refs.push({ file: fileRel, tag: m[1].toLowerCase(), url });
  }
  return refs;
}

function refsInCss(fileRel) {
  const css = read(fileRel).replace(/\/\*[\s\S]*?\*\//g, '');
  const refs = [];
  const push = (url) => {
    const clean = url.trim().replace(/^['"]|['"]$/g, '');
    if (!clean || clean.startsWith('data:') || clean.startsWith('#') || REMOTE.test(clean)) return;
    refs.push({ file: fileRel, tag: 'css', url: clean });
  };
  for (const m of css.matchAll(/url\(\s*([^)]+?)\s*\)/gi)) push(m[1]);
  for (const m of css.matchAll(/@import\s+([^;]+);/gi)) push(m[1]);
  return refs;
}

function refsInJs(fileRel) {
  const src = stripJsComments(read(fileRel));
  const refs = [];
  const patterns = [
    [/import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g, 'import'],
    [/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, 'dynamic import'],
    [/new\s+URL\s*\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g, 'new URL'],
  ];
  for (const [re, kind] of patterns) {
    for (const m of src.matchAll(re)) refs.push({ file: fileRel, tag: kind, url: m[1] });
  }
  return refs;
}

export async function run() {
  const out = [];
  const htmlFiles = ['index.html', '404.html'].filter((f) => exists(f));
  const cssFiles = walk('styles').filter((f) => f.endsWith('.css')).map(rel);
  const jsFiles = [...walk('assets'), ...walk('workers')].filter((f) => f.endsWith('.js')).map(rel);

  const refs = [
    ...htmlFiles.flatMap(refsInHtml),
    ...cssFiles.flatMap(refsInCss),
    ...jsFiles.flatMap(refsInJs),
  ];

  const byFile = new Map();
  for (const r of refs) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }

  if (byFile.size === 0) out.push(result('找到本地引用', false, ['解析不到任何本地资源引用']));

  for (const [file, list] of byFile) {
    const errors = [];
    const lines = [];
    for (const ref of list) {
      if (ref.url.startsWith('/')) {
        errors.push(`FAIL 以 / 开头：${ref.url}（线上在 /tuxiaoyu/ 子路径，会 404）`);
        continue;
      }
      if (!/^\.\.?\//.test(ref.url)) {
        errors.push(`FAIL 非相对路径：${ref.url}（import 必须是 ./ 或 ../）`);
        continue;
      }
      const target = resolveFrom(file, ref.url);
      const targetOk = exists(target);
      if (!targetOk) errors.push(`FAIL 引用文件不存在：${ref.url} → ${target}`);
      lines.push(`${ref.url} → ${target}${targetOk ? '' : '（缺失）'}`);
    }
    out.push(result(`${file}：${list.length} 个本地引用`, errors.length === 0, [...lines, ...errors]));
  }

  const leadingSlash = refs.filter((r) => r.url.startsWith('/'));
  out.push(
    result('无任何以 / 开头的本地引用', leadingSlash.length === 0,
      leadingSlash.length ? leadingSlash.map((r) => `${r.file}: ${r.url}`) : [`共检查 ${refs.length} 个引用`]),
  );

  return out;
}

await runCli(import.meta.url, { id, title, run });
