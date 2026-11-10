/** 检查 1：HTML 结构与首屏必备元信息。 */
import { exists, read, result, elements, runCli, stripTags } from '../lib/harness.mjs';

export const id = '01';
export const title = '结构：lang / viewport / title / description / H1';

export async function run() {
  const out = [];
  const okFile = exists('index.html');
  out.push(result('index.html 存在', okFile));
  if (!okFile) return out;

  const html = read('index.html');

  out.push(result('声明 <!doctype html>', /^\s*<!doctype html>/i.test(html)));
  out.push(result('<html lang="zh-CN">', /<html\b[^>]*\blang\s*=\s*["']zh-CN["']/i.test(html)));

  const viewport = /<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/i.exec(html);
  out.push(
    result(
      'viewport meta 存在且含 width=device-width',
      Boolean(viewport) && /width\s*=\s*device-width/i.test(viewport[0]),
      viewport ? [viewport[0]] : ['未找到 <meta name="viewport">'],
    ),
  );

  const title = /<title>([\s\S]*?)<\/title>/i.exec(html);
  const titleText = title ? stripTags(title[1]) : '';
  out.push(result('title 存在且非空', titleText.length > 0, titleText ? [`<title>${titleText}</title>`] : ['未找到 <title>']));

  const desc = /<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*\bcontent\s*=\s*["']([^"']+)["']/i.exec(html);
  out.push(
    result('meta description 存在且非空', Boolean(desc) && desc[1].trim().length > 0, desc ? [`${desc[1].trim().length} 字`] : ['未找到 meta description']),
  );

  out.push(result('charset 声明', /<meta\b[^>]*\bcharset\s*=\s*["']?utf-8/i.test(html)));

  const h1s = elements(html, 'h1');
  const first = h1s[0];
  const h1Text = first ? stripTags(first.inner) : '';
  const h1Hidden = first ? /(^|\s)(sr-only|visually-hidden)(\s|$)/.test(first.attrs.class || '') : false;
  out.push(
    result('首屏 H1 存在、非空、非隐藏', Boolean(first) && h1Text.length > 0 && !h1Hidden, first ? [`<h1>${h1Text}</h1>`] : ['没有 <h1>']),
  );
  out.push(result('H1 唯一', h1s.length === 1, [`共 ${h1s.length} 个 <h1>`]));

  return out;
}

await runCli(import.meta.url, { id, title, run });
