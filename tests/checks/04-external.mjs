/**
 * 检查 4：外链白名单。
 * 允许：
 *  - github.com/FreddyWang12138/tuxiaoyu（仓库根）
 *  - github.com/FreddyWang12138/tuxiaoyu/issues/...
 *  - freddywang12138.github.io
 * 豁免：XML 命名空间 / JSON-LD @context（schema.org、www.sitemaps.org 等）——
 *       它们是标识符，不是可导航地址、也不是请求目标（指挥官 2026-11-10 裁决）。
 */
import { read, deployFiles, result, rel, lineOf, walk, runCli } from '../lib/harness.mjs';

export const id = '04';
export const title = '外链白名单：仓库根/issue + Pages 域名（命名空间豁免）';

const REPO_ROOT_PATHS = new Set(['/FreddyWang12138/tuxiaoyu', '/FreddyWang12138/tuxiaoyu/']);
const ISSUES_PREFIX = '/FreddyWang12138/tuxiaoyu/issues/';
const PAGES_HOST = 'freddywang12138.github.io';
const NAMESPACE_HOSTS = new Set(['schema.org', 'www.schema.org', 'www.w3.org', 'www.sitemaps.org', 'sitemaps.org', 'purl.org', 'ogp.me']);

function classify(url) {
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  if (host === 'github.com') {
    if (path.startsWith(ISSUES_PREFIX)) return { kind: 'allowed', note: 'issue 路径' };
    if (REPO_ROOT_PATHS.has(path)) return { kind: 'allowed', note: '仓库根' };
    return { kind: 'navigable', note: `github.com 只允许仓库根或 ${ISSUES_PREFIX}...，实际 ${path}` };
  }
  if (host === PAGES_HOST) return { kind: 'allowed', note: 'Pages 域名' };
  if (NAMESPACE_HOSTS.has(host)) return { kind: 'exempt', note: 'XML/JSON-LD 命名空间，非导航/请求目标' };
  return { kind: 'navigable', note: '不在白名单' };
}

export async function run() {
  const out = [];
  const files = deployFiles().filter((f) => /\.(?:html|css|js|mjs|json|xml|txt)$/i.test(f));
  const hits = [];

  for (const file of files) {
    const src = read(rel(file));
    for (const m of src.matchAll(/\bhttps?:\/\/[^\s"'<>)\]]+/g)) {
      const raw = m[0].replace(/[.,;]+$/, '');
      let url;
      try {
        url = new URL(raw);
      } catch {
        hits.push({ file: rel(file), line: lineOf(src, m.index), url: raw, kind: 'bad-url', note: 'URL 解析失败' });
        continue;
      }
      const verdict = classify(url);
      hits.push({ file: rel(file), line: lineOf(src, m.index), url: raw, host: url.hostname, path: url.pathname, ...verdict });
    }
  }

  const allowed = hits.filter((h) => h.kind === 'allowed');
  const exempt = hits.filter((h) => h.kind === 'exempt');
  const bad = hits.filter((h) => h.kind === 'navigable' || h.kind === 'bad-url');

  out.push(
    result(`扫描 ${files.length} 个部署文件，共 ${hits.length} 个绝对地址`, bad.length === 0,
      hits.length
        ? hits.map((h) => {
          const tag = h.kind === 'allowed' ? 'OK     ' : h.kind === 'exempt' ? 'EXEMPT ' : 'BAD    ';
          return `${tag} ${h.file}:${h.line} [${h.kind}] ${h.url}${h.note ? ' — ' + h.note : ''}`;
        })
        : ['未发现任何绝对地址']),
  );

  out.push(
    result('所有可导航/可请求的绝对地址都在白名单内', bad.length === 0,
      bad.length ? bad.map((h) => `FAIL ${h.file}:${h.line} ${h.url}${h.note ? ' — ' + h.note : ''}`) : ['无违规可导航地址']),
  );

  out.push(
    result('命名空间地址按豁免处理（不当作违规）', true,
      exempt.length
        ? exempt.map((h) => `EXEMPT ${h.file}:${h.line} ${h.url} — ${h.note}`)
        : ['没有命名空间地址']),
  );

  const ghRoots = allowed.filter((h) => h.host === 'github.com' && h.note === '仓库根');
  out.push(result('页脚「源代码」仓库根链接保留', ghRoots.length > 0, ghRoots.map((h) => `${h.file}:${h.line} ${h.url}`).length ? ghRoots.map((h) => `${h.file}:${h.line} ${h.url}`) : ['未找到仓库根链接（隐私叙事需要它，不应删除）']));

  out.push(result('Pages 域名下地址均为 https', hits.filter((h) => h.host === PAGES_HOST).every((h) => h.url.startsWith('https://')), [
    `共 ${allowed.length} 个白名单地址`,
  ]));

  // docs/ 是内部文档，不部署；单独统计避免"全仓"误解。
  const docFiles = walk('docs').filter((f) => f.endsWith('.md'));
  const docUrls = docFiles.reduce((n, f) => n + (read(rel(f)).match(/\bhttps?:\/\//g) || []).length, 0);
  out.push(result('内部文档（docs/）不计入外链白名单', true, [`${docFiles.length} 个 md 文件共 ${docUrls} 个外链；按「可部署产物」口径排除，见报告口径说明`]));

  return out;
}

await runCli(import.meta.url, { id, title, run });
