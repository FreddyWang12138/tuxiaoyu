/**
 * 行为单元测试（node:test + node:assert）。
 * 直接 import 站点里的纯函数模块，验证真实实现而不是复制一份逻辑。
 * 注意：仓库没有 package.json / type:module，依赖 Node 的 ESM 语法探测（Node ≥ 22.7）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const format = await import('../assets/js/format.js');
const detect = await import('../assets/js/detect.js');
const compress = await import('../assets/js/compress.js');

test('formatBytes：B / KB / MB 边界与非法输入', () => {
  assert.equal(format.formatBytes(0), '0 B');
  assert.equal(format.formatBytes(1023), '1023 B');
  assert.equal(format.formatBytes(1024), '1.0 KB');
  assert.equal(format.formatBytes(1536), '1.5 KB');
  assert.equal(format.formatBytes(10240), '10 KB');
  assert.equal(format.formatBytes(1048576), '1.0 MB');
  assert.equal(format.formatBytes(10485760), '10 MB');
  assert.equal(format.formatBytes(-1), '—');
  assert.equal(format.formatBytes(NaN), '—');
});

test('savedText：省 2% 以上才算 smaller，变小为负归零', () => {
  assert.deepEqual(format.savedText(1000, 700), { kind: 'smaller', pct: 30, text: '小了 30%' });
  assert.deepEqual(format.savedText(1000, 745), { kind: 'smaller', pct: 26, text: '小了 26%' });
  assert.equal(format.savedText(1000, 990).kind, 'flat');
  assert.equal(format.savedText(1000, 990).text, '没变小，用原图');
  assert.deepEqual(format.savedText(1000, 1500), { kind: 'flat', pct: 0, text: '没变小，用原图' });
  assert.equal(format.savedText(0, 10).text, '—');
});

test('uniqueName：同批次重名递增，且大小写不敏感', () => {
  const used = new Set();
  assert.equal(format.uniqueName('photo', 'jpg', used), 'photo-压缩后.jpg');
  assert.equal(format.uniqueName('photo', 'jpg', used), 'photo-压缩后-2.jpg');
  // 调用方（app.js）约定 used 里存小写文件名，这里按同一约定构造。
  const used2 = new Set(['a-压缩后.jpg']);
  assert.equal(format.uniqueName('a', 'jpg', used2), 'a-压缩后-2.jpg');
});

test('extForMime / baseName：后缀映射与非法字符清理', () => {
  assert.equal(format.extForMime('image/jpeg'), 'jpg');
  assert.equal(format.extForMime('image/png'), 'png');
  assert.equal(format.extForMime('image/webp'), 'webp');
  assert.equal(format.extForMime('image/gif'), 'img');
  assert.equal(format.baseName('a/b:c.jpg'), 'a_b_c');
  assert.equal(format.baseName('x'.repeat(120) + '.jpg').length, 80);
  assert.equal(format.baseName(''), 'image');
});

test('detect：首版常量是 80MB / 60 张 / 120MP / 仅 JPG+PNG+WebP', () => {
  assert.deepEqual(detect.SUPPORTED_TYPES, ['image/jpeg', 'image/png', 'image/webp']);
  assert.equal(detect.MAX_FILES, 60);
  assert.equal(detect.MAX_BYTES, 80 * 1024 * 1024);
  assert.equal(detect.MAX_PIXELS, 120_000_000);
});

test('classify：空文件 / 超大小 / 不支持格式 / 正常', () => {
  assert.deepEqual(detect.classify({ name: 'a.jpg', type: 'image/jpeg', size: 1024 }), { ok: true, large: false });
  assert.deepEqual(detect.classify({ name: 'a.jpg', type: 'image/jpeg', size: 0 }), { ok: false, code: 'empty' });
  assert.deepEqual(detect.classify({ name: 'a.gif', type: 'image/gif', size: 1024 }), { ok: false, code: 'type', label: 'GIF' });
  assert.deepEqual(detect.classify({ name: 'a.jpg', type: 'image/jpeg', size: detect.MAX_BYTES + 1 }), { ok: false, code: 'size' });
  assert.equal(detect.classify({ name: 'big.jpg', type: 'image/jpeg', size: detect.LARGE_BYTES }).large, true);
});

test('fileKey：同文件稳定，不同文件可区分（P0-1 去重依据）', () => {
  const a = { name: 'a.jpg', size: 10, lastModified: 100 };
  const b = { name: 'a.jpg', size: 10, lastModified: 101 };
  assert.equal(detect.fileKey(a), detect.fileKey({ ...a }));
  assert.notEqual(detect.fileKey(a), detect.fileKey(b));
});

test('qualityFor：三档严格单调递增（P0-4 的数值前提）', () => {
  for (const type of ['image/jpeg', 'image/webp']) {
    const low = compress.qualityFor(type, 'low');
    const mid = compress.qualityFor(type, 'mid');
    const high = compress.qualityFor(type, 'high');
    assert.ok(low < mid && mid < high, `${type}: ${low}/${mid}/${high} 不是单调递增`);
    assert.ok(low > 0 && high <= 1, `${type} 质量值应在 (0,1]`);
  }
  assert.equal(compress.qualityFor('image/png', 'low'), 1);
  assert.equal(compress.qualityFor('image/png', 'high'), 1);
  assert.equal(compress.qualityFor('image/gif', 'mid'), 0.75, '未知格式回落到 JPG 中档');
});
