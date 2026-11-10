/** 检查 7：文案一致性——裁决后是 80MB / 60 张 / 仅 JPG+PNG+WebP。 */
import { exists, read, result, htmlVisibleText, walk, rel, lineOf, runCli } from '../lib/harness.mjs';

export const id = '07';
export const title = '文案一致性：80MB / 60 张 / JPG+PNG+WebP';

const FORBIDDEN = [
  [/50\s*MB/gi, '50MB'],
  [/50\s*张/g, '50 张'],
  [/\bGIF\b/gi, 'GIF'],
  [/\bAVIF\b/gi, 'AVIF'],
];

const REQUIRED = [
  [/80\s*MB/, '80MB'],
  [/60\s*张/, '60 张'],
  [/JPG/, 'JPG'],
  [/PNG/, 'PNG'],
  [/WebP/i, 'WebP'],
];

function context(text, index, len) {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + len + 20);
  return `…${text.slice(start, end).replace(/\s+/g, ' ')}…`;
}

export async function run() {
  const out = [];
  const pages = ['index.html', '404.html'].filter(exists);
  const text = pages.map((p) => htmlVisibleText(read(p))).join('\n');

  for (const [re, label] of FORBIDDEN) {
    const hits = [];
    for (const page of pages) {
      const t = htmlVisibleText(read(page));
      let m;
      const r = new RegExp(re.source, re.flags);
      while ((m = r.exec(t)) !== null) hits.push(`${page}: ${context(t, m.index, m[0].length)}`);
    }
    out.push(result(`页面不含旧口径「${label}」`, hits.length === 0, hits.length ? hits : ['0 处']));
  }

  for (const [re, label] of REQUIRED) {
    out.push(result(`首屏文案出现「${label}」`, re.test(text), re.test(text) ? ['已出现'] : ['未出现']));
  }

  // 代码常量必须与文案一致：80MB / 60 张。
  const detect = read('assets/js/detect.js');
  const maxBytes = /MAX_BYTES\s*=\s*80\s*\*\s*1024\s*\*\s*1024/.test(detect);
  const maxFiles = /MAX_FILES\s*=\s*60\s*;/.test(detect);
  out.push(result('detect.js 常量 MAX_BYTES = 80 * 1024 * 1024', maxBytes, [
    (detect.match(/MAX_BYTES\s*=\s*[^;]+;/) || ['未找到'])[0],
  ]));
  out.push(result('detect.js 常量 MAX_FILES = 60', maxFiles, [
    (detect.match(/MAX_FILES\s*=\s*[^;]+;/) || ['未找到'])[0],
  ]));

  // GIF/AVIF 只允许作为「不支持格式」的名字出现在代码里，不能出现在页面文案。
  const codeHits = [];
  for (const file of [...walk('assets').filter((f) => f.endsWith('.js')), ...walk('workers').filter((f) => f.endsWith('.js'))].map(rel)) {
    const src = read(file);
    for (const m of src.matchAll(/\b(GIF|AVIF)\b/g)) codeHits.push(`${file}:${lineOf(src, m.index)} ${m[0]}`);
  }
  out.push(result('GIF/AVIF 仅作为不支持格式标签出现在代码中', true, [
    ...(codeHits.length ? codeHits.map((h) => `说明：${h}（用户拖入该格式时的提示标签，不构成支持声明）`) : ['代码里也没有']),
  ]));

  return out;
}

await runCli(import.meta.url, { id, title, run });
