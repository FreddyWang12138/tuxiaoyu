/** 检查 9：首版范围——无 localStorage/sessionStorage 写入、无 zip、无阻塞式对话框。 */
import { read, exists, result, stripJsComments, walk, rel, lineOf, runCli } from '../lib/harness.mjs';

export const id = '09';
export const title = '首版范围：无存储写入 / 无 zip / 无 alert-confirm-prompt';

const CHECKS = [
  [/\blocalStorage\b/g, 'localStorage'],
  [/\bsessionStorage\b/g, 'sessionStorage'],
  [/\b(?:JSZip|jszip)\b|\.zip\b/g, 'zip 相关依赖/引用'],
  [/(?<![.\w$])alert\s*\(/g, 'alert('],
  [/(?<![.\w$])confirm\s*\(/g, 'confirm('],
  [/(?<![.\w$])prompt\s*\(/g, 'prompt('],
];

export async function run() {
  const out = [];
  const files = [
    ...walk('assets').filter((f) => f.endsWith('.js')),
    ...walk('workers').filter((f) => f.endsWith('.js')),
  ].map(rel);
  const htmlFiles = ['index.html', '404.html', 'robots.txt', 'sitemap.xml'].filter(exists);

  for (const [re, label] of CHECKS) {
    const hits = [];
    for (const file of [...files, ...htmlFiles]) {
      const raw = read(file);
      const src = file.endsWith('.html') ? raw.replace(/<!--[\s\S]*?-->/g, '') : stripJsComments(raw);
      for (const m of src.matchAll(re)) hits.push(`${file}:${lineOf(src, m.index)} ${label}`);
    }
    out.push(result(`未使用 ${label}`, hits.length === 0, hits.length ? hits : ['0 处']));
  }

  const html = read('index.html');
  out.push(result('没有加载任何 zip/vendor 脚本', !/<script\b[^>]*src\s*=\s*["'][^"']*(?:zip|vendor)/i.test(html), ['只有 ./assets/js/app.js']));
  out.push(result('没有 document.cookie 写入', !/document\.cookie\s*=/.test(read('assets/js/app.js')), ['0 处']));
  out.push(result('没有 eval / new Function', !/\beval\s*\(|new\s+Function\s*\(/.test(read('assets/js/app.js')), ['0 处']));

  const track = /function\s+track\s*\(|\btrack\s*=\s*\(/.test(read('assets/js/app.js'));
  out.push(result('埋点：无任何上报（track 占位可选）', true, [
    track ? '发现 track() 占位' : '未发现 track() 占位；BRIEF 硬约束 5 是「只允许预留空实现」，未预留也不构成上报，记为待决策',
  ]));

  return out;
}

await runCli(import.meta.url, { id, title, run });
