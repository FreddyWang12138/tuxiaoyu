/** 检查 6：禁用词（品牌口径）。只看页面可见文本 + 可读属性，排除注释与代码。 */
import { exists, read, result, htmlVisibleText, runCli, lineOf } from '../lib/harness.mjs';

export const id = '06';
export const title = '禁用词：最快/第一/无损/永久免费/100%/绝对/秒杀';

const WORDS = ['最快', '第一', '无损', '永久免费', '100%', '绝对', '秒杀'];

function context(text, index, len) {
  const start = Math.max(0, index - 24);
  const end = Math.min(text.length, index + len + 24);
  return `…${text.slice(start, end).replace(/\s+/g, ' ')}…`;
}

export async function run() {
  const out = [];
  const pages = ['index.html', '404.html'].filter(exists);
  const sources = [];

  for (const page of pages) {
    const html = read(page);
    sources.push({ name: `${page} 可见文本`, text: htmlVisibleText(html) });
    const meta = /<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html);
    if (meta) sources.push({ name: `${page} meta description（搜索结果可见）`, text: meta[1] });
    // 可读属性：alt / aria-label / title / placeholder
    const attrs = [];
    for (const m of html.matchAll(/<[^>]+>/g)) {
      const re = /\b(alt|aria-label|title|placeholder)\s*=\s*("([^"]*)"|'([^']*)')/gi;
      let a;
      while ((a = re.exec(m[0])) !== null) attrs.push(a[3] ?? a[4] ?? '');
    }
    sources.push({ name: `${page} 可读属性`, text: attrs.join(' ｜ ') });
  }

  const combined = sources.map((s) => s.text).join('\n');

  for (const word of WORDS) {
    const hits = [];
    for (const src of sources) {
      let idx = src.text.indexOf(word);
      while (idx !== -1) {
        hits.push(`${src.name}: ${context(src.text, idx, word.length)}`);
        idx = src.text.indexOf(word, idx + word.length);
      }
    }
    out.push(result(`无「${word}」`, hits.length === 0, hits.length ? hits : ['0 处']));
  }

  out.push(result('检查范围说明', true, [
    `已扫描 ${pages.join('、')} 的可见文本 / meta description / alt、aria-label、title`,
    '已排除 <script>、<style>、HTML 注释（避免把代码里的字符串当文案）',
    `合并文本 ${combined.length} 字`,
  ]));

  return out;
}

await runCli(import.meta.url, { id, title, run });
