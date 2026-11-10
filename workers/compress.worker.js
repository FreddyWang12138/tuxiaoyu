/** 图片压缩 worker：解码 → 绘制 → 编码，全程在本地，不发起任何网络请求。 */

import { MAX_PIXELS } from '../assets/js/detect.js';

self.onmessage = async (event) => {
  const { id, file, type, quality } = event.data || {};
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const width = bitmap.width;
      const height = bitmap.height;
      if (width * height > MAX_PIXELS) throw new Error('pixel-limit');

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no-2d-context');

      const hasAlpha = type === 'image/jpeg' ? false : detectAlpha(bitmap);
      if (type === 'image/jpeg') {
        // JPG 没有透明通道，先铺白底，避免透明区域变黑。
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(bitmap, 0, 0);

      const blob = await canvas.convertToBlob({ type, quality });
      if (!blob) throw new Error('encode-failed');
      if (type !== 'image/png' && blob.type !== type) throw new Error('encode-unsupported');

      self.postMessage({ id, ok: true, blob, width, height, hasAlpha, type: blob.type });
    } finally {
      if (typeof bitmap.close === 'function') bitmap.close();
    }
  } catch (error) {
    const message = error && error.message ? error.message : 'unknown';
    self.postMessage({ id, ok: false, error: message });
  }
};

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
