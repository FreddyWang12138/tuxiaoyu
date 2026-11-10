/** 检查 3：首屏体积预算 < 80KB（未压缩），打印每文件字节与占比。 */
import { exists, bytes, result, walk, rel, runCli } from '../lib/harness.mjs';

export const id = '03';
export const title = '体积预算：html + css + js 未压缩合计 < 80KB';

const BUDGET = 80 * 1024;

export async function run() {
  const out = [];
  const files = [
    'index.html',
    ...walk('styles').filter((f) => f.endsWith('.css')).map(rel),
    ...walk('assets').filter((f) => f.endsWith('.js')).map(rel),
    ...walk('workers').filter((f) => f.endsWith('.js')).map(rel),
  ].filter(exists);

  const rows = files.map((f) => ({ file: f, size: bytes(f) }));
  const total = rows.reduce((n, r) => n + r.size, 0);
  rows.sort((a, b) => b.size - a.size);

  const detail = rows.map((r) => {
    const pct = ((r.size / total) * 100).toFixed(1).padStart(5);
    return `${String(r.size).padStart(6)} B  ${pct}%  ${r.file}`;
  });
  detail.push(`合计 ${total} B = ${(total / 1024).toFixed(1)} KB，预算 ${BUDGET} B = 80.0 KB`);
  detail.push(`首屏余量 ${(BUDGET - total)} B；只计 index.html + CSS + JS（不含图片/字体，站点当前没有）`);

  out.push(result(`合计 ${(total / 1024).toFixed(1)} KB < 80 KB`, total < BUDGET, detail));
  out.push(result('单文件都不超过预算', rows.every((r) => r.size < BUDGET), rows.length ? [`最大文件 ${rows[0].file} = ${rows[0].size} B`] : ['没有找到文件']));
  return out;
}

await runCli(import.meta.url, { id, title, run });
