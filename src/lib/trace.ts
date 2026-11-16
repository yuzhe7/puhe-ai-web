/**
 * 数值溯源（Score Trace）
 * --------------------------------------------------------------------------
 * 平台对外展示的每个分数都来自确定性算法，但界面上只看到最终值。
 * 这里把分数拆成「公式 → 中间量 → 结果」三段，并做一次独立复算校验
 * （复算值 vs 正式接口值），用于回答「这个数怎么来的」。
 *
 * 设计约束：
 *  - 纯函数，不引入任何新的数值来源，全部复用 graph.ts 的同一套原语；
 *  - 复算与正式计算走同一批底层函数，但由本模块独立拼装，能发现拼装逻辑漂移；
 *  - 输出结构统一，前端一个抽屉组件即可渲染三类溯源。
 */
import { majors, courses, knowledgePoints, jobs, skills } from './dataset';
import {
  alignScore,
  crossSideMatch,
  domainAffinity,
  jaccard,
  knowledgeGaps,
  knowledgeOverlap,
  pairSimilarity,
  topologySimilarity,
} from './graph';
import type { KnowledgePoint } from './types';

export type TraceKind = 'match' | 'similarity' | 'gap';

export interface TraceStep {
  label: string;
  expr: string;
  value: string;
  note?: string;
}

export interface TraceRow {
  name: string;
  detail: string;
  value: string;
  tone?: 'good' | 'warn' | 'muted';
}

export interface TraceTable {
  head: string[];
  body: TraceRow[];
}

export interface TracePayload {
  kind: TraceKind;
  title: string;
  subtitle: string;
  formula: string;
  steps: TraceStep[];
  table: TraceTable | null;
  result: { label: string; value: string };
  recompute: { ok: boolean; expected: string; got: string; note: string } | null;
  raw: Record<string, unknown>;
}

const fixed = (n: number, d = 3) => Number.isFinite(n) ? n.toFixed(d) : '—';

/** 与 graph.ts 中 kpsOfMajor 同构：某专业课程覆盖的全部知识点 */
function kpsOf(majorCourseNames: string[]): KnowledgePoint[] {
  const scope = new Set(majorCourseNames);
  return knowledgePoints.filter((k) => k.courseNames.some((cn) => scope.has(cn)));
}

/** 知识点集合（用于重叠率） */
function knowledgeSetOf(names: string[]): Set<string> {
  const s = new Set<string>();
  courses.filter((c) => names.includes(c.name)).forEach((c) => c.knowledgePoints.forEach((k) => s.add(k)));
  return s;
}

/* ------------------------------------------------------------------ 专业 × 岗位 */

export function matchTrace(majorName: string, jobTitle: string): TracePayload | null {
  const m = majors.find((x) => x.name === majorName);
  const j = jobs.find((x) => x.title === jobTitle);
  if (!m || !j) return null;

  const kps = kpsOf(m.courses);
  const resolved = j.skills
    .map((sn) => ({ sn, s: skills.find((x) => x.name === sn) }))
    .filter((x): x is { sn: string; s: (typeof skills)[number] } => Boolean(x.s));

  const detail = resolved.map(({ sn, s }) => {
    let bestName = '—';
    let bestAlign = 0;
    kps.forEach((k) => {
      const a = alignScore(k.name, k.aliases, sn);
      if (a > bestAlign) { bestAlign = a; bestName = k.name; }
    });
    const weighted = bestAlign * (s.demand / 100);
    return { skill: sn, demand: s.demand, bestKp: bestName, align: bestAlign, weighted };
  });

  const totalWeighted = detail.reduce((acc, d) => acc + d.weighted, 0);
  const rawScore = detail.length ? totalWeighted / detail.length : 0;
  const affinity = domainAffinity(m, j);
  const score = Math.min(1, Math.max(0, rawScore * affinity));

  // 独立复算校验：正式接口值
  const official = crossSideMatch(m, j);

  const table: TraceTable = {
    head: ['岗位技能', '需求强度', '最相近知识点', '对齐度', '加权贡献'],
    body: detail.map((d) => ({
      name: d.skill,
      detail: `需求 ${d.demand} · ${d.bestKp}`,
      value: `${fixed(d.align)} → ${fixed(d.weighted)}`,
      tone: d.align >= 0.6 ? 'good' : d.align > 0 ? 'muted' : 'warn',
    })),
  };

  return {
    kind: 'match',
    title: `${m.name} × ${j.title}`,
    subtitle: `行业：${j.industry} · 在招 ${j.count} · 薪资 ${j.salary} · 专业课程 ${m.courses.length} 门 / 知识点 ${kps.length} 个`,
    formula: '契合度 = clamp( Σ(技能对齐度 × 需求强度/100) / 技能数 × 领域亲和度 )',
    steps: [
      { label: '① 知识点池', expr: `专业「${m.name}」的 ${m.courses.length} 门课程覆盖知识点`, value: `${kps.length} 个` },
      { label: '② 逐技能对齐', expr: '每个技能取「与该专业知识点集合的最大对齐度」', value: `${detail.length} 项技能` },
      { label: '③ 加权求和', expr: 'Σ 对齐度 × 需求强度/100', value: fixed(totalWeighted) },
      { label: '④ 归一化', expr: `③ ÷ ${detail.length}`, value: fixed(rawScore) },
      { label: '⑤ 领域闸门', expr: `岗位行业「${j.industry}」× 专业领域词袋`, value: fixed(affinity, 2), note: affinity >= 1 ? '同域或纯技术岗，不降权' : affinity >= 0.86 ? '跨界但沾边，轻度降权' : '岗位带专业侧完全没有的领域标记，按跨域错配降权' },
      { label: '⑥ 契合度', expr: '④ × ⑤', value: fixed(score) },
    ],
    table,
    result: { label: '岗位契合度', value: fixed(score) },
    recompute: {
      ok: Math.abs(score - official) < 0.001,
      expected: fixed(official),
      got: fixed(score),
      note: '复算值由本页独立重算，正式值来自 /api/majors 使用的 crossSideMatch',
    },
    raw: {
      major: m.name, job: j.title, industry: j.industry,
      kpCount: kps.length, skillCount: detail.length,
      totalWeighted, rawScore, affinity, score, official,
      skills: detail,
    },
  };
}

/* ------------------------------------------------------------------ 专业 × 专业 */

export function similarityTrace(aName: string, bName: string): TracePayload | null {
  const A = majors.find((x) => x.name === aName);
  const B = majors.find((x) => x.name === bName);
  if (!A || !B) return null;

  const courseA = new Set(A.courses);
  const courseB = new Set(B.courses);
  const interCourses = A.courses.filter((c) => courseB.has(c));
  const unionCourses = new Set([...A.courses, ...B.courses]);

  const kpA = knowledgeSetOf(A.courses);
  const kpB = knowledgeSetOf(B.courses);
  const interKp = [...kpA].filter((k) => kpB.has(k));
  const unionKp = new Set([...kpA, ...kpB]);

  const J = jaccard(A.courses, B.courses);
  const K = knowledgeOverlap(A.courses, B.courses);
  const G = topologySimilarity(A.courses, B.courses);
  const score = 0.3 * J + 0.4 * K + 0.3 * G;
  const official = pairSimilarity(A.name, B.name);

  const table: TraceTable = {
    head: ['维度', '计算口径', '中间量', '分值', '权重'],
    body: [
      { name: 'J 课程 Jaccard', detail: `交集 ${interCourses.length} / 并集 ${unionCourses.size}`, value: fixed(J), tone: 'muted' },
      { name: 'K 知识点重叠', detail: `交集 ${interKp.length} / 并集 ${unionKp.size}`, value: fixed(K), tone: 'muted' },
      { name: 'G 图拓扑余弦', detail: '课程类别 5 维向量 + 知识点稀疏向量', value: fixed(G), tone: 'muted' },
    ],
  };

  return {
    kind: 'similarity',
    title: `${A.name} ↔ ${B.name}`,
    subtitle: `课程 ${A.courses.length} / ${B.courses.length} 门 · 知识点 ${kpA.size} / ${kpB.size} 个`,
    formula: 'S = 0.3 × J(课程 Jaccard) + 0.4 × K(知识点重叠率) + 0.3 × G(图拓扑余弦)',
    steps: [
      { label: '① 课程 Jaccard', expr: `|A∩B| / |A∪B| = ${interCourses.length} / ${unionCourses.size}`, value: fixed(J) },
      { label: '② 知识点重叠', expr: `交集 ${interKp.length} / 并集 ${unionKp.size}`, value: fixed(K) },
      { label: '③ 图拓扑余弦', expr: '课程类别分布 + 知识点稀疏向量余弦', value: fixed(G) },
      { label: '④ 加权合成', expr: `0.3×${fixed(J)} + 0.4×${fixed(K)} + 0.3×${fixed(G)}`, value: fixed(score) },
    ],
    table,
    result: { label: '同质化综合评分', value: fixed(score) },
    recompute: {
      ok: Math.abs(score - official.score) < 0.0015,
      expected: fixed(official.score),
      got: fixed(score),
      note: '正式值来自 /api/analyze 使用的 similarityMatrix（同一套系数）',
    },
    raw: {
      a: A.name, b: B.name,
      interCourses, unionCourses: [...unionCourses],
      interKp, unionKp: [...unionKp],
      jaccard: J, knowledgeOverlap: K, topology: G, score,
      official: official.score,
    },
  };
}

/* ------------------------------------------------------------------ 课程 × 缺口 */

export function gapTrace(courseName: string): TracePayload | null {
  const course = courses.find((c) => c.name === courseName);
  if (!course) return null;
  const items = knowledgeGaps(courseName);
  const avgDemand = items.length ? items.reduce((acc, i) => acc + i.demand, 0) / items.length : 0;

  const table: TraceTable = {
    head: ['知识点', '学时', '产业需求', '覆盖度', '判定'],
    body: items.map((i) => ({
      name: i.name,
      detail: i.evidence.slice(0, 2).join(' · ') || '—',
      value: `${i.hours}h · 需求 ${i.demand} · 覆盖 ${i.coverage} → ${i.label}`,
      tone: i.label === '应加强' ? 'warn' : i.label === '应新增' ? 'good' : 'muted',
    })),
  };

  return {
    kind: 'gap',
    title: `《${courseName}》知识点缺口`,
    subtitle: `${course.category} · ${course.credits} 学分 / ${course.hours} 学时 · ${course.knowledgePoints.length} 个知识点`,
    formula: '需求强度 = Σ(技能需求 × 对齐度) / Σ 对齐度（对齐度 ≥ 0.32 的前 3 个技能）；覆盖度 = 学时 / 10',
    steps: [
      { label: '① 知识点枚举', expr: '课程大纲登记的全部知识点', value: `${course.knowledgePoints.length} 个` },
      { label: '② 技能对齐', expr: '每个知识点对齐度 ≥ 0.32 的前 3 个产业技能', value: '已对齐' },
      { label: '③ 需求合成', expr: '按对齐度加权平均技能需求强度', value: `均值 ${avgDemand.toFixed(1)}` },
      { label: '④ 判定规则', expr: '需求 ≥75 且覆盖 <0.65 → 应加强；需求 ≤38 → 可精简', value: `${items.length} 条结论` },
    ],
    table,
    result: { label: '平均产业需求强度', value: avgDemand.toFixed(1) },
    recompute: null,
    raw: { course: courseName, hours: course.hours, credits: course.credits, items },
  };
}

export function buildTrace(kind: TraceKind, a: string, b?: string): TracePayload | null {
  if (kind === 'match') return matchTrace(a, b || '');
  if (kind === 'similarity') return similarityTrace(a, b || '');
  if (kind === 'gap') return gapTrace(a);
  return null;
}
