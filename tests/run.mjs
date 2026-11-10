#!/usr/bin/env node
/**
 * 图小鱼 QA 总入口：node tests/run.mjs
 * 逐组跑静态检查 + node:test 单元测试；任何一条失败 → 退出码 1。
 */
import { spawnSync } from 'node:child_process';
import { ROOT, printSuite } from './lib/harness.mjs';

import * as c01 from './checks/01-structure.mjs';
import * as c02 from './checks/02-paths.mjs';
import * as c03 from './checks/03-budget.mjs';
import * as c04 from './checks/04-external.mjs';
import * as c05 from './checks/05-network.mjs';
import * as c06 from './checks/06-banned-words.mjs';
import * as c07 from './checks/07-copy.mjs';
import * as c08 from './checks/08-a11y.mjs';
import * as c09 from './checks/09-scope.mjs';
import * as c10 from './checks/10-worker.mjs';
import * as c11 from './checks/11-p0-static.mjs';

const suites = [c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11];

console.log('图小鱼 · QA 检查（零依赖 / 静态 + 单元）');
console.log(`repo : ${ROOT}`);
console.log(`node : ${process.version}`);
console.log(`时间 : ${new Date().toISOString()}`);

let total = 0;
let failed = 0;
const failedItems = [];

for (const mod of suites) {
  const results = await mod.run();
  total += results.length;
  const f = printSuite(mod, results);
  failed += f;
  for (const r of results.filter((x) => !x.ok)) failedItems.push(`[${mod.id}] ${r.name}`);
}

console.log('\n[12] 单元测试（node:test） — 直接 import assets/js 里的真实实现');
const unit = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'tests/unit.test.mjs'], {
  cwd: ROOT,
  encoding: 'utf8',
});
const unitOut = `${unit.stdout || ''}${unit.stderr || ''}`.trim();
console.log(unitOut.split('\n').map((l) => `  ${l}`).join('\n'));
const unitFailed = unit.status !== 0;

console.log('\n================ 汇总 ================');
console.log(`静态检查：${total - failed}/${total} 条通过，失败 ${failed} 条`);
console.log(`单元测试：${unitFailed ? 'FAIL' : 'PASS'}`);
if (failedItems.length) {
  console.log('失败项：');
  for (const item of failedItems) console.log(`  ✗ ${item}`);
}
console.log(`总判定：${failed === 0 && !unitFailed ? 'PASS' : 'FAIL'}`);
process.exit(failed === 0 && !unitFailed ? 0 : 1);
