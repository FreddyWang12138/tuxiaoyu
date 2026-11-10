/** 体积与文件名的纯函数工具，无 DOM 依赖。 */

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * 输出体积相对原图的描述。变大一律归到 'flat'，由调用方决定"用原图"。
 * @returns {{kind:'smaller'|'flat', pct:number, text:string}}
 */
export function savedText(inputSize, outputSize) {
  if (!inputSize || !outputSize) return { kind: 'flat', pct: 0, text: '—' };
  const pct = Math.round((1 - outputSize / inputSize) * 100);
  if (pct >= 2) return { kind: 'smaller', pct, text: `小了 ${pct}%` };
  return { kind: 'flat', pct: Math.max(pct, 0), text: '没变小，用原图' };
}

export function extForMime(mime) {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'img';
}

export function baseName(name) {
  const clean = String(name || 'image').replace(/[\\/:*?"<>|]/g, '_');
  const dot = clean.lastIndexOf('.');
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  return base.slice(0, 80) || 'image';
}

/** 同批次重名时递增 -2、-3，避免落盘互相覆盖。 */
export function uniqueName(base, ext, used) {
  let name = `${base}-压缩后.${ext}`;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    name = `${base}-压缩后-${n}.${ext}`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}
