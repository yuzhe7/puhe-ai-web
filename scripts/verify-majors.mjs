/**
 * v8 专业目录扩样验证（需先启动网页服务）
 * --------------------------------------------------------------------------
 * 校验 62 个专业 / 法学类 9 个专业的代码、归类、课程密度、岗位匹配、
 * 口径分层与数据完整性，并确认筛选、状态、OCR 与全站页面未受影响。
 *   node scripts/verify-majors.mjs
 *   BASE_URL=http://127.0.0.1:3001 node scripts/verify-majors.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSrc = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });

async function get(path) {
  const r = await fetch(BASE + path, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

/** 8 个新增法学类专业：名称与代码逐条核对教育部本科专业目录法学类 0301 */
const NEW_LAW = [
  ['知识产权', '030102T'],
  ['信用风险管理与法律防控', '030104T'],
  ['国际经贸规则', '030105T'],
  ['纪检监察', '030108TK'],
  ['国际法', '030109TK'],
  ['司法鉴定学', '030110TK'],
  ['国家安全学', '030111TK'],
  ['海外利益安全', '030112TK'],
];

let catalog;
try {
  catalog = await get('/api/majors');
} catch (e) {
  console.error('SERVICE_UNAVAILABLE', e.message);
  process.exit(2);
}

const t = catalog.taxonomy;
const law = t.categories.find((c) => c.id === 'law');
const lawRows = catalog.rows.filter((r) => r.discipline === 'law');
const scopes = catalog.rows.reduce((acc, r) => ({ ...acc, [r.scope]: (acc[r.scope] || 0) + 1 }), {});
const s = catalog.stats;

check('total majors = 62', catalog.total === 62, catalog.total);
check('taxonomy coverage = 100%, unclassified = 0', t.coverage === 100 && t.unclassified === 0, `${t.coverage}/${t.unclassified}`);
check('specified 42 / auto 20', t.specifiedCount === 42 && t.autoCount === 20, `${t.specifiedCount}/${t.autoCount}`);
check('law category has 9 majors', law?.count === 9, law?.count);
check('8 new law majors have correct codes', NEW_LAW.every(([n, c]) => law?.majors.some((m) => m.name === n && m.code === c)), NEW_LAW.length);
check('8 new law majors use exact mapping', NEW_LAW.every(([n]) => law?.majors.some((m) => m.name === n && m.matchedBy === 'exact')), NEW_LAW.length);
check('every law major has >= 8 courses', lawRows.every((r) => r.courseCount >= 8), `min=${Math.min(...lawRows.map((r) => r.courseCount))}`);
check('every law major has matched jobs', lawRows.every((r) => r.matchedJobs.length > 0), `zero=${lawRows.filter((r) => !r.matchedJobs.length).length}`);
check('data integrity ok', catalog.integrity.ok, `errors=${catalog.integrity.issues.filter((i) => i.level === 'error').length}`);
check('scale 62/109/334/38/84', s.majors === 62 && s.courses === 109 && s.knowledgePoints === 334 && s.jobs === 38 && s.skills === 84, `${s.majors}/${s.courses}/${s.knowledgePoints}/${s.jobs}/${s.skills}`);
check('new source group has 9 majors', catalog.groupStats.find((g) => g.name === '数字法治与合规')?.count === 9, catalog.groupStats.find((g) => g.name === '数字法治与合规')?.count);
check('moeLaw source registered', catalog.sources.some((x) => x.id === 'moeLaw'), catalog.sources.length);
check('catalog tag registered', catalog.tagStats.some((x) => x.name === '目录补录'), catalog.tagStats.length);
check('scope split 12 pilot / 50 observe', scopes['试点校'] === 12 && scopes['观察池'] === 50, JSON.stringify(scopes));
check('all 9 law majors are observe scope', lawRows.every((r) => r.scope === '观察池'), lawRows.length);

const filtered = await get('/api/majors?discipline=law');
check('discipline=law returns 9 correct rows', filtered.rows.length === 9 && filtered.rows.every((r) => r.discipline === 'law'), filtered.rows.length);
check('taxonomy stays full 62 when filtered', filtered.taxonomy.total === 62, filtered.taxonomy.total);

const status = await get('/api/status');
check('v8 capabilities registered', status.capabilities.includes('law-discipline-expansion') && status.capabilities.includes('major-scope-layer'), status.capabilities.length);
check('status integrity ok', status.integrity.ok, status.integrity.checked?.majors);
check('OCR config unaffected', status.ocr.configured, status.ocr.source);

const pages = ['/', '/graph', '/diagnosis', '/copilot', '/simulate', '/path', '/research', '/data', '/report', '/majors', '/models', '/ocr'];
let bad = 0;
for (const p of pages) {
  try { if ((await fetch(BASE + p)).status !== 200) bad++; } catch { bad++; }
}
check('12 pages return 200', bad === 0, `non200=${bad}`);

const ocr = await get('/api/ocr');
check('OCR catalog still available', Array.isArray(ocr.presets) && ocr.presets.length > 0, ocr.presets?.length);

/* v10 筛选健壮性：动态标签、枚举白名单、警告反馈与前端防护 */
check('tags list served by API', Array.isArray(catalog.tags) && catalog.tags.length === catalog.tagStats.length, `${catalog.tags?.length} vs ${catalog.tagStats.length}`);
check('clean request has no warnings', Array.isArray(catalog.filterWarnings) && catalog.filterWarnings.length === 0, JSON.stringify(catalog.filterWarnings));
check('normalized filters returned', Boolean(catalog.normalizedFilters) && Object.values(catalog.normalizedFilters).every((v) => v === ''), JSON.stringify(catalog.normalizedFilters));

const invalid = await get('/api/majors?group=NOPE&tag=NOPE&discipline=NOPE');
check('invalid enums normalized to full catalog', invalid.matched === 62 && invalid.rows.length === 62, invalid.matched);
check('invalid enums produce warnings', invalid.filterWarnings.length === 3, invalid.filterWarnings.length);
check('invalid enums cleared in normalizedFilters', Object.values(invalid.normalizedFilters).every((v) => v === ''), JSON.stringify(invalid.normalizedFilters));

const longQ = await get('/api/majors?q=' + encodeURIComponent('X'.repeat(200)));
check('oversized query warns', longQ.filterWarnings.some((w) => w.includes('超过 60 字')), JSON.stringify(longQ.filterWarnings));

const legalTag = await get('/api/majors?tag=' + encodeURIComponent('就业预警'));
check('legal tag keeps filter without warning', legalTag.filterWarnings.length === 0 && legalTag.matched === 2, `${legalTag.matched}/${legalTag.filterWarnings.length}`);

const pageSrc = readSrc('src/app/majors/page.tsx');
const apiSrc = readSrc('src/app/api/majors/route.ts');
check('frontend checks r.ok', pageSrc.includes('if (!r.ok)'), '');
check('frontend guards response shape', pageSrc.includes('shapeOk'), '');
check('frontend aborts stale requests', pageSrc.includes('AbortController') && pageSrc.includes('controller.abort()'), '');
check('frontend syncs filters to URL', pageSrc.includes('replaceState') && pageSrc.includes('buildFilterParams'), '');
check('frontend has explicit retry', pageSrc.includes('setRetryKey') && pageSrc.includes('专业目录加载失败'), '');
check('frontend uses API-driven tags', pageSrc.includes('data?.tags') && !pageSrc.includes('const TAGS ='), '');
check('frontend surfaces filter warnings', pageSrc.includes('filterWarnings'), '');
check('API derives tag whitelist from data', apiSrc.includes('Object.values(majorMeta)'), '');

/* 全量快照缓存 / 索引化 / 边界保护 */
const again = await get('/api/majors');
check('snapshot stable across requests', JSON.stringify(again.rows) === JSON.stringify(catalog.rows)
  && JSON.stringify(again.groupStats) === JSON.stringify(catalog.groupStats)
  && JSON.stringify(again.taxonomy) === JSON.stringify(catalog.taxonomy), '');
check('API caches static snapshot', apiSrc.includes('createSnapshot') && apiSrc.includes('getSnapshot'), '');
check('API indexes courses and risks', apiSrc.includes('courseByName') && apiSrc.includes('riskByMajor'), '');
check('unused groups field removed', !apiSrc.includes('groups: MAJOR_GROUPS') && !pageSrc.includes('groups: string[]'), '');
check('chart guards empty dataset', pageSrc.includes('maxCount') && !pageSrc.includes('Math.max(...items.map'), '');
check('external links use noopener', pageSrc.includes('noopener noreferrer'), '');

const passed = results.filter((r) => r.pass).length;
results.forEach((r) => console.log(`  ${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : ` (${r.detail})`}`));
console.log(`VERIFY_MAJORS ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
