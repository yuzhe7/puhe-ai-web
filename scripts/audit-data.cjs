/**
 * 数据完整性审计（无需 Next.js 构建 / 无需启动服务）
 * --------------------------------------------------------------------------
 * 用 TypeScript 编译器在内存中把 .ts 转译为 CommonJS，直接加载纯数据/算法模块，
 * 校验「专业→课程→知识点」「岗位→技能」引用是否闭合、id 是否重复、
 * 以及跨域语义对齐词典的覆盖率。可加入 CI：
 *   node scripts/audit-data.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
let ts;
try { ts = require('typescript'); } catch { console.error('需要 typescript：请先 npm install'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// 让 require 能解析无扩展名的相对 TS 导入
if (!require.extensions['.ts']) {
  require.extensions['.ts'] = (mod, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const out = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      fileName: filename,
    }).outputText;
    mod._compile(out, filename);
  };
}
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  try { return originalResolve.call(this, request, parent, isMain, options); } catch (e) {
    if (request.startsWith('.') || request.startsWith('/')) {
      return originalResolve.call(this, request + '.ts', parent, isMain, options);
    }
    throw e;
  }
};

const validation = require(path.join(SRC, 'lib', 'validation.ts'));
const dataset = require(path.join(SRC, 'lib', 'dataset.ts'));
const graph = require(path.join(SRC, 'lib', 'graph.ts'));
const hot = require(path.join(SRC, 'lib', 'hot-majors.ts'));

const report = validation.dataIntegrityReport();
const kpWithAlias = dataset.knowledgePoints.filter((k) => k.aliases.length).length;
const courseWithoutMajor = dataset.courses.filter((c) => !c.majorIds.length).map((c) => c.name);
const skillWithoutJob = dataset.skills.filter((s) => !dataset.jobs.some((j) => j.skills.includes(s.name))).map((s) => s.name);
const metaMissing = dataset.majors.filter((m) => !hot.majorMeta[m.name] && m.name.length).map((m) => m.name);

const lines = [
  '=== 谱合产教 · 数据完整性审计 ===',
  `规模：专业 ${dataset.majors.length} / 课程 ${dataset.courses.length} / 知识点 ${dataset.knowledgePoints.length} / 岗位 ${dataset.jobs.length} / 技能 ${dataset.skills.length} / JD 样本 ${dataset.demoStats.jdTotal}`,
  `词条：已有产业同义表述的知识点 ${kpWithAlias}/${dataset.knowledgePoints.length}；新增来源 ${hot.MAJOR_SOURCES.length} 项；分类 ${hot.MAJOR_GROUPS.length} 类`,
  `引用错误：${report.issues.filter((i) => i.level === 'error').length} 项；警告：${report.issues.filter((i) => i.level === 'warn').length} 项`,
];
report.issues.slice(0, 30).forEach((i) => lines.push(`  [${i.level}] ${i.target}：${i.message}`));
if (courseWithoutMajor.length) lines.push(`  未归属任何专业的课程（${courseWithoutMajor.length}）：${courseWithoutMajor.slice(0, 12).join('、')}`);
if (skillWithoutJob.length) lines.push(`  未被任何岗位引用的技能（${skillWithoutJob.length}）：${skillWithoutJob.slice(0, 12).join('、')}`);
lines.push(`  试点基础专业（无热门标签，属正常）：${metaMissing.length} 个`);

// 抽样验证：三维算法在新数据规模下仍能给出有限数值
const t0 = Date.now();
const sim = graph.similarityMatrix();
const t1 = Date.now();
const top = sim.filter((c) => c.a !== c.b).sort((a, b) => b.score - a.score).slice(0, 3);
lines.push(`相似度矩阵：${sim.length} 组，首次计算 ${t1 - t0}ms`);
const t2 = Date.now();
graph.similarityMatrix();
lines.push(`  缓存命中重算 ${Date.now() - t2}ms`);
top.forEach((c) => lines.push(`  TOP：${c.a} ↔ ${c.b} = ${c.score}`));
const badCells = sim.filter((c) => !Number.isFinite(c.score));
lines.push(`  非有限评分：${badCells.length} 组`);

const errors = report.issues.filter((i) => i.level === 'error').length + badCells.length;
lines.push(errors ? `\n结论：未通过（${errors} 项错误）` : '\n结论：通过');
console.log(lines.join('\n'));
process.exit(errors ? 1 : 0);
