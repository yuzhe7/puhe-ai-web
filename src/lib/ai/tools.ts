/**
 * Function Calling / MCP 风格工具注册表
 *
 * 所有工具都落在「本地确定性计算 + 领域知识库」上，大模型只负责意图编排与语言组织，
 * 不负责产生任何数值结论 —— 这是本项目的 AI 可控性设计核心。
 * 同一份注册表同时暴露给：
 *   - LLM 的 tools 参数（Function Calling）
 *   - /api/mcp 的 tools/list 与 tools/call（MCP 协议最小实现，便于外部 Agent 接入）
 */
import { retrieve, corpusStats } from '../rag';
import { buildGraph, similarityMatrix, pairSimilarity, competencyDiagnosis, knowledgeGaps, layerNames } from '../graph';
import { majors, courses, jobs, skills, demoStats } from '../dataset';
import { simulate, baselinePlan, autoOptimize, generateSyllabus } from '../simulator';
import { planPath } from '../pathway';
import type { AgentCard, Layer, Side } from '../types';

export interface ToolDef {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>) => { content: string; card?: AgentCard; summary: string };
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 5): number => (typeof v === 'number' ? v : Number(v) || fallback);

export const tools: ToolDef[] = [
  {
    name: 'retrieve_knowledge',
    label: '检索产教知识库（RAG）',
    description: '从培养方案、课程大纲、招聘JD、政策文件、跨域术语词典、用户上传文档中检索证据片段。任何涉及事实、数值、政策的回答都必须先调用本工具。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索问题，建议使用领域关键词' },
        top_k: { type: 'number', description: '返回片段数量，默认 5' },
      },
      required: ['query'],
    },
    run: (args) => {
      const query = str(args.query, '产教融合');
      const hits = retrieve(query, Math.min(8, Math.max(1, num(args.top_k, 5))));
      const content = hits.map((h, i) => `[${i + 1}] ${h.title}（${h.sourceType}，相关度 ${h.score}）\n${h.text}`).join('\n\n') || '未检索到相关证据。';
      return {
        content,
        summary: `召回 ${hits.length} 条证据片段，知识库共 ${corpusStats().total} 个切片`,
        card: hits.length ? {
          kind: 'report', title: `RAG 检索证据 · ${query}`,
          payload: { type: 'citations', items: hits.map((h) => ({ source: h.source, title: h.title, snippet: h.text.slice(0, 160), score: h.score })) },
        } : undefined,
      };
    },
  },
  {
    name: 'query_graph',
    label: '查询双侧三层知识图谱',
    description: '按层级（宏观/中观/微观）与侧别（高校供给侧/产业需求侧）构建或查询知识图谱，返回节点、关系与统计。',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string', enum: ['macro', 'meso', 'micro'], description: '图谱层级' },
        sides: { type: 'array', items: { type: 'string', enum: ['supply', 'demand'] }, description: '侧别' },
        focus_major: { type: 'string', description: '聚焦专业名称' },
      },
      required: ['layer'],
    },
    run: (args) => {
      const layer = (['macro', 'meso', 'micro'].includes(str(args.layer)) ? str(args.layer) : 'macro') as Layer;
      const sides = (Array.isArray(args.sides) ? args.sides : ['supply', 'demand']) as Side[];
      const g = buildGraph(layer, sides, str(args.focus_major, '计算机科学与技术'));
      const typeCount: Record<string, number> = {};
      g.nodes.forEach((n) => { const t = g.categories[n.category]?.name || '其他'; typeCount[t] = (typeCount[t] || 0) + 1; });
      return {
        content: `${layerNames[layer]}：${g.nodes.length} 个节点、${g.links.length} 条关系。节点分布 ${JSON.stringify(typeCount)}。关系样例：${g.links.slice(0, 6).map((l) => `${l.source.split(':').pop()}→${l.target.split(':').pop()}(${l.relation})`).join('；')}`,
        summary: `构建 ${layerNames[layer]}：${g.nodes.length} 节点 / ${g.links.length} 关系`,
        card: { kind: 'graph', title: layerNames[layer], payload: { layer, sides, focusMajor: str(args.focus_major, '计算机科学与技术'), stats: typeCount } },
      };
    },
  },
  {
    name: 'analyze_similarity',
    label: '宏观诊断 · 专业同质化分析',
    description: '计算专业间课程 Jaccard 相似度、知识点重叠率、图拓扑相似度，按 S=0.3J+0.4K+0.3G 得出同质化综合评分，识别低水平重复建设。',
    parameters: {
      type: 'object',
      properties: {
        major: { type: 'string', description: '目标专业名称，留空则返回全量高风险专业对' },
      },
    },
    run: (args) => {
      const major = str(args.major);
      const all = similarityMatrix();
      const rows = major
        ? all.filter((c) => c.a === major || c.b === major).filter((c) => c.a !== c.b).sort((a, b) => b.score - a.score).slice(0, 6)
        : all.filter((c) => c.a !== c.b).sort((a, b) => b.score - a.score).slice(0, 8);
      const content = rows.length
        ? rows.map((r) => `${r.a} ↔ ${r.b}：综合 ${r.score}（Jaccard ${r.jaccard} / 知识点重叠 ${r.knowledgeOverlap} / 拓扑 ${r.topology}）`).join('\n')
        : '未找到该专业，请确认名称。';
      return {
        content,
        summary: `完成 ${rows.length} 组专业相似度计算`,
        card: { kind: 'similarity', title: major ? `${major} · 同质化风险诊断` : '全量专业同质化 TOP 风险', payload: { rows, major } },
      };
    },
  },
  {
    name: 'diagnose_competency',
    label: '中观诊断 · 培养目标偏差',
    description: '基于工程教育认证 12 项毕业要求，对比高校培养目标覆盖度与产业岗位能力需求强度，输出四种偏差状态与修订建议。',
    parameters: {
      type: 'object',
      properties: { threshold: { type: 'number', description: '偏差阈值，默认 20' } },
    },
    run: (args) => {
      const rows = competencyDiagnosis();
      const gaps = rows.filter((r) => r.state === '培养不足');
      const content = rows.map((r) => `${r.code}. ${r.name}：校内 ${r.schoolWeight} / 产业 ${r.industryWeight}（偏差 ${r.gap > 0 ? '+' : ''}${r.gap}）→ ${r.state}`).join('\n')
        + `\n\n培养不足项：${gaps.map((g) => g.name).join('、') || '无'}`;
      return {
        content,
        summary: `12 项毕业要求诊断完成，识别 ${gaps.length} 项能力缺口`,
        card: { kind: 'competency', title: '培养目标—岗位能力偏差诊断', payload: { rows } },
      };
    },
  },
  {
    name: 'locate_knowledge_gap',
    label: '微观诊断 · 课程知识点缺口',
    description: '将课程知识点与产业技能做细粒度语义对齐，输出「应加强 / 应新增 / 可精简 / 保持」四级课程改革指令及证据。',
    parameters: {
      type: 'object',
      properties: { course: { type: 'string', description: '课程名称，如「数据结构」' } },
      required: ['course'],
    },
    run: (args) => {
      const course = str(args.course, '数据结构');
      const items = knowledgeGaps(course);
      if (!items.length) return { content: `未找到课程「${course}」。可选课程：${courses.slice(0, 12).map((c) => c.name).join('、')}…`, summary: '课程未命中', };
      const content = items.map((i) => `${i.label}｜${i.name}：${i.reason}。证据：${i.evidence.join('、') || '领域词频统计'}`).join('\n');
      return {
        content,
        summary: `定位 ${items.length} 个知识点，${items.filter((i) => i.label !== '保持').length} 项需调整`,
        card: { kind: 'gap', title: `${course} · 知识点缺口定位`, payload: { course, items } },
      };
    },
  },
  {
    name: 'profile_job',
    label: '岗位画像分析',
    description: '按岗位名称返回在招规模、薪资、核心技能标签、技能需求强度与趋势，并给出最匹配专业排名。',
    parameters: {
      type: 'object',
      properties: { job: { type: 'string', description: '岗位名称关键词' } },
      required: ['job'],
    },
    run: (args) => {
      const key = str(args.job);
      const matched = jobs.filter((j) => j.title.includes(key) || key.includes(j.title) || j.skills.some((s) => s.includes(key)));
      const list = matched.length ? matched : jobs.slice(0, 3);
      const content = list.map((j) => `${j.title}（${j.industry}·${j.region}）：在招 ${j.count}，薪资 ${j.salary}，学历 ${j.education}。核心技能：${j.skills.slice(0, 8).join('、')}。JD 摘录：${j.jd.slice(0, 140)}…`).join('\n\n');
      return {
        content,
        summary: `生成 ${list.length} 个岗位画像`,
        card: { kind: 'report', title: `岗位画像 · ${key || '全景'}`, payload: { type: 'jobs', jobs: list } },
      };
    },
  },
  {
    name: 'generate_report',
    label: '生成产教融合诊断报告',
    description: '汇总宏观/中观/微观三维诊断结果，输出面向指定角色（管理者/院系负责人/课程负责人/学生）的结构化报告要点。',
    parameters: {
      type: 'object',
      properties: {
        major: { type: 'string', description: '目标专业' },
        course: { type: 'string', description: '目标课程' },
        role: { type: 'string', enum: ['教育管理者', '院系负责人', '课程负责人', '学生'], description: '报告受众' },
      },
    },
    run: (args) => {
      const major = str(args.major, '计算机科学与技术');
      const course = str(args.course, '数据结构');
      const role = str(args.role, '院系负责人');
      const sim = similarityMatrix().filter((c) => (c.a === major || c.b === major) && c.a !== c.b).sort((a, b) => b.score - a.score).slice(0, 3);
      const comp = competencyDiagnosis();
      const gaps = knowledgeGaps(course);
      const content = [
        `【三维诊断摘要 · 面向${role}】`,
        `宏观：${major} 同质化风险 TOP3 → ${sim.map((s) => `${s.a === major ? s.b : s.a}(${s.score})`).join('、')}`,
        `中观：培养不足能力 ${comp.filter((c) => c.state === '培养不足').map((c) => c.name).join('、')}；过度培养 ${comp.filter((c) => c.state === '过度培养').map((c) => c.name).join('、') || '无'}`,
        `微观：${course} 需调整知识点 ${gaps.filter((g) => g.label !== '保持').length} 项，其中应新增 ${gaps.filter((g) => g.label === '应新增').length} 项`,
        `数据规模：${demoStats.sampledMajors} 个抽样专业 / ${demoStats.courseCount} 门课程 / ${demoStats.knowledgePointCount} 个知识点 / ${demoStats.jdTotal.toLocaleString()} 条岗位需求`,
      ].join('\n');
      return {
        content,
        summary: `已生成面向${role}的三维诊断报告`,
        card: { kind: 'report', title: `${major} · 产教融合诊断报告（${role}）`, payload: { type: 'report', major, course, role, sim, comp, gaps } },
      };
    },
  },
  {
    name: 'simulate_reform',
    label: '培养方案改革沙盘（What-if 模拟）',
    description: '给定专业、目标岗位与课程改革动作（学时调整 / 新增产业模块 / 精简课程），实时重算岗位匹配度、能力均衡度、现代工具覆盖、实践占比与学时成本；optimize=true 时在学时预算内自动寻优。',
    parameters: {
      type: 'object',
      properties: {
        major: { type: 'string', description: '专业名称' },
        target_job: { type: 'string', description: '目标岗位名称' },
        optimize: { type: 'boolean', description: '是否启用带预算约束的贪心自动寻优' },
        budget: { type: 'number', description: '允许新增的学时预算，默认 48' },
      },
    },
    run: (args) => {
      const major = str(args.major, '计算机科学与技术');
      const job = str(args.target_job, 'AI应用开发工程师');
      const optimize = args.optimize === true || args.optimize === 'true';
      const opt = optimize ? autoOptimize(major, job, Math.max(0, Math.min(96, num(args.budget, 48)))) : { plan: baselinePlan(major, job), trace: [] as string[] };
      const r = simulate(opt.plan);
      const content = [
        `【培养方案改革沙盘 · ${major} → ${job}】`,
        `岗位匹配度 ${r.before.match} → ${r.after.match}（${r.after.match - r.before.match > 0 ? '+' : ''}${(r.after.match - r.before.match).toFixed(1)}）`,
        `能力均衡度 ${r.before.balance} → ${r.after.balance}；现代工具覆盖 ${r.before.modern} → ${r.after.modern}`,
        `实践学时占比 ${r.before.practice}% → ${r.after.practice}%；总学时 ${r.before.totalHours} → ${r.after.totalHours}`,
        `新增产业模块：${opt.plan.modules.join('、') || '无'}；学时调整课程：${Object.entries(opt.plan.hours).filter(([k, v]) => v !== courses.find((c) => c.name === k)?.hours).map(([k, v]) => `${k}=${v}`).join('、') || '无'}`,
        ...(opt.trace.length ? ['寻优轨迹：', ...opt.trace] : []),
        ...r.advice.map((a) => `建议：${a.replace(/\*/g, '')}`),
      ].join('\n');
      return {
        content,
        summary: `What-if 模拟完成，匹配度 ${r.before.match} → ${r.after.match}${optimize ? `（自动寻优 ${opt.trace.length} 轮）` : ''}`,
        card: { kind: 'report', title: `${major} · 改革方案模拟`, payload: { type: 'simulation', before: r.before, after: r.after, radar: r.radar, plan: opt.plan, trace: opt.trace } },
      };
    },
  },
  {
    name: 'plan_learning_path',
    label: '岗位能力路径规划',
    description: '以目标岗位 JD 为终点、学生已掌握知识点为起点，在「知识点共现 + 跨域语义对齐」图上用多源 Dijkstra 求最短补强路径，输出就绪度、分学期学习计划与学时预算。',
    parameters: {
      type: 'object',
      properties: {
        job: { type: 'string', description: '目标岗位名称' },
        major: { type: 'string', description: '所在专业' },
        known: { type: 'array', items: { type: 'string' }, description: '已掌握的知识点名称列表' },
      },
      required: ['job'],
    },
    run: (args) => {
      const job = str(args.job, 'AI应用开发工程师');
      const major = str(args.major, '计算机科学与技术');
      const known = Array.isArray(args.known) ? (args.known as unknown[]).filter((x) => typeof x === 'string').slice(0, 40) as string[] : [];
      const p = planPath(job, major, known);
      const content = [
        `【岗位能力路径 · ${job} / ${major}】`,
        `加权就绪度 ${p.readiness}%，预计补强 ${p.estimatedHours} 学时，分布在 ${p.semesters.length} 个学期。`,
        ...p.skillPaths.slice(0, 8).map((s) => `${s.skill}（需求 ${s.demand}）：就绪 ${s.readiness}%，路径 ${s.path.join(' → ') || '需新建产业模块'}，建议 ${s.action}`),
        ...p.semesters.map((s) => `${s.name} · ${s.focus}：${s.items.map((i) => i.name).join('、') || '巩固项目实践'}（${s.hours} 学时）`),
      ].join('\n');
      return {
        content,
        summary: `生成 ${p.semesters.length} 学期补强路径，就绪度 ${p.readiness}%`,
        card: { kind: 'report', title: `${job} · 能力补强路径`, payload: { type: 'path', readiness: p.readiness, estimatedHours: p.estimatedHours, semesters: p.semesters, skillPaths: p.skillPaths } },
      };
    },
  },
  {
    name: 'generate_syllabus',
    label: '生成改革后课程教学大纲',
    description: '依据课程知识点、产业需求强度与改革后的学时分配，自动生成含课程目标、学时分配表、跨域术语对齐、考核方式与证据来源的教学大纲（Markdown）。',
    parameters: {
      type: 'object',
      properties: {
        course: { type: 'string', description: '课程名称' },
        major: { type: 'string', description: '所属专业' },
        target_job: { type: 'string', description: '目标岗位，用于写入证据来源' },
      },
      required: ['course'],
    },
    run: (args) => {
      const course = str(args.course, '数据结构');
      const plan = { ...baselinePlan(str(args.major, '计算机科学与技术'), str(args.target_job, 'AI应用开发工程师')) };
      const md = generateSyllabus(course, plan);
      return {
        content: md.slice(0, 1400),
        summary: `已生成《${course}》教学大纲（${md.length} 字）`,
        card: { kind: 'report', title: `《${course}》教学大纲（改革建议稿）`, payload: { type: 'syllabus', course, markdown: md } },
      };
    },
  },
];

export const toolSchemas = tools.map((t) => ({
  type: 'function' as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

export function runTool(name: string, args: Record<string, unknown> = {}) {
  const t = tools.find((x) => x.name === name);
  if (!t) return { content: `未知工具 ${name}`, summary: '工具调用失败' };
  try { return t.run(args); } catch (e) {
    return { content: `工具执行异常：${(e as Error).message}`, summary: '工具执行异常' };
  }
}

/** 意图 → 工具链（本地确定性引擎使用，同时也是 LLM 的 few-shot 规划参考） */
export function routeIntent(query: string): { name: string; args: Record<string, unknown> }[] {
  const q = query.trim();
  const majorHit = majors.find((m) => q.includes(m.name));
  const courseHit = courses.find((c) => q.includes(c.name));
  const jobHit = jobs.find((j) => q.includes(j.title) || j.title.includes(q.slice(0, 4)));
  const plan: { name: string; args: Record<string, unknown> }[] = [
    { name: 'retrieve_knowledge', args: { query: q, top_k: 4 } },
  ];
  if (/报告|汇报|总结|白皮书/.test(q)) {
    // 复杂意图走完整「宏观 → 中观 → 微观 → 报告」递进式工具链
    plan.push(
      { name: 'analyze_similarity', args: { major: majorHit?.name || '计算机科学与技术' } },
      { name: 'diagnose_competency', args: {} },
      { name: 'locate_knowledge_gap', args: { course: courseHit?.name || '数据结构' } },
      { name: 'generate_report', args: { major: majorHit?.name || '计算机科学与技术', course: courseHit?.name || '数据结构', role: /学生/.test(q) ? '学生' : /课程负责人/.test(q) ? '课程负责人' : '院系负责人' } },
    );
  } else if (/沙盘|模拟|预演|what-?if|最优方案|改革方案|学时预算|自动寻优/i.test(q)) {
    plan.push({ name: 'simulate_reform', args: { major: majorHit?.name || '计算机科学与技术', target_job: jobHit?.title || 'AI应用开发工程师', optimize: /自动|最优|寻优|优化|预算/.test(q), budget: 48 } });
  } else if (/路径|学习计划|补强|学期|就业|就绪|由浅入深/.test(q)) {
    plan.push({ name: 'plan_learning_path', args: { job: jobHit?.title || 'AI应用开发工程师', major: majorHit?.name || '计算机科学与技术', known: [] } });
  } else if (/教学大纲|大纲生成|教案|生成.*大纲|课程大纲/.test(q)) {
    plan.push({ name: 'generate_syllabus', args: { course: courseHit?.name || '数据结构', major: majorHit?.name || '计算机科学与技术', target_job: jobHit?.title || 'AI应用开发工程师' } });
  } else if (/知识点|课程|大纲|学时|精简|新增|缺口|课|改|改革|教学/.test(q) || courseHit) {
    plan.push({ name: 'locate_knowledge_gap', args: { course: courseHit?.name || '数据结构' } });
  } else if (/能力|培养目标|毕业要求|偏差|雷达/.test(q)) {
    plan.push({ name: 'diagnose_competency', args: {} });
  } else if (/相似|同质|重复|对比|专业/.test(q)) {
    plan.push({ name: 'analyze_similarity', args: { major: majorHit?.name || '' } });
  } else if (/岗位|招聘|薪资|技能需求|JD/.test(q)) {
    plan.push({ name: 'profile_job', args: { job: jobHit?.title || q.slice(0, 6) } });
  } else {
    plan.push({ name: 'query_graph', args: { layer: 'macro', sides: ['supply', 'demand'] } });
  }
  if (/图谱|节点|关系/.test(q) && !plan.some((p) => p.name === 'query_graph')) {
    plan.push({ name: 'query_graph', args: { layer: /知识点|技能/.test(q) ? 'micro' : /能力/.test(q) ? 'meso' : 'macro', sides: ['supply', 'demand'], focus_major: majorHit?.name || '计算机科学与技术' } });
  }
  return plan;
}

export const toolOverview = {
  total: tools.length,
  skills: skills.length,
  names: tools.map((t) => t.name),
};
