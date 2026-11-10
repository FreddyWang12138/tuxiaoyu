/** 压缩池：Web Worker 并行，主线程只做编排；Worker 不可用时回落主线程。 */

import { MAX_PIXELS } from './detect.js';

const QUALITY = {
  'image/jpeg': { low: 0.55, mid: 0.75, high: 0.9 },
  'image/webp': { low: 0.6, mid: 0.8, high: 0.92 },
  'image/png': { low: 1, mid: 1, high: 1 },
};

export function qualityFor(type, level) {
  const table = QUALITY[type] || QUALITY['image/jpeg'];
  return table[level] === undefined ? table.mid : table[level];
}

const WORKER_URL = new URL('../../workers/compress.worker.js', import.meta.url);

export class CompressPool {
  /** @param {number} limit 同时进行的任务数 */
  constructor(limit = 2) {
    this.limit = Math.max(1, limit);
    this.workers = [];
    this.idle = [];
    this.waiting = [];
    this.jobs = new Map();
    this.busy = new Map();
    this.seq = 0;
    this.closed = false;
    this.cancelled = false;
    this.workerBroken = false;
  }

  /**
   * @param {File} file
   * @param {string} type 目标 mime
   * @param {number} quality
   * @returns {Promise<{blob:Blob,width:number,height:number,hasAlpha:boolean,type:string}>}
   */
  run(file, type, quality, target = 0) {
    if (this.closed) return Promise.reject(new Error('closed'));
    if (this.cancelled) return Promise.reject(new Error('cancelled'));
    if (this.workerBroken) return compressOnMainThread(file, type, quality);
    return new Promise((resolve, reject) => {
      const id = (this.seq += 1);
      this.jobs.set(id, { resolve, reject });
      this.waiting.push({ id, file, type, quality, target });
      this.pump();
    });
  }

  /** 取消所有还没送进 worker 的任务；已经在编码的那几张中断不了。 */
  cancelQueued() {
    this.cancelled = true;
    const queued = this.waiting.splice(0, this.waiting.length);
    for (const job of queued) {
      const rec = this.jobs.get(job.id);
      this.jobs.delete(job.id);
      if (rec) rec.reject(new Error('cancelled'));
    }
  }

  pump() {
    while (this.waiting.length > 0) {
      let worker = this.idle.pop();
      if (!worker) {
        if (this.workers.length < this.limit) {
          try {
            worker = this.spawn();
          } catch {
            this.workerBroken = true;
            break;
          }
        } else {
          break;
        }
      }
      const job = this.waiting.shift();
      if (!job) break;
      this.busy.set(worker, job.id);
      worker.postMessage({ id: job.id, file: job.file, type: job.type, quality: job.quality, target: job.target });
    }
    // Worker 建不起来：剩余任务退回主线程，别让它们永远挂着。
    if (this.workerBroken && this.waiting.length > 0) {
      const flushed = this.waiting.splice(0, this.waiting.length);
      for (const job of flushed) {
        const rec = this.jobs.get(job.id);
        this.jobs.delete(job.id);
        compressOnMainThread(job.file, job.type, job.quality).then(rec.resolve, rec.reject);
      }
    }
  }

  spawn() {
    const worker = new Worker(WORKER_URL, { type: 'module' });
    worker.onmessage = (event) => this.onMessage(worker, event.data);
    worker.onerror = (event) => this.onCrash(worker, event);
    worker.onmessageerror = () => this.onCrash(worker, null);
    this.workers.push(worker);
    return worker;
  }

  onMessage(worker, data) {
    const id = data && data.id;
    const rec = this.jobs.get(id);
    this.busy.delete(worker);
    this.idle.push(worker);
    if (rec) {
      this.jobs.delete(id);
      if (data.ok) rec.resolve(data);
      else rec.reject(new Error(data.error || 'encode-failed'));
    }
    this.pump();
  }

  onCrash(worker, event) {
    const id = this.busy.get(worker);
    this.busy.delete(worker);
    this.workers = this.workers.filter((w) => w !== worker);
    try { worker.terminate(); } catch { /* 已经死了 */ }
    if (id !== undefined) {
      const rec = this.jobs.get(id);
      this.jobs.delete(id);
      if (rec) rec.reject(new Error('worker-crashed'));
    }
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    this.pump();
  }

  destroy() {
    this.closed = true;
    for (const worker of this.workers) {
      try { worker.terminate(); } catch { /* noop */ }
    }
    this.workers = [];
    this.idle = [];
    this.waiting = [];
    for (const rec of this.jobs.values()) rec.reject(new Error('closed'));
    this.jobs.clear();
    this.busy.clear();
  }
}

/** 无 Worker 时的兜底路径：逻辑与 compress.worker.js 保持一致。 */
export async function compressOnMainThread(file, type, quality) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) throw new Error('pixel-limit');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no-2d-context');
    const hasAlpha = type === 'image/jpeg' ? false : hasAlphaChannel(bitmap);
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) throw new Error('encode-failed');
    if (type !== 'image/png' && blob.type !== type) throw new Error('encode-unsupported');
    return { blob, width: canvas.width, height: canvas.height, hasAlpha, type: blob.type };
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}

function hasAlphaChannel(source) {
  const size = 64;
  const probe = document.createElement('canvas');
  probe.width = size;
  probe.height = size;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(source, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}
