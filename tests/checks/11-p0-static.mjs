/**
 * 检查 11：PRD P0 里能用静态代码/文案判定的验收点。
 * 这些不是"实现风格"问题，而是验收标准里明确要求、但代码里没做到的点。
 */
import { read, result, htmlVisibleText, lineOf, runCli } from '../lib/harness.mjs';

export const id = '11';
export const title = 'P0 静态验收：像素尺寸 / EXIF 声明 / 取消剩余 / 切档重算';

export async function run() {
  const out = [];
  const app = read('assets/js/app.js');
  const html = read('index.html');
  const css = read('styles/main.css');

  /* P0-6：每行显示像素尺寸。applyResult 里存了 width/height，但 metaParts 没渲染。 */
  const metaParts = /function metaParts\(item\)\s*\{([\s\S]*?)\n\}/.exec(app);
  const metaBody = metaParts ? metaParts[1] : '';
  const showsDims = /width[\s\S]{0,40}?height/.test(metaBody) && /[×xX*]/.test(metaBody);
  const storesDims = /width:\s*result\.width/.test(app) && /height:\s*result\.height/.test(app);
  out.push(result('P0-6 每行结果展示像素尺寸', showsDims, [
    `item.out 已保存尺寸：${storesDims ? '是（width/height 已从 worker 结果写入）' : '否'}`,
    `metaParts() 渲染内容：${metaBody.replace(/\s+/g, ' ').slice(0, 220)}…`,
    showsDims ? '' : 'FAIL 结果行只显示「原体积 → 新体积 · 省 %」，没有「1920×1080」这类像素尺寸；PRD P0-6 要求每行可见。',
    showsDims ? '' : '最小修复：在 metaParts 的 done 分支追加 ` · ${item.out.width}×${item.out.height}`。',
  ].filter(Boolean)));

  /* P0-10：页面必须写明"输出图不含原始拍摄信息"。 */
  const pageText = htmlVisibleText(html);
  const mentionsExif = /(?:EXIF|拍摄信息|元数据)/i.test(pageText);
  const statesStripped = /(?:不含|不包含|已去除|会去掉|剥离|去掉)[^。]{0,12}(?:EXIF|拍摄信息|元数据)/i.test(pageText) ||
    /(?:EXIF|拍摄信息|元数据)[^。]{0,12}(?:不含|不包含|已去除|会去掉|剥离|去掉)/i.test(pageText);
  out.push(result('P0-10 页面声明「输出图不含原始拍摄信息」', mentionsExif && statesStripped, [
    `页面可见文本出现 EXIF/拍摄信息/元数据：${mentionsExif ? '是' : '否'}`,
    statesStripped ? '' : 'FAIL 全页（含 FAQ）没有任何"输出不含拍摄信息/EXIF"的说明；PRD P0-10 把这句话列为验收项。',
    statesStripped ? '' : '最小修复：FAQ 增加一句「输出图会重新编码，不保留 EXIF，拍摄地点和机身信息不会带出去」。',
  ].filter(Boolean)));

  /* P0-5：取消剩余。
   * 有效的两种实现：a) 派发是「分道 + 游标」，未轮到的行保持 pending；
   *                  b) cancelRest 也处理已排队/working 的行。
   * 无效：一次性 queue.map(processOne) 把全部行在 await 前标成 working，而 cancelRest 只改 pending。 */
  const cancelBody = /function cancelRest\(\)\s*\{([\s\S]*?)\n\}/.exec(app);
  const processBody = /async function processOne\(item, pool\)\s*\{([\s\S]*?)\n\}/.exec(app);
  const startBody = /async function startProcessing\(\)\s*\{([\s\S]*?)\n\}/.exec(app);
  const cancelSrc = cancelBody ? cancelBody[1] : '';
  const processSrc = processBody ? processBody[1] : '';
  const startSrc = startBody ? startBody[1] : '';
  const cancelTouchesWorking = /['"]working['"]/.test(cancelSrc);
  const markedBeforeAwait = /item\.status = 'working'[\s\S]{0,200}?await pool\.run/.test(processSrc);
  const laneDispatch = /while\s*\(\s*!state\.cancelled\s*\)/.test(startSrc) && /\blanes\b/.test(startSrc) && /\bcursor\b/.test(startSrc);
  const startsAllAtOnce = /queue\.map\(\s*\(item\)\s*=>\s*processOne/.test(startSrc);
  const cancelEffective = cancelTouchesWorking || laneDispatch || !startsAllAtOnce;
  out.push(result('P0-5「取消剩余」能真正停掉未开始的任务', cancelEffective && !startsAllAtOnce, [
    `派发方式：${laneDispatch ? '分道 + 游标（未轮到的行保持 pending）' : startsAllAtOnce ? '一次性 queue.map 全部启动' : '其他'}`,
    `cancelRest() 处理的状态：${cancelSrc.match(/status === ['"][a-z]+['"]/g)?.join('、') || '未匹配到'}`,
    `processOne 在 await pool.run 之前写 working：${markedBeforeAwait ? '是' : '否'}`,
    cancelEffective && !startsAllAtOnce ? '取消时未开始的行仍是 pending，cancelRest 能把它们标成 cancelled。' : '',
    !(cancelEffective && !startsAllAtOnce)
      ? 'FAIL 点击「取消剩余」时已没有 pending 行，循环不生效；pool 里排队的任务仍会全部跑完。'
      : '',
    !(cancelEffective && !startsAllAtOnce)
      ? '最小修复：分道派发（未轮到的行保持 pending），或 pool.cancelQueued() 拒绝未开始任务。'
      : '',
  ].filter(Boolean)));

  /* P0-4：切档后已完成行的处理方式必须明确；当前是自动重算。 */
  const autoReprocess = /function onSettingsChange\([\s\S]*?reprocess\(finished\)/.test(app) && /function reprocess\([\s\S]*?startProcessing\(\)/.test(app);
  out.push(result('P0-4 切档后已完成行自动重算（策略明确）', autoReprocess, [
    autoReprocess ? '实现：onSettingsChange → reprocess(done 行) → startProcessing，属于「自动重算」' : 'FAIL 未找到自动重算或标记需重算的逻辑',
  ]));

  /* P0-5 相关：处理过程中追加文件，不能永远停在「等待处理」。 */
  const addBodyMatch = /function addFiles\(files\)\s*\{([\s\S]*?)\n\}/.exec(app);
  const addBody = addBodyMatch ? addBodyMatch[1] : '';
  const addCallsStart = /startProcessing\(\)/.test(addBody);
  const earlyReturn = /if \(state\.processing\) return;/.test(startSrc);
  const requeueAfterBatch = /finally\s*\{[\s\S]*?startProcessing\(\)/.test(startSrc);
  const midBatchOk = !(addCallsStart && earlyReturn) || requeueAfterBatch;
  out.push(result('处理中追加的文件会被继续处理（不会卡在等待）', midBatchOk, [
    `addFiles 入队后调用 startProcessing：${addCallsStart ? '是' : '否'}`,
    `startProcessing 在处理中直接 return：${earlyReturn ? '是' : '否'}`,
    `本批结束后重新扫描 pending：${requeueAfterBatch ? '是' : '否'}`,
    midBatchOk ? '' : 'FAIL 处理中 addFiles → startProcessing 直接 return；当前批次 queue 是开始时的快照，finally 里也不再启动 → 新行永远「等待处理」。',
    midBatchOk ? '' : '复现：先选 10 张大图，开始压缩后再选 1 张，等前 10 张全部完成，第 11 张仍停在「等待处理」。',
    midBatchOk ? '' : '最小修复：startProcessing 的 finally 里若还有 pending 行则再次调用；或把新文件放进当前 pool 的等待队列。',
  ].filter(Boolean)));

  /* P0-3 相关：用户明确选「转 JPG / 转 WebP」时，不能因为体积变大就静默回退成原格式。 */
  const applySrc = (/function applyResult\(item, result\)\s*\{([\s\S]*?)\n\}/.exec(app) || [])[1] || '';
  const grewRevert = /const grew = result\.blob\.size >= item\.file\.size \* 0\.98/.test(applySrc);
  const respectsExplicitFormat = /state\.settings\.format\s*!==\s*['"]keep['"]/.test(applySrc);
  const explicitFormatOk = !grewRevert || respectsExplicitFormat;
  out.push(result('显式「转 JPG / 转 WebP」不会静默回退成原格式', explicitFormatOk, [
    `applyResult 有「没变小就用原图」分支：${grewRevert ? '是' : '否'}`,
    `该分支会判断用户是否显式选了目标格式：${respectsExplicitFormat ? '是' : '否'}`,
    explicitFormatOk ? '' : 'FAIL 用户选「转 JPG」但输出比原图大时，applyResult 改用 item.file，type 变回原格式（PNG/WebP 仍是 PNG/WebP），下载名也回原名。',
    explicitFormatOk ? '' : '影响：格式转换的核心承诺可能不兑现（P0-3 要求输出 file.type === image/webp）；对透明 PNG 转 JPG 尤其容易触发。',
    explicitFormatOk ? '' : '最小修复：仅当 state.settings.format === "keep" 时才保留原图；显式转格式时始终输出目标类型（可附提示「转换后体积变大」）。',
  ].filter(Boolean)));

  /* P0-1：拖拽区键盘可打开文件框。 */
  const keyOpen = /dom\.drop\.addEventListener\('keydown'[\s\S]{0,200}?dom\.input\.click\(\)/.test(app);
  out.push(result('P0-1 拖拽区 Enter/Space 可打开文件框', keyOpen, [keyOpen ? 'keydown → input.click() 已接线' : 'FAIL 未接线']));

  /* P0-6 文件名：P0 要求「原名 + 目标后缀」；P1 才做后缀规范化。 */
  const naming = /`\$\{base\}-压缩后\.\$\{ext\}`/.test(read('assets/js/format.js'));
  out.push(result('P0-6 下载文件名 = 原名 + 目标后缀（当前加了「-压缩后」）', true, [
    naming ? 'WARN 实际名：photo-压缩后.jpg。能区分原图，但与 P0-6 字面「原名+后缀」有偏差，属产品口径，建议指挥官确认后改文案或改实现。' : '未匹配',
  ]));

  /* P0-2：透明 PNG 转 JPG 的白底实现（真机效果仍需浏览器）。 */
  const worker = read('workers/compress.worker.js');
  const whiteFill = /fillStyle = '#ffffff'[\s\S]{0,120}?fillRect/.test(worker);
  out.push(result('P0-2 转 JPG 前铺白底（代码已实现）', whiteFill, [
    whiteFill ? 'worker 在 drawImage 前 fillRect 白底；主线程兜底逻辑相同' : 'FAIL 未找到白底逻辑',
    '像素级效果（透明区是否纯白、边缘是否发灰）仍需浏览器验证',
  ]));

  void css;
  return out;
}

await runCli(import.meta.url, { id, title, run });
