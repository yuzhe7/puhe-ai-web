/**
 * 专业深链接自动匹配验证（需先启动网页服务）
 * --------------------------------------------------------------------------
 * 验证从 /majors 卡片跳转到「沙盘 / 诊断 / 路径」后，携带的目标岗位与对比专业
 * 确实是服务端确定性算法认可的合法值，且三个分析链路能基于这些值产出结果。
 *   node scripts/verify-deeplinks.mjs
 */
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });
const enc = encodeURIComponent;

async function get(path, init) {
  const r = await fetch(BASE + path, init);
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}
const post = (path, body) => get(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/** 覆盖不同学科大类，含 v8 新增法学专业与截图中的低空技术与工程 */
const SAMPLES = ['低空技术与工程', '知识产权', '计算机科学与技术', '临床医学', '电气工程及其自动化'];
const PAGES = ['/', '/graph', '/diagnosis', '/copilot', '/simulate', '/path', '/research', '/data', '/report', '/majors', '/models', '/ocr'];

let simRows;
try {
  simRows = (await post('/api/analyze', { kind: 'similarity' })).rows || [];
} catch (e) {
  console.error('SERVICE_UNAVAILABLE', e.message);
  process.exit(2);
}

for (const major of SAMPLES) {
  const d = await get(`/api/majors?q=${enc(major)}`);
  const row = (d.rows || []).find((r) => r.name === major);
  check(`catalog row exists: ${major}`, Boolean(row), d.rows?.length);
  if (!row) continue;

  const job = row.matchedJobs?.[0]?.title;
  const compare = row.topRisk?.other;
  check(`best job resolved: ${major}`, Boolean(job), job || 'none');
  check(`compare major resolved: ${major}`, Boolean(compare), compare || 'none');
  if (!job || !compare) continue;

  const links = {
    simulate: `/simulate?major=${enc(major)}&job=${enc(job)}`,
    diagnosis: `/diagnosis?tab=macro&major=${enc(major)}&compare=${enc(compare)}`,
    path: `/path?major=${enc(major)}&job=${enc(job)}`,
  };
  for (const [page, url] of Object.entries(links)) {
    const r = await fetch(BASE + url);
    check(`${page} deep link 200: ${major}`, r.status === 200, r.status);
  }

  // 兜底链路：只带 major（命令面板 / 手动 URL）时页面不应报错，由客户端自动补齐
  const fallback = {
    simulate: `/simulate?major=${enc(major)}`,
    diagnosis: `/diagnosis?tab=macro&major=${enc(major)}`,
    path: `/path?major=${enc(major)}`,
  };
  for (const [page, url] of Object.entries(fallback)) {
    const r = await fetch(BASE + url);
    check(`${page} major-only fallback 200: ${major}`, r.status === 200, r.status);
  }

  const sim = await get(`/api/simulate?major=${enc(major)}&job=${enc(job)}`);
  check(`sandbox accepts auto job: ${major}`, sim.baseline?.targetJob === job, `${sim.baseline?.targetJob} vs ${job}`);

  const pathCatalog = await get(`/api/path?major=${enc(major)}`);
  check(`path job list contains auto job: ${major}`, (pathCatalog.jobs || []).some((j) => j.title === job), pathCatalog.jobs?.length);

  const pairExists = simRows.some((r) => (r.a === major && r.b === compare) || (r.b === major && r.a === compare));
  check(`comparison pair exists in similarity matrix: ${major}`, pairExists, `${major} <-> ${compare}`);
}

const majorsPage = read('src/app/majors/page.tsx');
const simulatePage = read('src/app/simulate/page.tsx');
const diagnosisPage = read('src/app/diagnosis/page.tsx');
const pathPage = read('src/app/path/page.tsx');
const contextModule = read('src/lib/major-context.ts');
check('catalog uses buildMajorLinks', majorsPage.includes('buildMajorLinks') && majorsPage.includes('links.simulate') && majorsPage.includes('links.diagnosis') && majorsPage.includes('links.path'), '');
check('sandbox uses autoMatchJob', simulatePage.includes('autoMatchJob') && simulatePage.includes('switchMajor'), '');
check('diagnosis uses autoMatchCompare', diagnosisPage.includes('autoMatchCompare') && diagnosisPage.includes('switchMajorA'), '');
check('path uses autoMatchJob', pathPage.includes('autoMatchJob') && pathPage.includes('switchMajor'), '');
check('context module has race guard', contextModule.includes('jobMatchSeq') && contextModule.includes('compareMatchSeq'), '');
check('context module derives from deterministic APIs', contextModule.includes('matchedJobs') && contextModule.includes('topRisk'), '');

const status = await get('/api/status');
check('v9 capability registered', status.capabilities.includes('deep-link-auto-match'), status.capabilities.length);

let bad = 0;
for (const p of PAGES) {
  try { if ((await fetch(BASE + p)).status !== 200) bad++; } catch { bad++; }
}
check('12 pages return 200', bad === 0, `non200=${bad}`);

const passed = results.filter((r) => r.pass).length;
results.filter((r) => !r.pass).forEach((r) => console.log(`  FAIL ${r.name} (${r.detail})`));
console.log(`VERIFY_DEEPLINKS ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
