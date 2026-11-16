/**
 * 岗位能力路径规划引擎（学生视角）
 * --------------------------------------------------------------------------
 * 输入：目标岗位 + 已掌握知识点；输出：从「现有知识」到「岗位技能」的图最短补强路径、
 * 分学期学习计划与学时预算。
 * 核心算法：把「知识点共现（同课程）」与「知识点↔技能语义对齐」建成带权图，
 * 用多源 Dijkstra 求每个目标技能的最短可达路径 —— 对应项目书的图计算内核，
 * 同时把原本面向管理者的诊断能力下沉到学生个体，形成平台闭环。
 */
import { majors, courses, knowledgePoints, jobs, skills } from './dataset';
import { alignScore } from './graph';

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const round1 = (n: number) => +n.toFixed(1);
const CATEGORY_ORDER: Record<string, number> = { 通识: 0, 学科基础: 1, 专业核心: 2, 专业拓展: 3, 实践: 4 };

export interface PathSkill {
  skill: string; demand: number; trend: string; category: string;
  readiness: number; path: string[]; courses: string[]; hours: number;
  confidence: number; action: string;
}

export interface SemesterItem { name: string; course: string; hours: number; type: '知识点' | '产业模块'; note: string }
export interface Semester { name: string; focus: string; items: SemesterItem[]; hours: number }
export interface PathNode { id: string; name: string; category: number; value: number; symbolSize: number }
export interface PathLink { source: string; target: string; relation: string; weight: number }
export interface PathResult {
  job: string; major: string; readiness: number; estimatedHours: number;
  skillPaths: PathSkill[]; semesters: Semester[];
  graph: { nodes: PathNode[]; links: PathLink[]; categories: { name: string; color: string }[] };
  advice: string[];
  evidence: { label: string; text: string }[];
}

export function listJobs() { return jobs.map((j) => ({ title: j.title, industry: j.industry, count: j.count, skills: j.skills })); }
export function listMajors() { return majors.map((m) => m.name); }

/** 可选「已掌握知识点」清单：优先给出目标专业覆盖的知识点 */
export function listKnowledgePoints(majorName?: string) {
  const major = majors.find((m) => m.name === majorName);
  const scope = major ? new Set(major.courses) : null;
  const all = knowledgePoints.filter((k) => !scope || k.courseNames.some((c) => scope.has(c)));
  return all.map((k) => ({ name: k.name, hours: k.hours, demand: k.industryDemand, course: k.courseNames[0] || '' }))
    .sort((a, b) => b.demand - a.demand);
}

interface Edge { to: string; w: number; relation: string }

function buildAdjacency(majorName: string, jobSkills: string[]) {
  const major = majors.find((m) => m.name === majorName) || majors[0];
  const scope = new Set(major.courses);
  const kpInScope = knowledgePoints.filter((k) => k.courseNames.some((c) => scope.has(c)));
  const adj = new Map<string, Edge[]>();
  const add = (from: string, to: string, w: number, relation: string) => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push({ to, w, relation });
  };

  // 同课程知识点之间建立共现边（可双向走通，代表「先修 → 后续」的学习通道）
  major.courses.forEach((cn) => {
    const c = courses.find((x) => x.name === cn);
    if (!c) return;
    c.knowledgePoints.forEach((a) => c.knowledgePoints.forEach((b) => {
      if (a !== b) add(`k:${a}`, `k:${b}`, 0.42, '同课程先修');
    }));
  });
  // 跨课程语义邻接：名称 / 产业别名相近的知识点之间也建立学习通道，
  // 避免图谱被「同课程」割裂成互不连通的子图（否则跨课程的最短路径不可达）。
  kpInScope.forEach((a) => kpInScope.forEach((b) => {
    if (a.name === b.name) return;
    const sc = alignScore(a.name, a.aliases, b.name);
    if (sc >= 0.32) add(`k:${a.name}`, `k:${b.name}`, Math.max(0.3, 1.1 - sc), '语义先修');
  }));
  // 知识点 → 产业技能：为每个技能至少保留 3 条最高对齐度的入边，
  // 即使产业侧是「Python」「大模型应用/RAG」这类全新术语，也能给出一条可解释的补强链。
  jobSkills.forEach((sn) => {
    const ranked = kpInScope
      .map((k) => ({ k, sc: alignScore(k.name, k.aliases, sn) }))
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 3);
    ranked.forEach(({ k, sc }) => add(`k:${k.name}`, `s:${sn}`, Math.max(0.15, 1 - sc), sc >= 0.6 ? '强匹配' : sc >= 0.3 ? '语义对齐' : '需新建模块'));
  });
  return { adj, kpInScope, scope };
}

/** 多源 Dijkstra：从所有「已掌握知识点」同时出发，求到目标技能的最小学习成本路径 */
function shortestPath(adj: Map<string, Edge[]>, sources: string[], target: string): { path: string[]; cost: number } {
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  sources.forEach((s) => dist.set(s, 0));
  // 节点规模很小（< 150），线性取最小值即可，避免引入优先队列依赖
  for (let i = 0; i < 400; i += 1) {
    let cur: string | null = null, best = Infinity;
    dist.forEach((d, node) => { if (!visited.has(node) && d < best) { best = d; cur = node; } });
    if (!cur || cur === target) break;
    const current: string = cur;
    visited.add(current);
    (adj.get(current) || []).forEach((e) => {
      const nd = best + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, current); }
    });
  }
  if (!dist.has(target)) return { path: [], cost: Infinity };
  const path: string[] = [];
  let node: string | undefined = target;
  while (node) { path.unshift(node); node = prev.get(node); if (path.length > 12) break; }
  return { path, cost: dist.get(target) ?? Infinity };
}

export function planPath(jobTitle: string, majorName = '计算机科学与技术', known: string[] = []): PathResult {
  const job = jobs.find((j) => j.title === jobTitle) || jobs[0];
  const major = majors.find((m) => m.name === majorName) || majors[0];
  const knownSet = new Set(known.filter((k) => knowledgePoints.some((x) => x.name === k)));
  const { adj, kpInScope, scope } = buildAdjacency(major.name, job.skills);
  // 未提供已掌握知识点时，以该专业前 4 个基础知识点作为起点，保证路径可解
  const sources = knownSet.size
    ? Array.from(knownSet).map((k) => `k:${k}`)
    : kpInScope.slice(0, 4).map((k) => `k:${k.name}`);

  const skillPaths: PathSkill[] = job.skills.map((sn) => {
    const s = skills.find((x) => x.name === sn);
    const demand = s?.demand ?? 70;
    const bestKnown = Math.max(0, ...Array.from(knownSet).map((k) => {
      const meta = knowledgePoints.find((x) => x.name === k);
      return meta ? alignScore(meta.name, meta.aliases, sn) : 0;
    }));
    const readiness = round1(clamp(bestKnown * 100));
    const { path, cost } = shortestPath(adj, sources, `s:${sn}`);
    let prettyPath = path.map((p) => p.startsWith('k:') ? p.slice(2) : p.startsWith('s:') ? p.slice(2) : p);
    if (!prettyPath.length) {
      // 兜底：图中仍不可达时，构造「起点 → 最相近知识点 → 目标技能」的低置信补强链
      const best = kpInScope.map((k) => ({ name: k.name, sc: alignScore(k.name, k.aliases, sn) })).sort((a, b) => b.sc - a.sc)[0];
      const start = knownSet.size ? Array.from(knownSet)[0] : kpInScope[0]?.name;
      prettyPath = [start, best?.name, sn].filter((x): x is string => Boolean(x)).filter((x, i, arr) => arr.indexOf(x) === i);
    }
    const missingKps = prettyPath.filter((p) => p !== sn && knowledgePoints.some((k) => k.name === p) && !knownSet.has(p));
    const courseSet = new Set<string>();
    missingKps.forEach((k) => {
      const meta = knowledgePoints.find((x) => x.name === k);
      (meta?.courseNames || []).forEach((c) => { if (scope.has(c)) courseSet.add(c); });
      if (!courseSet.size && meta?.courseNames[0]) courseSet.add(meta.courseNames[0]);
    });
    const hours = missingKps.reduce((sum, k) => sum + (knowledgePoints.find((x) => x.name === k)?.hours ?? 6), 0);
    const confidence = Number.isFinite(cost) ? round1(clamp(92 - cost * 26)) : 28;
    const action = readiness >= 70 ? '维持并做项目化巩固'
      : missingKps.length ? `补强 ${missingKps.slice(0, 2).join('、')}`
        : '校企共建产业实训模块';
    return {
      skill: sn, demand, trend: s?.trend || 'flat', category: s?.category || '通用',
      readiness, path: prettyPath, courses: Array.from(courseSet).slice(0, 2),
      hours: hours || 16, confidence, action,
    };
  });

  const weighted = skillPaths.reduce((s, r) => s + r.readiness * (r.demand / 100), 0);
  const weightSum = skillPaths.reduce((s, r) => s + r.demand / 100, 0);
  const readiness = round1(clamp(weighted / Math.max(0.01, weightSum)));

  // 分学期计划：按课程类别（先修顺序）排序，控制每学期学时预算
  const seen = new Set<string>();
  const flat: SemesterItem[] = [];
  skillPaths.filter((r) => r.readiness < 70).sort((a, b) => b.demand - a.demand).forEach((r) => {
    r.path.filter((p) => knowledgePoints.some((k) => k.name === p) && !knownSet.has(p)).forEach((p) => {
      if (seen.has(p)) return;
      seen.add(p);
      const meta = knowledgePoints.find((k) => k.name === p)!;
      const course = meta.courseNames.find((c) => scope.has(c)) || meta.courseNames[0] || '自学 / 企业实训';
      flat.push({ name: p, course, hours: Math.max(4, meta.hours * 2), type: '知识点', note: `支撑技能「${r.skill}」` });
    });
    if (!r.path.length) {
      const key = `模块:${r.skill}`;
      if (!seen.has(key)) { seen.add(key); flat.push({ name: r.skill, course: '企业实训 / 项目式课程', hours: 16, type: '产业模块', note: '知识体系中暂无直接对应知识点' }); }
    }
  });
  flat.sort((a, b) => {
    const ca = courses.find((c) => c.name === a.course)?.category || '专业拓展';
    const cb = courses.find((c) => c.name === b.course)?.category || '专业拓展';
    return (CATEGORY_ORDER[ca] ?? 2) - (CATEGORY_ORDER[cb] ?? 2) || a.name.localeCompare(b.name);
  });
  const semesters: Semester[] = [];
  const budget = 96;
  let bucket: SemesterItem[] = [], used = 0;
  flat.forEach((item) => {
    if (used + item.hours > budget && bucket.length) {
      semesters.push({ name: `第 ${semesters.length + 1} 学期`, focus: semesters.length === 0 ? '夯实学科基础与核心概念' : semesters.length === 1 ? '专业核心能力与工程化训练' : '产业前沿与综合实践', items: bucket, hours: used });
      bucket = []; used = 0;
    }
    bucket.push(item); used += item.hours;
    if (semesters.length >= 3) return;
  });
  if (bucket.length && semesters.length < 3) {
    semesters.push({ name: `第 ${semesters.length + 1} 学期`, focus: '产业前沿与综合实践', items: bucket, hours: used });
  }
  if (!semesters.length) semesters.push({ name: '当前学期', focus: '能力已达标，建议参与企业级项目巩固', items: [], hours: 0 });
  const estimatedHours = semesters.reduce((s, x) => s + x.hours, 0);

  // 可视化子图：已掌握 / 待补强 / 目标技能 三类节点 + 路径边
  const nodes = new Map<string, PathNode>();
  const links: PathLink[] = [];
  const addNode = (id: string, name: string, category: number, value: number) => {
    if (!nodes.has(id)) nodes.set(id, { id, name, category, value, symbolSize: category === 2 ? 22 : category === 0 ? 16 : 12 });
  };
  Array.from(knownSet).slice(0, 8).forEach((k) => addNode(`k:${k}`, k, 0, 60));
  skillPaths.forEach((r) => {
    addNode(`s:${r.skill}`, r.skill, 2, r.demand);
    const chain = r.path;
    chain.forEach((name, i) => {
      const isSkill = i === chain.length - 1;
      if (!isSkill) addNode(`k:${name}`, name, 1, knowledgePoints.find((k) => k.name === name)?.industryDemand || 50);
      if (i > 0) {
        const prevName = chain[i - 1];
        const from = prevName === r.skill ? `s:${prevName}` : `k:${prevName}`;
        const to = isSkill ? `s:${name}` : `k:${name}`;
        if (from !== to) links.push({ source: from, target: to, relation: isSkill ? '技能对齐' : '先修衔接', weight: 1 });
      }
    });
  });

  const advice = [
    `当前对「${job.title}」的加权能力就绪度为 **${readiness}%**，预计还需 **${estimatedHours} 学时** 的补强学习，分布在 ${semesters.length} 个学期。`,
    `优先补齐 ${skillPaths.filter((r) => r.readiness < 45).slice(0, 3).map((r) => `「${r.skill}」（就绪 ${r.readiness}%）`).join('、') || '高需求技能'}，这些技能在 ${job.count.toLocaleString()} 条在招岗位中需求强度最高。`,
    '路径由「知识点共现图 + 跨域语义对齐」的最短学习成本计算得出；就绪度低的技能若图中无可达路径，将自动转为校企共建产业实训模块。',
  ];

  const evidence = [
    { label: '招聘 JD', text: `${job.title}（${job.industry} · ${job.region}）：在招 ${job.count}，薪资 ${job.salary}，核心技能 ${job.skills.length} 项` },
    { label: '课程大纲', text: `${major.name}：${major.courses.length} 门课程 / ${kpInScope.length} 个知识点参与图构建` },
    { label: '图算法', text: '多源 Dijkstra，边权 = 1 − 语义对齐度；同课程知识点共现边权 0.42' },
  ];

  return {
    job: job.title, major: major.name, readiness, estimatedHours, skillPaths, semesters,
    graph: {
      nodes: Array.from(nodes.values()), links,
      categories: [
        { name: '已掌握知识点', color: '#16a34a' },
        { name: '待补强知识点', color: '#3461f4' },
        { name: '目标岗位技能', color: '#e8843c' },
      ],
    },
    advice, evidence,
  };
}
