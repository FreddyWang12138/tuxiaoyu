/** 主逻辑：入队 → 校验 → 编排压缩 → 渲染结果 → 下载。 */

import { formatBytes, savedText, extForMime, baseName, uniqueName } from './format.js';
import { MAX_FILES, classify, fileKey, supportsWebpOutput, concurrency } from './detect.js';
import { CompressPool, qualityFor } from './compress.js';
import { targetLabel } from './target.js';

const $ = (id) => document.getElementById(id);

const dom = {
  input: $('file-input'),
  drop: $('drop'),
  alert: $('alert'),
  options: $('options'),
  fmtGroup: $('fmt-group'),
  qGroup: $('q-group'),
  target: $('target'),
  fmtHint: $('fmt-hint'),
  results: $('results'),
  summary: $('summary'),
  list: $('list'),
  downloadAll: $('download-all'),
  cancel: $('cancel'),
  reset: $('reset'),
  live: $('live'),
};

const state = {
  items: [],
  seen: new Set(),
  names: new Set(),
  settings: { format: 'keep', quality: 'mid', target: 0 },
  webpOk: true,
  pool: null,
  processing: false,
  cancelled: false,
  seq: 0,
  announcedDone: -1,
};

init();

async function init() {
  state.webpOk = await supportsWebpOutput();
  if (!state.webpOk) {
    const webpRadio = dom.fmtGroup.querySelector('input[value="webp"]');
    if (webpRadio) {
      webpRadio.disabled = true;
      webpRadio.closest('.seg-item').title = '当前浏览器不支持导出 WebP';
    }
  }
  updateHint();

  dom.input.addEventListener('change', () => {
    if (dom.input.files && dom.input.files.length) addFiles(Array.from(dom.input.files));
    dom.input.value = '';
  });
  // 拖拽区本身可聚焦：Enter / Space 打开文件框（文件框藏在 label 里，视觉焦点由 .drop:focus-within 画）
  dom.drop.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      dom.input.click();
    }
  });
  dom.drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    dom.drop.classList.add('is-over');
  });
  dom.drop.addEventListener('dragleave', () => dom.drop.classList.remove('is-over'));
  dom.drop.addEventListener('drop', (event) => {
    event.preventDefault();
    dom.drop.classList.remove('is-over');
    const files = event.dataTransfer ? Array.from(event.dataTransfer.files || []) : [];
    if (files.length) addFiles(files);
  });
  dom.fmtGroup.addEventListener('change', onSettingsChange);
  dom.qGroup.addEventListener('change', onSettingsChange);
  dom.target.addEventListener('change', onSettingsChange);
  dom.downloadAll.addEventListener('click', downloadAll);
  dom.cancel.addEventListener('click', cancelRest);
  dom.reset.addEventListener('click', resetAll);
}

function updateHint() {
  if (!state.webpOk) {
    dom.fmtHint.textContent = '当前浏览器不能存成 WebP，可改用 JPG。';
    return;
  }
  const fmt = state.settings.format;
  if (state.settings.target) {
    dom.fmtHint.textContent += ` 已设 ${targetLabel(state.settings.target)} 目标：单张会多试压几次来逼近，速度会慢一点。`;
  }
  if (fmt === 'keep') {
    dom.fmtHint.textContent = '保持原格式：JPG 仍是 JPG，PNG 会转成 WebP 以保留透明并减小体积。';
  } else if (fmt === 'jpeg') {
    dom.fmtHint.textContent = '转 JPG：体积通常更小；透明背景会被铺成白色。';
  } else {
    dom.fmtHint.textContent = '转 WebP：体积更小，支持透明，新版浏览器都能打开。';
  }
}

/* ---------- 入队 ---------- */

function addFiles(files) {
  const room = MAX_FILES - state.items.length;
  const accepted = [];
  const skippedTypes = new Map();
  let skippedSize = 0;
  let skippedDup = 0;
  let skippedEmpty = 0;
  let overflow = 0;

  for (const file of files) {
    if (accepted.length >= room) {
      overflow += 1;
      continue;
    }
    const verdict = classify(file);
    if (!verdict.ok) {
      if (verdict.code === 'type') skippedTypes.set(verdict.label, (skippedTypes.get(verdict.label) || 0) + 1);
      else if (verdict.code === 'size') skippedSize += 1;
      else skippedEmpty += 1;
      continue;
    }
    const key = fileKey(file);
    if (state.seen.has(key)) {
      skippedDup += 1;
      continue;
    }
    state.seen.add(key);
    accepted.push(makeItem(file));
  }

  if (accepted.length) {
    state.items.push(...accepted);
    dom.options.hidden = false;
    dom.results.hidden = false;
    render();
    startProcessing();
  }

  const notes = [];
  if (skippedTypes.size) {
    const label = Array.from(skippedTypes.keys()).join('、');
    notes.push(`已跳过 ${Array.from(skippedTypes.values()).reduce((a, b) => a + b, 0)} 个不支持的文件（${label}），支持 ${'JPG / PNG / WebP'}`);
  }
  if (skippedSize) notes.push(`已跳过 ${skippedSize} 张超过 80MB 的图`);
  if (skippedEmpty) notes.push(`已跳过 ${skippedEmpty} 个空文件`);
  if (skippedDup) notes.push(`已忽略 ${skippedDup} 张重复添加的图`);
  if (overflow) notes.push(`一次最多处理 60 张，另有 ${overflow} 张未加入`);
  setAlert(notes.join('；'));
}

function makeItem(file) {
  return {
    id: (state.seq += 1),
    file,
    status: 'pending',
    thumb: URL.createObjectURL(file),
    out: null,
    error: null,
  };
}

function setAlert(text) {
  if (!text) {
    dom.alert.hidden = true;
    dom.alert.textContent = '';
    return;
  }
  dom.alert.textContent = text;
  dom.alert.hidden = false;
}

/* ---------- 处理 ---------- */

async function startProcessing() {
  if (state.processing) return;
  const queue = state.items.filter((item) => item.status === 'pending');
  if (!queue.length) return;

  state.processing = true;
  state.cancelled = false;
  dom.cancel.hidden = false;
  dom.downloadAll.disabled = true;
  render();

  const pool = new CompressPool(concurrency());
  state.pool = pool;
  let cursor = 0;

  // 只在线程真的空出来时才把下一张标成「处理中」，这样「取消剩余」才有东西可取消。
  const runner = async () => {
    while (!state.cancelled) {
      const item = queue[cursor];
      cursor += 1;
      if (!item) return;
      await processOne(item, pool);
    }
  };

  try {
    const lanes = Math.min(concurrency(), queue.length);
    await Promise.all(Array.from({ length: lanes }, () => runner()));
  } finally {
    pool.destroy();
    state.pool = null;
    state.processing = false;
    dom.cancel.hidden = true;
    dom.downloadAll.disabled = !state.items.some((i) => i.status === 'done');
    render();
    announce(true);
    // 本批处理期间可能又追加了文件（本轮 queue 是快照），收尾时再扫一次 pending。
    if (!state.cancelled && state.items.some((item) => item.status === 'pending')) startProcessing();
  }
}

async function processOne(item, pool) {
  if (state.cancelled) {
    item.status = 'cancelled';
    render();
    return;
  }
  const target = resolveTarget(item);
  if (!target) {
    item.status = 'skipped';
    item.error = '当前浏览器不能转成 WebP，可改用 JPG';
    render();
    return;
  }
  item.status = 'working';
  render();
  try {
    const quality = qualityFor(target.type, state.settings.quality);
    const result = await pool.run(item.file, target.type, quality, state.settings.target);
    if (item.discard) {
      item.status = 'cancelled';
      item.out = null;
      render();
      return;
    }
    applyResult(item, result);
  } catch (error) {
    const code = error && error.message;
    item.status = code === 'cancelled' ? 'cancelled' : 'failed';
    item.error = code === 'cancelled' ? null : humanError(code);
  }
  render();
  announce(false);
}

function resolveTarget(item) {
  const fmt = state.settings.format;
  if (fmt === 'jpeg') return { type: 'image/jpeg' };
  if (fmt === 'webp') return state.webpOk ? { type: 'image/webp' } : null;
  switch (item.file.type) {
    case 'image/jpeg': return { type: 'image/jpeg' };
    case 'image/webp': return { type: 'image/webp' };
    case 'image/png': return { type: state.webpOk ? 'image/webp' : 'image/png' };
    default: return null;
  }
}

function applyResult(item, result) {
  // 用户明确选了「转 JPG / 转 WebP」时，格式优先：变大也按他选的格式给，只是提示变大。
  const explicitFormat = state.settings.format !== 'keep';
  const target = state.settings.target;
  const grew = result.blob.size >= item.file.size * 0.98;
  // 原图本来就比目标小，就不用再压一遍白扣画质了。
  const alreadyFits = target > 0 && item.file.size <= target;
  const keepOriginal = alreadyFits || (grew && !explicitFormat);
  const blob = keepOriginal ? item.file : result.blob;
  const type = keepOriginal ? item.file.type : result.blob.type || result.type;
  const ext = extForMime(type);
  const name = keepOriginal
    ? keepOriginalName(item.file.name)
    : uniqueName(baseName(item.file.name), ext, state.names);
  item.out = {
    blob,
    type,
    width: result.width,
    height: result.height,
    usedOriginal: keepOriginal,
    grewWhileConverting: grew && explicitFormat,
    hasAlpha: Boolean(result.hasAlpha),
    targetBytes: target,
    reachedTarget: target > 0 ? (keepOriginal ? true : Boolean(result.reached)) : false,
    name,
  };
  item.status = 'done';
}

function keepOriginalName(name) {
  const clean = String(name || 'image');
  if (state.names.has(clean.toLowerCase())) {
    const ext = extForMime('image/jpeg');
    return uniqueName(baseName(clean), clean.split('.').pop() || ext, state.names);
  }
  state.names.add(clean.toLowerCase());
  return clean;
}

function humanError(code) {
  const map = {
    'pixel-limit': '像素太大，超出处理上限，已跳过',
    'encode-unsupported': '这个浏览器存不了该格式，试试转 JPG',
    'encode-failed': '编码失败，换一张图试试',
    'worker-crashed': '处理进程异常退出，这张已跳过',
    'no-2d-context': '浏览器没能初始化画布，换个浏览器试试',
  };
  return map[code] || '这张图没处理成功，换一张试试';
}

function cancelRest() {
  state.cancelled = true;
  if (state.pool) state.pool.cancelQueued();
  for (const item of state.items) {
    if (item.status === 'pending') item.status = 'cancelled';
    // 已经在编码的那几张（最多 4 张）中断不了，但「取消」后结果不再计入
    if (item.status === 'working') item.discard = true;
  }
  render();
  setAlert('已取消未开始的任务，已经压好的图仍可下载。');
}

/* ---------- 渲染 ---------- */

function render() {
  const total = state.items.length;
  const done = state.items.filter((i) => i.status === 'done').length;
  const working = state.items.filter((i) => i.status === 'working').length;

  dom.list.replaceChildren();
  for (const item of state.items) dom.list.appendChild(renderRow(item));

  dom.results.hidden = total === 0;
  dom.options.hidden = total === 0;
  dom.summary.textContent = summaryText(total, done, working);
  dom.downloadAll.disabled = state.processing || done === 0;
  dom.downloadAll.hidden = done === 0;
}

function summaryText(total, done, working) {
  if (!total) return '';
  if (state.processing) {
    const finished = done + state.items.filter((i) => i.status === 'failed' || i.status === 'cancelled' || i.status === 'skipped').length;
    return `处理中 ${finished}/${total}${working ? ' · 正在压 ' + working + ' 张' : ''}`;
  }
  if (!done) return '这次没有生成文件，原因见下';
  let sumIn = 0;
  let sumOut = 0;
  for (const item of state.items) {
    if (item.status !== 'done') continue;
    sumIn += item.file.size;
    sumOut += item.out.blob.size;
  }
  const saved = savedText(sumIn, sumOut);
  const label = saved.kind === 'smaller' ? `省 ${saved.pct}%` : '没有变小';
  return `${done} 张 · ${formatBytes(sumIn)} → ${formatBytes(sumOut)}（${label}）`;
}

function renderRow(item) {
  const li = document.createElement('li');
  li.className = 'row';

  const thumb = document.createElement('img');
  thumb.className = 'thumb';
  thumb.src = item.thumb;
  thumb.alt = '';
  thumb.loading = 'lazy';
  thumb.width = 56;
  thumb.height = 56;

  const main = document.createElement('div');
  main.className = 'row-main';

  const name = document.createElement('p');
  name.className = 'row-name';
  name.textContent = item.file.name;
  name.title = item.file.name;

  const meta = document.createElement('p');
  meta.className = 'row-meta';
  meta.append(...metaParts(item));

  main.append(name, meta);

  const side = document.createElement('div');
  side.className = 'row-side';
  if (item.status === 'done' && item.out) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ghost small';
    btn.textContent = '下载这张';
    btn.addEventListener('click', () => downloadItem(item));
    side.appendChild(btn);
  } else if (item.status === 'failed') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn ghost small';
    retry.textContent = '重试';
    retry.addEventListener('click', () => retryItem(item));
    side.appendChild(retry);
  } else if (item.status === 'working') {
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    side.appendChild(spinner);
  }

  li.append(thumb, main, side);
  return li;
}

function metaParts(item) {
  const parts = [];
  const orig = document.createElement('span');
  orig.textContent = formatBytes(item.file.size);

  if (item.status === 'done' && item.out) {
    const arrow = document.createTextNode(' → ');
    const out = document.createElement('span');
    out.textContent = formatBytes(item.out.blob.size);
    const delta = document.createElement('span');
    if (item.out.usedOriginal) {
      delta.className = 'flat';
      delta.textContent = ' · 没变小，用原图';
    } else if (item.out.grewWhileConverting) {
      delta.className = 'flat';
      const pct = Math.round((item.out.blob.size / item.file.size - 1) * 100);
      delta.textContent = ` · 转格式后大了 ${pct}%`;
    } else {
      const saved = savedText(item.file.size, item.out.blob.size);
      delta.className = 'delta';
      delta.textContent = ` · ${saved.text}`;
    }
    parts.push(orig, arrow, out, delta);
    if (item.out.width && item.out.height) {
      const dims = document.createElement('span');
      dims.className = 'flat';
      dims.textContent = ` · ${item.out.width}×${item.out.height}`;
      parts.push(dims);
    }
    if (item.out.targetBytes) {
      const goal = document.createElement('span');
      goal.className = item.out.reachedTarget ? 'delta' : 'flat';
      goal.textContent = item.out.reachedTarget
        ? ` · 已达 ${targetLabel(item.out.targetBytes)}`
        : ` · 最接近 ${formatBytes(item.out.blob.size)}，没到 ${targetLabel(item.out.targetBytes)}`;
      parts.push(goal);
    }
    if (item.out.hasAlpha && item.out.type === 'image/jpeg') {
      const note = document.createElement('span');
      note.className = 'flat';
      note.textContent = ' · 已铺白底';
      parts.push(note);
    }
    return parts;
  }

  parts.push(orig);
  const status = document.createElement('span');
  if (item.status === 'working') status.textContent = ' · 处理中';
  else if (item.status === 'pending') status.textContent = ' · 等待处理';
  else if (item.status === 'cancelled') status.textContent = ' · 已取消';
  else if (item.status === 'skipped') {
    status.className = 'err';
    status.textContent = ` · ${item.error}`;
  } else if (item.status === 'failed') {
    status.className = 'err';
    status.textContent = ` · ${item.error}`;
  }
  parts.push(status);
  return parts;
}

function announce(final) {
  const total = state.items.length;
  const done = state.items.filter((i) => i.status === 'done').length;
  if (final) {
    dom.live.textContent = done === total
      ? `全部完成，共 ${done} 张`
      : `处理结束，${done} 张成功，${total - done} 张未生成文件`;
    return;
  }
  if (done !== state.announcedDone) {
    state.announcedDone = done;
    dom.live.textContent = `已完成 ${done}/${total}`;
  }
}

/* ---------- 下载 ---------- */

function downloadItem(item) {
  if (!item.out) return;
  triggerDownload(item.out.blob, item.out.name);
}

async function downloadAll() {
  const ready = state.items.filter((i) => i.status === 'done' && i.out);
  if (!ready.length) return;
  setAlert('浏览器可能会问是否允许下载多个文件，点「允许」即可。');
  for (const item of ready) {
    triggerDownload(item.out.blob, item.out.name);
    await wait(300);
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------- 设置 ---------- */

function onSettingsChange() {
  const fmt = dom.fmtGroup.querySelector('input[name="fmt"]:checked');
  const quality = dom.qGroup.querySelector('input[name="q"]:checked');
  state.settings.format = fmt ? fmt.value : 'keep';
  state.settings.quality = quality ? quality.value : 'mid';
  state.settings.target = Number(dom.target.value) || 0;
  updateHint();
  if (state.processing) return;
  const finished = state.items.filter((i) => i.status === 'done');
  if (!finished.length) return;
  reprocess(finished);
}

function reprocess(items) {
  for (const item of items) {
    item.status = 'pending';
    item.out = null;
    item.error = null;
    item.discard = false;
  }
  state.names.clear();
  render();
  startProcessing();
}

function retryItem(item) {
  item.status = 'pending';
  item.out = null;
  item.error = null;
  item.discard = false;
  render();
  startProcessing();
}

function resetAll() {
  if (state.pool) state.pool.destroy();
  for (const item of state.items) URL.revokeObjectURL(item.thumb);
  state.items = [];
  state.seen.clear();
  state.names.clear();
  state.announcedDone = -1;
  state.cancelled = false;
  setAlert('');
  render();
}
