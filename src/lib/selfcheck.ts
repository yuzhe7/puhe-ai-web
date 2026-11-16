/**
 * 系统自检（Self Check）
 * --------------------------------------------------------------------------
 * 把原本只存在于 scripts/ 的离线断言搬进运行时，供答辩现场一键体检。
 * 全部断言针对「数据引用闭合」与「算法确定性」，不依赖网络、不消耗 token。
 *
 * 设计原则：
 *  - 每项独立 try/catch，单项异常不影响整体报告；
 *  - 逐项计时，便于发现性能退化（如缓存失效后矩阵重算变慢）；
 *  - 结果只读，不改动任何业务状态（唯一副作用是清空并重建图缓存）。
 */
import { majors, courses, knowledgePoints, jobs, skills } from './dataset';
import {
  alignScore,
  clearGraphCaches,
  crossSideMatch,
  knowledgeGaps,
  similarityMatrix,
} from './graph';
import { checkRateLimit } from './validation';
import { corpusStats, retrieve } from './rag';
import { buildCourseMatrixCsv } from './export';

export interface CheckItem {
  id: string;
  group: string;
  name: string;
  pass: boolean;
  detail: string;
  ms: number;
}

export interface SelfCheckReport {
  ok: boolean;
  passed: number;
  total: number;
  durationMs: number;
  generatedAt: string;
  items: CheckItem[];
  stats: {
    majors: number; courses: number; knowledgePoints: number;
    jobs: number; skills: number; similarityPairs: number; corpusChunks: number;
  };
}

type Outcome = { pass: boolean; detail: string };

export function runSelfCheck(): SelfCheckReport {
  const items: CheckItem[] = [];
  const t0 = performance.now();

  const run = (id: string, group: string, name: string, fn: () => Outcome) => {
    const s = performance.now();
    let outcome: Outcome;
    try {
      outcome = fn();
    } catch (e) {
      outcome = { pass: false, detail: `异常：${(e as Error)?.message ?? String(e)}` };
    }
    items.push({ id, group, name, pass: outcome.pass, detail: outcome.detail, ms: +(performance.now() - s).toFixed(1) });
  };

  /* ---------------------------------------------------------------- 数据完整性 */

  run('scale', '数据', '数据规模与版本一致', () => {
    const got = `${majors.length}/${courses.length}/${knowledgePoints.length}/${jobs.length}/${skills.length}`;
    return { pass: got === '62/109/334/38/84', detail: `${got}（期望 62/109/334/38/84）` };
  });

  run('ref-major-course', '数据', '专业 → 课程引用闭合', () => {
    const names = new Set(courses.map((c) => c.name));
    const bad: string[] = [];
    majors.forEach((m) => m.courses.forEach((c) => { if (!names.has(c)) bad.push(`${m.name}→${c}`); }));
    return { pass: bad.length === 0, detail: bad.length ? `悬空 ${bad.length} 条：${bad.slice(0, 3).join('、')}` : '全部命中' };
  });

  run('ref-course-kp', '数据', '课程 → 知识点引用闭合', () => {
    const names = new Set(knowledgePoints.map((k) => k.name));
    const bad: string[] = [];
    courses.forEach((c) => c.knowledgePoints.forEach((k) => { if (!names.has(k)) bad.push(`${c.name}→${k}`); }));
    return { pass: bad.length === 0, detail: bad.length ? `悬空 ${bad.length} 条：${bad.slice(0, 3).join('、')}` : '全部命中' };
  });

  run('ref-kp-course', '数据', '知识点 → 课程反向引用闭合', () => {
    const names = new Set(courses.map((c) => c.name));
    const bad = knowledgePoints.filter((k) => k.courseNames.some((cn) => !names.has(cn)));
    return { pass: bad.length === 0, detail: bad.length ? `悬空 ${bad.length} 个：${bad.slice(0, 3).map((k) => k.name).join('、')}` : '全部命中' };
  });

  run('ref-job-skill', '数据', '岗位 → 技能引用闭合', () => {
    const names = new Set(skills.map((s) => s.name));
    const bad: string[] = [];
    jobs.forEach((j) => j.skills.forEach((s) => { if (!names.has(s)) bad.push(`${j.title}→${s}`); }));
    return { pass: bad.length === 0, detail: bad.length ? `悬空 ${bad.length} 条：${bad.slice(0, 3).join('、')}` : '全部命中' };
  });

  run('dup-id', '数据', '主键与名称无重复', () => {
    const dup = <T extends { id: string }>(arr: T[], label: (x: T) => string) => {
      const ids = new Set<string>(), ns = new Set<string>(), out: string[] = [];
      arr.forEach((x) => {
        const n = label(x);
        if (ids.has(x.id)) out.push(`id:${x.id}`);
        if (ns.has(n)) out.push(`name:${n}`);
        ids.add(x.id); ns.add(n);
      });
      return out;
    };
    const bad = [
      ...dup(majors, (x) => x.name),
      ...dup(courses, (x) => x.name),
      ...dup(knowledgePoints, (x) => x.name),
      ...dup(jobs, (x) => x.title),
      ...dup(skills, (x) => x.name),
    ];
    return { pass: bad.length === 0, detail: bad.length ? `重复 ${bad.length} 处：${bad.slice(0, 3).join('、')}` : '五张表均无重复' };
  });

  /* ---------------------------------------------------------------- 算法确定性 */

  run('matrix-shape', '算法', '相似度矩阵规模 = n(n+1)/2', () => {
    const expect = (majors.length * (majors.length + 1)) / 2;
    const got = similarityMatrix().length;
    return { pass: got === expect, detail: `${got} 组（期望 ${expect}）` };
  });

  run('matrix-determinism', '算法', '相似度矩阵两次计算结果一致', () => {
    const a = JSON.stringify(similarityMatrix());
    clearGraphCaches();
    const b = JSON.stringify(similarityMatrix());
    return { pass: a === b, detail: a === b ? '缓存重建后逐项相同' : '两次结果存在差异' };
  });

  run('matrix-self', '算法', '专业自比对 = 1，跨专业 ∈ [0,1]', () => {
    const rows = similarityMatrix();
    const selfBad = rows.filter((r) => r.a === r.b && Math.abs(r.score - 1) > 1e-6);
    const rangeBad = rows.filter((r) => !Number.isFinite(r.score) || r.score < 0 || r.score > 1);
    return {
      pass: selfBad.length === 0 && rangeBad.length === 0,
      detail: selfBad.length || rangeBad.length ? `自比异常 ${selfBad.length}，越界/非有限 ${rangeBad.length}` : '1953 组全部合法',
    };
  });

  run('align-exact', '算法', '同名知识点与技能对齐度 = 1', () => {
    const v = alignScore('继电保护整定', [], '继电保护整定');
    return { pass: v === 1, detail: `alignScore(继电保护整定, 继电保护整定) = ${v}` };
  });

  run('align-generic', '算法', '泛化别名不再虚高（回归 v10）', () => {
    // 修复前「合规」作为别名命中「数据合规与隐私保护」会直接给 0.94
    const v = alignScore('合同法', ['合规'], '数据合规与隐私保护');
    return { pass: v < 0.9, detail: `alignScore(合同法, 别名「合规」, 数据合规与隐私保护) = ${v}（修复前 0.94）` };
  });

  run('domain-gate', '算法', '领域闸门生效：法学不再首选医疗岗', () => {
    const law = majors.find((m) => m.name === '法学');
    const clinical = jobs.find((j) => j.title === '临床数据分析师');
    const compliance = jobs.find((j) => j.title === '数据合规专员');
    if (!law || !clinical || !compliance) return { pass: false, detail: '样本实体缺失' };
    const a = crossSideMatch(law, clinical);
    const b = crossSideMatch(law, compliance);
    return { pass: a < b, detail: `法学×临床数据分析师 ${a.toFixed(3)} < 法学×数据合规专员 ${b.toFixed(3)}` };
  });

  run('match-coverage', '算法', '岗位匹配强度：≥90% 专业最高契合度 ≥ 0.3', () => {
    const scored = majors.map((m) => ({
      name: m.name,
      best: Math.max(...jobs.map((j) => crossSideMatch(m, j))),
    }));
    const weak = scored.filter((s) => s.best < 0.3).sort((a, b) => a.best - b.best);
    const okRatio = (scored.length - weak.length) / scored.length;
    const worst = weak.slice(0, 2).map((w) => `${w.name} ${w.best.toFixed(3)}`).join('、') || '无';
    return {
      pass: okRatio >= 0.9,
      detail: `${scored.length - weak.length}/${scored.length} 达标（${(okRatio * 100).toFixed(0)}%）；薄弱：${worst}`,
    };
  });

  run('match-diversity', '算法', '岗位匹配未集中在少数几个岗位', () => {
    const tops = majors.map((m) => {
      let best = '', score = -1;
      jobs.forEach((j) => { const s = crossSideMatch(m, j); if (s > score) { score = s; best = j.title; } });
      return best;
    });
    const uniq = new Set(tops).size;
    const maxShare = Math.max(...[...new Set(tops)].map((t) => tops.filter((x) => x === t).length));
    return { pass: uniq >= 10 && maxShare <= majors.length * 0.25, detail: `${uniq} 个不同岗位夺冠，最高占比 ${((maxShare / majors.length) * 100).toFixed(0)}%` };
  });

  run('gap-sane', '算法', '缺口判定标签合法且证据非空', () => {
    const allowed = new Set(['应新增', '应加强', '保持', '可精简']);
    const rows = knowledgeGaps('数据结构');
    const bad = rows.filter((r) => !allowed.has(r.label) || !r.evidence.length);
    return { pass: rows.length > 0 && bad.length === 0, detail: `${rows.length} 条判定，异常 ${bad.length} 条` };
  });

  /* ---------------------------------------------------------------- 运行时保护 */

  run('ratelimit', '运行时', '限流器按窗口拒绝超额请求', () => {
    const key = `selfcheck:${Date.now()}:${Math.random()}`;
    const results = [1, 2, 3, 4].map(() => checkRateLimit(key, 3, 60_000).ok);
    return { pass: results.slice(0, 3).every(Boolean) && results[3] === false, detail: `前 3 次 ${results.slice(0, 3).join('/')}，第 4 次 ${results[3]}` };
  });

  run('rag-hit', '运行时', 'RAG 检索可召回相关片段', () => {
    const hits = retrieve('人工智能 知识图谱', 3);
    return { pass: hits.length > 0 && hits.every((h) => h.text.length > 0), detail: `${hits.length} 条召回，最高相关度 ${hits[0]?.score?.toFixed(3) ?? '—'}` };
  });

  run('export-csv', '运行时', 'CSV 导出结构完整（行数对得上、表头齐全）', () => {
    const out = buildCourseMatrixCsv('计算机科学与技术');
    if (!out) return { pass: false, detail: '导出结果为空' };
    const lines = out.csv.replace(/^\uFEFF/, '').split('\r\n').filter((l) => l.length > 0);
    const head = lines[0].split(',');
    const need = ['专业', '课程', '知识点', '改革后学时', '缺口判定', '调整建议'];
    const missing = need.filter((h) => !head.includes(h));
    const rowOk = lines.length === out.rows + 1;
    return {
      pass: rowOk && missing.length === 0,
      detail: `${out.rows} 行 · ${head.length} 列${missing.length ? ` · 缺列：${missing.join('、')}` : ''}${rowOk ? '' : ` · 行数不符（${lines.length - 1}）`}`,
    };
  });

  const passed = items.filter((i) => i.pass).length;
  return {
    ok: passed === items.length,
    passed,
    total: items.length,
    durationMs: +(performance.now() - t0).toFixed(1),
    generatedAt: new Date().toISOString(),
    items,
    stats: {
      majors: majors.length, courses: courses.length, knowledgePoints: knowledgePoints.length,
      jobs: jobs.length, skills: skills.length,
      similarityPairs: similarityMatrix().length,
      corpusChunks: corpusStats().total,
    },
  };
}
