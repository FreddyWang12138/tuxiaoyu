/** 目标体积：预设、选择策略、文案。纯函数，worker 与主线程共用。 */

export const TARGET_PRESETS = [
  { value: 0, label: '不限大小' },
  { value: 200 * 1024, label: '200 KB 以内' },
  { value: 500 * 1024, label: '500 KB 以内' },
  { value: 1024 * 1024, label: '1 MB 以内' },
  { value: 2 * 1024 * 1024, label: '2 MB 以内' },
];

export function isPresetTarget(value) {
  return TARGET_PRESETS.some((preset) => preset.value === Number(value));
}

export function targetLabel(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return '不限大小';
  const kb = value / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb % 1 === 0 ? mb : mb.toFixed(1)} MB`;
}

/**
 * 从多次编码尝试里选最终结果：
 * - 有达到目标的，取其中体积最大的（同等约束下质量最好）；
 * - 一个都没达到，取体积最小的（已经尽力了）。
 * @param {{size:number}[]} attempts
 * @param {number} target 目标字节数，0 表示不限制
 */
export function pickBest(attempts, target) {
  if (!Array.isArray(attempts) || attempts.length === 0) return null;
  const limit = Number(target) || 0;
  if (!limit) return attempts[0];
  const under = attempts.filter((attempt) => attempt.size <= limit);
  if (under.length > 0) {
    return under.reduce((best, attempt) => (attempt.size > best.size ? attempt : best));
  }
  return attempts.reduce((best, attempt) => (attempt.size < best.size ? attempt : best));
}

/** 二分试压的下一档质量；返回 null 表示已收敛，该停了。 */
export function nextQuality(lo, hi, attemptCount, maxAttempts = 6) {
  if (attemptCount >= maxAttempts) return null;
  if (hi - lo < 0.02) return null;
  return (lo + hi) / 2;
}
