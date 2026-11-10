/** 图片压缩 worker：解码 → 绘制 → 编码，全程在本地，不发起任何网络请求。 */

import { MAX_PIXELS } from '../assets/js/detect.js';
import { pickBest, nextQuality } from '../assets/js/target.js';

const MIN_QUALITY = 0.35;
const MAX_QUALITY = 0.92;

self.onmessage = async (event) => {
  const { id, file, type, quality, target } = event.data || {};
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const width = bitmap.width;
      const height = bitmap.height;
      if (width * height > MAX_PIXELS) throw new Error('pixel-limit');

      const hasAlpha = type === 'image/jpeg' ? false : detectAlpha(bitmap);
      const canvas = drawToCanvas(bitmap, type, width, height);
      const limit = Number(target) || 0;

      // 没设目标体积：一次编码，走最快路径。
      if (!limit || type === 'image/png') {
        const blob = await canvas.convertToBlob({ type, quality });
        assertEncoded(blob, type);
        self.postMessage({ id, ok: true, blob, width, height, hasAlpha, type: blob.type, target: limit, reached: limit ? blob.size <= limit : true });
        return;
      }

      // 设了目标体积：二分试压，最多 6 次编码。
      const attempts = [];
      let lo = MIN_QUALITY;
      let hi = MAX_QUALITY;
      for (;;) {
        const q = attempts.length === 0 ? hi : nextQuality(lo, hi, attempts.length);
        if (q === null) break;
        const blob = await canvas.convertToBlob({ type, quality: q });
        assertEncoded(blob, type);
        attempts.push({ blob, quality: q, size: blob.size, width, height });
        if (blob.size <= limit) lo = q;
        else hi = q;
      }

      let best = pickBest(attempts, limit);
      if (!best) throw new Error('encode-failed');

      // 还是达不到：降一次尺寸再试，通常比一直压质量更体面。
      if (best.size > limit) {
        const scale = Math.max(0.3, Math.min(0.95, Math.sqrt(limit / best.size) * 0.95));
        if (scale < 0.98) {
          const scaledWidth = Math.max(1, Math.round(width * scale));
          const scaledHeight = Math.max(1, Math.round(height * scale));
          const scaled = drawToCanvas(bitmap, type, scaledWidth, scaledHeight);
          const blob = await scaled.convertToBlob({ type, quality: 0.8 });
          assertEncoded(blob, type);
          if (blob.size < best.size) {
            best = { blob, quality: 0.8, size: blob.size, width: scaledWidth, height: scaledHeight };
          }
        }
      }

      self.postMessage({
        id,
        ok: true,
        blob: best.blob,
        width: best.width,
        height: best.height,
        hasAlpha,
        type: best.blob.type,
        target: limit,
        reached: best.size <= limit,
        quality: best.quality,
      });
    } finally {
      if (typeof bitmap.close === 'function') bitmap.close();
    }
  } catch (error) {
    const message = error && error.message ? error.message : 'unknown';
    self.postMessage({ id, ok: false, error: message });
  }
};

function drawToCanvas(bitmap, type, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no-2d-context');
  if (type === 'image/jpeg') {
    // JPG 没有透明通道，先铺白底，避免透明区域变黑。
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function assertEncoded(blob, type) {
  if (!blob) throw new Error('encode-failed');
  if (type !== 'image/png' && blob.type !== type) throw new Error('encode-unsupported');
}

/** 采样 64×64，判断源图是否真的带半透明像素。 */
function detectAlpha(bitmap) {
  const size = 64;
  const probe = new OffscreenCanvas(size, size);
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(bitmap, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}
