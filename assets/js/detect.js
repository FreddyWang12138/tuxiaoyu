/** 能力与文件校验。本文件在 worker 里也能 import，所以顶层不许碰 DOM。 */

export const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const SUPPORTED_LABEL = 'JPG / PNG / WebP';
export const MAX_FILES = 60;
export const MAX_BYTES = 80 * 1024 * 1024;
export const LARGE_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 120_000_000;

const SUPPORTED = new Set(SUPPORTED_TYPES);
const EXT_LABEL = { 'image/heic': 'HEIC', 'image/avif': 'AVIF', 'image/gif': 'GIF', 'image/svg+xml': 'SVG', 'image/tiff': 'TIFF', 'image/bmp': 'BMP' };

export function isSupported(file) {
  return SUPPORTED.has(file.type);
}

export function typeLabel(file) {
  if (file.type && EXT_LABEL[file.type]) return EXT_LABEL[file.type];
  const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
  return m ? m[1].toUpperCase() : '未知格式';
}

/**
 * @returns {{ok:true, large:boolean} | {ok:false, code:'type'|'size'|'empty', label?:string}}
 */
export function classify(file) {
  if (!file || file.size === 0) return { ok: false, code: 'empty' };
  if (!isSupported(file)) return { ok: false, code: 'type', label: typeLabel(file) };
  if (file.size > MAX_BYTES) return { ok: false, code: 'size' };
  return { ok: true, large: file.size >= LARGE_BYTES };
}

export function fileKey(file) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

let webpCache = null;

/** WebP 输出能力检测：有些浏览器 toBlob 会静默回落到 PNG。 */
export async function supportsWebpOutput() {
  if (webpCache !== null) return webpCache;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8));
    webpCache = Boolean(blob && blob.type === 'image/webp');
  } catch {
    webpCache = false;
  }
  return webpCache;
}

/** 并发数：留一个核给主线程，最多 4。 */
export function concurrency() {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(4, cores - 1));
}
