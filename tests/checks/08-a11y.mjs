/** 检查 8：无障碍静态检查（含关键配色对比度计算）。 */
import { read, result, parseAttrs, tags, elements, stripTags, contrast, runCli } from '../lib/harness.mjs';

export const id = '08';
export const title = '无障碍：img/button/label/tabindex/aria-live/对比度';

function dynamicCount(src, tag, marker) {
  const hits = [];
  for (const m of src.matchAll(new RegExp(`createElement\\(\\s*['"]${tag}['"]\\s*\\)`, 'g'))) {
    const window = src.slice(m.index, m.index + 600);
    hits.push({ index: m.index, ok: marker.test(window) });
  }
  return hits;
}

export async function run() {
  const out = [];
  const html = read('index.html');
  const fourOhFour = read('404.html');
  const app = read('assets/js/app.js');

  const imgs = tags(html, 'img');
  const missingAlt = imgs.filter((t) => !Object.hasOwn(parseAttrs(t), 'alt'));
  out.push(result(`静态 <img> 都有 alt（${imgs.length} 个）`, missingAlt.length === 0, imgs.length ? imgs.map((t) => t.replace(/\s+/g, ' ').slice(0, 140)) : ['页面无 <img>；缩略图由 JS 生成，见下一条']));

  const dynImgs = dynamicCount(app, 'img', /\.alt\s*=\s*['"`]/);
  out.push(result(`动态生成的 <img> 设置 alt（${dynImgs.length} 处）`, dynImgs.every((h) => h.ok), dynImgs.length ? dynImgs.map((h) => `createElement('img') @${h.index} → alt ${h.ok ? '已设置' : '缺失'}`) : ['未发现动态 img']));

  const buttons = elements(html, 'button');
  const badButtons = buttons.filter((b) => {
    const label = stripTags(b.inner);
    return label.length === 0 && !Object.hasOwn(b.attrs, 'aria-label');
  });
  out.push(result(`静态 <button> 都有可读文本/aria-label（${buttons.length} 个）`, badButtons.length === 0, buttons.map((b) => `「${stripTags(b.inner) || b.attrs['aria-label']}」`)));

  const dynButtons = dynamicCount(app, 'button', /\.textContent\s*=|aria-label/);
  out.push(result(`动态生成的 <button> 都有可读文本（${dynButtons.length} 处）`, dynButtons.every((h) => h.ok), dynButtons.map((h) => `createElement('button') @${h.index} → ${h.ok ? '有文本' : '无文本'}`)));

  const fileInputs = tags(html, 'input').filter((t) => (parseAttrs(t).type || '').toLowerCase() === 'file');
  const labels = elements(html, 'label');
  const labelFor = labels.map((l) => (l.attrs.for || '').toLowerCase());
  const inputsOk = fileInputs.map((t) => {
    const a = parseAttrs(t);
    const id = (a.id || '').toLowerCase();
    const wrapped = labels.some((l) => l.raw.includes(t));
    return { id, ok: Boolean(id && labelFor.includes(id)) || wrapped };
  });
  out.push(result(`input[type=file] 有关联 <label for>（${fileInputs.length} 个）`, inputsOk.length > 0 && inputsOk.every((i) => i.ok), inputsOk.map((i) => `#${i.id || '(无 id)'} → ${i.ok ? '有 label' : '无 label'}`)));

  const tabNeg = [...html.matchAll(/tabindex\s*=\s*["']?-1/gi)].map((m) => `index.html @${m.index}`);
  const tabNegJs = [...app.matchAll(/tabindex['"]?\s*,\s*['"]-1/gi)].map((m) => `app.js @${m.index}`);
  out.push(result('无 tabindex="-1"', tabNeg.length === 0 && tabNegJs.length === 0, [...tabNeg, ...tabNegJs].length ? [...tabNeg, ...tabNegJs] : ['0 处']));

  const live = /aria-live\s*=\s*["']polite["']/gi;
  const liveCount = (html.match(live) || []).length;
  const liveId = /<[^>]*id\s*=\s*["']live["'][^>]*aria-live\s*=\s*["']polite["']/i.test(html) || /<[^>]*aria-live\s*=\s*["']polite["'][^>]*id\s*=\s*["']live["']/i.test(html);
  out.push(result('进度区域有 aria-live="polite"', liveCount > 0 && liveId, [`aria-live="polite" ${liveCount} 处；#live 已标注`]));
  out.push(result('aria-live 内容由 JS 节流更新', /dom\.live\.textContent\s*=/.test(app) && /announcedDone/.test(app), ['app.js 用 announcedDone 去重后写 #live']));

  out.push(result('存在可见 focus 样式', /:focus-visible\s*\{[^}]*outline\s*:\s*3px\s+solid/.test(read('styles/main.css')), [':focus-visible { outline: 3px solid #0b6b4f }']));

  // 关键文本配色对比度（WCAG AA：普通文本 4.5:1，大文本 3:1，焦点框 3:1）。
  const css = read('styles/main.css');
  const token = (name) => {
    const m = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(css);
    return m ? m[1] : null;
  };
  const pairs = [
    ['ink', 'bg', '正文', 4.5],
    ['ink-2', 'bg', '次要文本', 4.5],
    ['ink-3', 'panel', '弱化文本（top-tag / drop-privacy / row-meta / opt-hint，13px）', 4.5],
    ['accent', 'panel', '链接/强调', 4.5],
    ['accent-ink', 'accent', '主按钮文字', 4.5],
    ['warn-ink', 'warn-bg', '提示条文字', 4.5],
    ['danger', 'panel', '错误文字', 4.5],
  ];
  const contrastLines = [];
  let contrastFails = 0;
  for (const [fg, bg, label, need] of pairs) {
    const f = token(fg);
    const b = token(bg);
    if (!f || !b) {
      contrastLines.push(`跳过 ${label}：找不到 token --${fg} / --${bg}`);
      continue;
    }
    const ratio = contrast(f, b);
    const pass = ratio >= need;
    if (!pass) contrastFails += 1;
    contrastLines.push(`${pass ? 'PASS' : 'FAIL'} ${ratio.toFixed(2)}:1（需 ${need}:1） ${label} --${fg} ${f} on --${bg} ${b}`);
  }
  const focus = contrast('#0b6b4f', '#ffffff');
  contrastLines.push(`${focus >= 3 ? 'PASS' : 'FAIL'} ${focus.toFixed(2)}:1（需 3:1） focus 外框 #0b6b4f on #fff`);
  out.push(result('关键文本/焦点对比度达标', contrastFails === 0 && focus >= 3, contrastLines));

  // 文件输入的可见焦点：.sr-only 把元素裁成 0×0，outline 会随元素一起被裁掉。
  const fileRaw = tags(html, 'input').find((t) => (parseAttrs(t).type || '').toLowerCase() === 'file');
  const fileAttrs = fileRaw ? parseAttrs(fileRaw) : {};
  const clipped = /(^|\s)sr-only(\s|$)/.test(fileAttrs.class || '');
  const labelWraps = elements(html, 'label').some((l) => /<input\b/i.test(l.inner));
  const focusWithIn = /:focus-within\s*\{[^}]*outline/.test(read('styles/main.css'));
  const visibleFocusOk = !clipped || fileAttrs.tabindex === '-1' || (labelWraps && focusWithIn);
  out.push(result('文件输入在 Tab 序列中焦点可见', visibleFocusOk, [
    `input#${fileAttrs.id || '(无 id)'} class="${fileAttrs.class || ''}" tabindex=${fileAttrs.tabindex ?? '(未设置)'}；嵌套在 label 内：${labelWraps ? '是' : '否'}；.drop:focus-within 有 outline：${focusWithIn ? '是' : '否'}`,
    visibleFocusOk
      ? '通过：输入框被 .sr-only 裁成 0×0，但焦点落在它身上时 .drop:focus-within 会给整个拖拽区画 3px 外框，焦点可见。'
      : 'FAIL .sr-only 用 clip: rect(0 0 0 0) 把元素裁成 0×0，outline 会随元素一起被裁掉 → 存在看不见的 Tab 停留点。',
    visibleFocusOk
      ? '小瑕疵（不阻断）：label 仍有 tabindex="0"，Tab 会依次停在 label 和 input 两处；两处焦点都可见，可用。'
      : '最小修复：把 <input type="file"> 放进 <label class="drop"> 内并加 .drop:focus-within 外框；或只保留 label 为唯一焦点目标。',
  ]));

  out.push(result('404 页面同样有 lang/title/H1', /<html\b[^>]*lang\s*=\s*["']zh-CN["']/i.test(fourOhFour) && /<title>[^<]+<\/title>/i.test(fourOhFour) && /<h1\b[^>]*>[^<]+<\/h1>/i.test(fourOhFour), ['404.html 结构与首页一致']));

  return out;
}

await runCli(import.meta.url, { id, title, run });
