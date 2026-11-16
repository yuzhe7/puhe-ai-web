/**
 * 培养方案改革沙盘 · What-if 决策模拟引擎
 * --------------------------------------------------------------------------
 * 与「三维诊断」的区别：诊断回答「现在哪里有问题」，沙盘回答「如果这么改会怎样」。
 * 所有指标均由本地数据与确定性公式实时重算，不经大模型产生数值；
 * autoOptimize 采用带学时预算约束的贪心搜索，在候选改革动作空间内求解近似最优方案。
 */
import { majors, courses, knowledgePoints, jobs, skills, competencies } from './dataset';
import { alignScore } from './graph';

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const round1 = (n: number) => +n.toFixed(1);

/** 新增一个产业模块按 16 学时计入，且不占用原有课程学分 */
export const MODULE_HOURS = 16;

export interface SimPlan {
  major: string;
  targetJob: string;
  /** 课程名 → 调整后的总学时 */
  hours: Record<string, number>;
  /** 新增产业技能模块名称（必须在 skills 中） */
  modules: string[];
  /** 精简 / 移除的课程名 */
  removed: string[];
}

export interface SimMetrics {
  match: number;       // 目标岗位匹配度 0-100
  balance: number;     // 12 项毕业要求供需均衡度 0-100
  modern: number;      // 现代工程工具 / 前沿技能覆盖 0-100
  practice: number;    // 实践与拓展学时占比 0-100
  gapCount: number;    // 待调整知识点数
  totalHours: number;  // 总学时
}

export interface CourseRow {
  name: string; category: string; baseHours: number; hours: number;
  kpCount: number; action: '增加学时' | '压缩学时' | '移除' | '保持';
}

export interface SimResult {
  plan: SimPlan;
  jobTitle: string;
  before: SimMetrics;
  after: SimMetrics;
  radar: { dims: string[]; before: number[]; after: number[] };
  courseRows: CourseRow[];
  skillRows: { name: string; demand: number; before: number; after: number; coveredBy: string }[];
  advice: string[];
  evidence: { label: string; text: string }[];
}

const MODERN_SKILLS = new Set([
  'Git与CI/CD', 'Docker与容器化', '自动化测试', '微服务与分布式', 'React/Vue组件化',
  '大模型应用/RAG', '模型微调与部署', '深度学习与Transformer', 'Spark/Flink',
  '数据清洗与ETL', '知识图谱', 'AI伦理与合规', '数据可视化与BI',
]);

export function listMajors() { return majors.map((m) => ({ name: m.name, college: m.college, courses: m.courses.length })); }
export function listJobs() { return jobs.map((j) => ({ title: j.title, industry: j.industry, count: j.count, skills: j.skills.length })); }

/** 某专业的可调整课程清单 */
export function curriculumOf(majorName: string): CourseRow[] {
  const major = majors.find((m) => m.name === majorName) || majors[0];
  const rows: CourseRow[] = [];
  major.courses.forEach((cn) => {
    const c = courses.find((x) => x.name === cn);
    if (!c) return;
    rows.push({
      name: c.name, category: c.category, baseHours: c.hours, hours: c.hours,
      kpCount: c.knowledgePoints.length, action: '保持',
    });
  });
  return rows;
}

export function moduleCandidates(majorName: string, targetJob: string) {
  const job = jobs.find((j) => j.title === targetJob) || jobs[0];
  const major = majors.find((m) => m.name === majorName) || majors[0];
  const taught = new Set(major.courses.flatMap((cn) => courses.find((c) => c.name === cn)?.knowledgePoints || []));
  return skills
    .filter((s) => s.demand >= 80)
    .map((s) => ({
      name: s.name, demand: s.demand, trend: s.trend, category: s.category,
      inJob: job.skills.includes(s.name),
      aligned: Math.max(0, ...knowledgePoints.filter((k) => taught.has(k.name)).map((k) => alignScore(k.name, k.aliases, s.name))),
    }))
    .sort((a, b) => Number(b.inJob) - Number(a.inJob) || b.demand - a.demand)
    .slice(0, 16);
}

export function baselinePlan(majorName: string, targetJob: string): SimPlan {
  const major = majors.find((m) => m.name === majorName) || majors[0];
  const hours: Record<string, number> = {};
  major.courses.forEach((cn) => {
    const c = courses.find((x) => x.name === cn);
    if (c) hours[c.name] = c.hours;
  });
  return { major: major.name, targetJob: jobs.find((j) => j.title === targetJob)?.title || jobs[0].title, hours, modules: [], removed: [] };
}

interface KpState { name: string; aliases: string[]; demand: number; coverage: number; course: string }

function evaluate(plan: SimPlan): { metrics: SimMetrics; kps: KpState[]; skillRows: SimResult['skillRows']; courseRows: CourseRow[] } {
  const major = majors.find((m) => m.name === plan.major) || majors[0];
  const job = jobs.find((j) => j.title === plan.targetJob) || jobs[0];
  const courseRows: CourseRow[] = [];
  const kps: KpState[] = [];
  let totalHours = 0;
  let practiceHours = 0;

  major.courses.forEach((cn) => {
    const c = courses.find((x) => x.name === cn);
    if (!c) return;
    // 纵深防御：即使上层校验被绕过，也绝不把 NaN / 越界学时带入指标计算
    const raw = plan.hours[c.name] ?? c.hours;
    const newHours = Number.isFinite(raw) ? Math.round(Math.max(0, Math.min(200, raw))) : c.hours;
    const removed = plan.removed.includes(c.name);
    totalHours += removed ? 0 : newHours;
    if (!removed && (c.category === '实践' || c.category === '专业拓展')) practiceHours += newHours;
    const ratio = removed ? 0 : clamp(newHours / c.hours, 0, 2);
    const action: CourseRow['action'] = removed ? '移除' : newHours > c.hours ? '增加学时' : newHours < c.hours ? '压缩学时' : '保持';
    courseRows.push({ name: c.name, category: c.category, baseHours: c.hours, hours: removed ? 0 : newHours, kpCount: c.knowledgePoints.length, action });
    c.knowledgePoints.forEach((kn) => {
      const meta = knowledgePoints.find((k) => k.name === kn);
      if (!meta) return;
      kps.push({
        name: kn, aliases: meta.aliases, demand: meta.industryDemand, course: c.name,
        coverage: clamp((meta.hours * ratio) / 10, 0, 1),
      });
    });
  });

  totalHours += plan.modules.length * MODULE_HOURS;
  practiceHours += plan.modules.length * MODULE_HOURS;

  // 岗位技能覆盖：知识点语义对齐 × 教学覆盖 + 新增模块直接覆盖
  const skillRows: SimResult['skillRows'] = [];
  let weighted = 0, weightSum = 0;
  job.skills.forEach((sn) => {
    const s = skills.find((x) => x.name === sn);
    const demand = s?.demand ?? 70;
    let best = 0, coveredBy = '未覆盖';
    kps.forEach((k) => {
      const v = alignScore(k.name, k.aliases, sn) * (0.35 + 0.65 * k.coverage);
      if (v > best) { best = v; coveredBy = `${k.course} · ${k.name}`; }
    });
    plan.modules.forEach((m) => {
      const ms = skills.find((x) => x.name === m);
      const v = m === sn ? 0.96 : alignScore(m, ms?.aliases || [], sn) * 0.88;
      if (v > best) { best = v; coveredBy = `新增模块 · ${m}`; }
    });
    const pct = round1(clamp(best * 100));
    skillRows.push({ name: sn, demand, before: 0, after: pct, coveredBy });
    weighted += best * (demand / 100);
    weightSum += demand / 100;
  });
  const match = round1(clamp((weighted / Math.max(0.01, weightSum)) * 100));

  // 前沿/现代工具覆盖
  let mw = 0, msum = 0;
  MODERN_SKILLS.forEach((sn) => {
    const s = skills.find((x) => x.name === sn);
    const d = s?.demand ?? 70;
    let best = 0;
    kps.forEach((k) => { best = Math.max(best, alignScore(k.name, k.aliases, sn) * (0.35 + 0.65 * k.coverage)); });
    plan.modules.forEach((m) => {
      const ms = skills.find((x) => x.name === m);
      best = Math.max(best, m === sn ? 0.96 : alignScore(m, ms?.aliases || [], sn) * 0.85);
    });
    mw += best * d; msum += d;
  });
  const modern = round1(clamp((mw / Math.max(1, msum)) * 100));

  // 12 项毕业要求均衡度：新增实践型模块提升「现代工具 / 项目管理 / 沟通」覆盖
  const moduleBoost = Math.min(14, plan.modules.length * 2.4);
  const removalPenalty = Math.min(10, plan.removed.length * 2.5);
  const avgGap = competencies.reduce((acc, c) => {
    const boost = ['5', '11', '10', '9'].includes(c.code) ? moduleBoost : 0;
    return acc + Math.abs(c.industryWeight - Math.min(100, c.schoolWeight + boost));
  }, 0) / competencies.length;
  const balance = round1(clamp(100 - avgGap - removalPenalty));

  const practice = round1(clamp((practiceHours / Math.max(1, totalHours)) * 100));

  // 待调整知识点数：应加强 / 可精简 + 岗位技能中仍无覆盖的「应新增」
  const gapCount = kps.filter((k) => (k.demand >= 75 && k.coverage < 0.65) || k.demand <= 38).length
    + skillRows.filter((r) => r.after < 35).length;

  return {
    metrics: { match, balance, modern, practice, gapCount, totalHours },
    kps, skillRows, courseRows,
  };
}

export function simulate(plan: SimPlan): SimResult {
  const base = evaluate(baselinePlan(plan.major, plan.targetJob));
  const cur = evaluate(plan);
  const before = base.metrics;
  const after = cur.metrics;

  // 技能行的 before 来自基线评估
  const beforeBySkill = new Map(base.skillRows.map((r) => [r.name, r.after]));
  const skillRows = cur.skillRows.map((r) => ({ ...r, before: beforeBySkill.get(r.name) ?? 0 }));

  const dims = ['岗位匹配度', '能力均衡度', '现代工具覆盖', '实践学时占比', '缺口收敛度'];
  const gapScore = (m: SimMetrics) => round1(clamp(100 - m.gapCount * 3.2));
  const radar = {
    dims,
    before: [before.match, before.balance, before.modern, before.practice, gapScore(before)],
    after: [after.match, after.balance, after.modern, after.practice, gapScore(after)],
  };

  const advice: string[] = [];
  const dMatch = round1(after.match - before.match);
  const dHours = after.totalHours - before.totalHours;
  if (dMatch > 0) advice.push(`目标岗位「${plan.targetJob}」匹配度预计提升 **${dMatch} 分**（${before.match} → ${after.match}），主要由${plan.modules.length ? `新增模块 ${plan.modules.join('、')} ` : ''}与学时结构调整贡献。`);
  else if (dMatch < 0) advice.push(`当前方案会使岗位匹配度下降 **${Math.abs(dMatch)} 分**，建议恢复被移除课程或补充对应产业模块。`);
  else advice.push('当前方案对岗位匹配度没有明显影响，可继续调整学时或新增产业模块。');
  if (dHours !== 0) advice.push(`总学时由 ${before.totalHours} 调整为 **${after.totalHours}**（${dHours > 0 ? '+' : ''}${dHours}），需同步核对学分总量与师资排课约束。`);
  if (after.practice > before.practice) advice.push(`实践 / 拓展学时占比提升 **${round1(after.practice - before.practice)} 个百分点**，符合工程教育认证对复杂工程实践能力的要求。`);
  const weak = skillRows.filter((r) => r.after < 45).slice(0, 3);
  if (weak.length) advice.push(`仍需关注的低覆盖技能：${weak.map((r) => `${r.name}（${r.after}%）`).join('、')}，建议以项目式课程或企业真实案例补足。`);
  if (plan.removed.length) advice.push(`移除 ${plan.removed.join('、')} 前，请确认其知识点已由其他课程承接，避免形成新的能力断点。`);

  const evidence = [
    { label: '岗位 JD', text: `${plan.targetJob} · 核心技能 ${skillRows.length} 项，需求强度来自 ${jobCountLabel(plan.targetJob)} 条在招岗位样本文本` },
    { label: '对齐算法', text: '技能 ↔ 知识点采用「别名精确命中 + 字符二元组余弦 + 领域规则」跨域语义对齐，再乘以教学覆盖系数' },
    { label: '培养方案', text: `${plan.major} · ${curriculumOf(plan.major).length} 门课程 / ${new Set(cur.kps.map((k) => k.name)).size} 个知识点，学时来自课程大纲` },
    { label: '毕业要求', text: '工程教育认证 12 项毕业要求校内覆盖度 vs 岗位 JD 需求强度，新增模块对「现代工具 / 项目管理 / 沟通」产生增益' },
  ];

  return { plan, jobTitle: plan.targetJob, before, after, radar, courseRows: cur.courseRows, skillRows, advice, evidence };
}

function jobCountLabel(title: string) {
  return (jobs.find((j) => j.title === title)?.count ?? 0).toLocaleString();
}

/**
 * 带预算约束的贪心寻优：在「增加/压缩学时 + 新增产业模块」的候选动作空间里，
 * 每轮选择「单位学时成本带来的匹配度增益」最大的动作，直到预算耗尽或无正增益。
 */
export function autoOptimize(majorName: string, targetJob: string, extraHoursBudget = 48, maxSteps = 6): { plan: SimPlan; trace: string[] } {
  let plan = baselinePlan(majorName, targetJob);
  const baseHours = simulate(plan).before.totalHours;
  const ceiling = baseHours + extraHoursBudget;
  const trace: string[] = [];
  type Candidate = { plan: SimPlan; gain: number; cost: number; label: string };

  for (let step = 0; step < maxSteps; step += 1) {
    const state: { best: Candidate | null } = { best: null };
    const res0 = simulate(plan);
    const curMatch = res0.after.match;

    const tryCandidate = (candidate: SimPlan, label: string, cost: number) => {
      const res = simulate(candidate);
      if (res.after.totalHours > ceiling) return;
      const gain = res.after.match - curMatch;
      const efficiency = gain / Math.max(1, cost);
      const prev = state.best;
      if (gain > 0.15 && (!prev || efficiency > prev.gain / prev.cost || (efficiency === prev.gain / prev.cost && gain > prev.gain))) {
        state.best = { plan: candidate, gain, cost, label };
      }
    };

    // 候选动作 1：为岗位低覆盖技能新增产业模块
    const weakSkills = res0.skillRows.filter((r) => r.after < 70).sort((a, b) => b.demand - a.demand).slice(0, 5);
    weakSkills.forEach((r) => {
      if (plan.modules.includes(r.name) || plan.modules.length >= 4) return;
      tryCandidate({ ...plan, modules: [...plan.modules, r.name] }, `新增产业模块「${r.name}」`, MODULE_HOURS);
    });

    // 候选动作 2：为课程增加 8 学时（提升知识点教学覆盖）
    curriculumOf(majorName).forEach((c) => {
      if (plan.removed.includes(c.name)) return;
      const next = Math.min(96, (plan.hours[c.name] ?? c.baseHours) + 8);
      if (next === (plan.hours[c.name] ?? c.baseHours)) return;
      tryCandidate({ ...plan, hours: { ...plan.hours, [c.name]: next } }, `${c.name} +8 学时`, 8);
    });

    // 候选动作 3：压缩低需求课程 8 学时（成本按 1 计，释放学时预算）
    curriculumOf(majorName).forEach((c) => {
      if (plan.removed.includes(c.name)) return;
      const seat = courses.find((x) => x.name === c.name);
      const avgDemand = (seat?.knowledgePoints || []).reduce((s, kn) => s + (knowledgePoints.find((k) => k.name === kn)?.industryDemand ?? 50), 0) / Math.max(1, seat?.knowledgePoints.length || 1);
      if (avgDemand > 55) return;
      const next = Math.max(24, (plan.hours[c.name] ?? c.baseHours) - 8);
      if (next === (plan.hours[c.name] ?? c.baseHours)) return;
      tryCandidate({ ...plan, hours: { ...plan.hours, [c.name]: next } }, `${c.name} -8 学时`, 1);
    });

    if (!state.best) { trace.push(`第 ${step + 1} 轮：候选动作均无正增益，搜索收敛`); break; }
    const b = state.best;
    plan = b.plan;
    trace.push(`第 ${step + 1} 轮选择 ${b.label}，岗位匹配度 +${b.gain.toFixed(1)}（单位学时增益 ${(b.gain / b.cost).toFixed(2)}）`);
  }
  return { plan, trace };
}

/** 生成改革后的课程教学大纲（Markdown） */
export function generateSyllabus(courseName: string, plan?: SimPlan): string {
  const c = courses.find((x) => x.name === courseName);
  if (!c) return `# 未找到课程「${courseName}」`;
  const newHours = plan?.hours?.[courseName] ?? c.hours;
  const gaps = c.knowledgePoints.map((kn) => {
    const k = knowledgePoints.find((x) => x.name === kn);
    return { name: kn, demand: k?.industryDemand ?? 50, trend: k?.trend ?? 'flat', hours: k?.hours ?? 6, aliases: k?.aliases || [] };
  });
  const totalKpHours = gaps.reduce((s, g) => s + g.hours, 0);
  const scale = newHours / Math.max(1, totalKpHours);
  const modules = (plan?.modules || []).slice(0, 2);
  const lines: string[] = [];
  lines.push(`# 《${courseName}》课程教学大纲（改革建议稿）`);
  lines.push('');
  lines.push(`> 由谱合产教 AI 依据「产业岗位 JD × 知识点语义对齐 × 培养方案学时」自动生成，所有数值可复算。`);
  lines.push('');
  lines.push(`## 一、课程基本信息`);
  lines.push(`- 课程类别：${c.category}｜建议学分：${c.credits}｜现行学时：${c.hours}｜改革后学时：${newHours}`);
  lines.push(`- 覆盖知识点：${gaps.length} 个｜产业高需求（≥75）知识点：${gaps.filter((g) => g.demand >= 75).length} 个`);
  lines.push('');
  lines.push(`## 二、课程目标（对应工程教育认证毕业要求）`);
  lines.push(`1. 掌握 ${gaps.slice(0, 3).map((g) => g.name).join('、')} 等核心概念与工程化用法。`);
  lines.push(`2. 能够运用现代工具完成与「${gaps.filter((g) => g.demand >= 75).map((g) => g.name).slice(0, 2).join('、') || '课程核心知识'}」相关的端到端实践任务。`);
  lines.push(`3. 具备团队协作、规范化文档撰写与持续学习能力，理解工程伦理与社会影响。`);
  lines.push('');
  lines.push(`## 三、教学内容与学时分配`);
  lines.push(`| 序号 | 知识点 / 模块 | 产业需求强度 | 趋势 | 建议学时 | 教学要求 |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  gaps.forEach((g, i) => {
    const h = Math.max(2, Math.round(g.hours * scale));
    const req = g.demand >= 75 ? '应加强 · 引入产业案例与项目式实践' : g.demand <= 38 ? '可精简 · 压缩理论推导' : '保持 · 讲练结合';
    const trend = g.trend === 'up' ? '↑ 上升' : g.trend === 'down' ? '↓ 衰退' : '→ 平稳';
    lines.push(`| ${i + 1} | ${g.name} | ${g.demand} | ${trend} | ${h} | ${req} |`);
  });
  modules.forEach((m, i) => lines.push(`| 新${i + 1} | ${m}（产业模块） | ${skills.find((s) => s.name === m)?.demand ?? 90} | ↑ 上升 | ${MODULE_HOURS} | 应新增 · 校企共建，企业导师授课 |`));
  lines.push('');
  lines.push(`## 四、产业侧术语对齐（跨域语义映射）`);
  const mapped = gaps.filter((g) => g.aliases.length).slice(0, 6);
  lines.push(mapped.length ? mapped.map((g) => `- 「${g.name}」≈ ${g.aliases.join(' / ')}`).join('\n') : '- 本课程暂无显式产业同义表述，建议补充企业 JD 语料后重新生成。');
  lines.push('');
  lines.push(`## 五、考核方式（可测量、可追溯）`);
  lines.push(`- 过程性评价 40%：课堂测验 + 知识点达成度数据（对应各知识点目标层级）`);
  lines.push(`- 项目式实践 40%：以真实岗位任务为载体的端到端作品 + 代码/文档评审`);
  lines.push(`- 期末综合 20%：覆盖毕业要求指标点的综合能力测评`);
  lines.push('');
  lines.push(`## 六、证据来源`);
  lines.push(`- 《${courseName}课程教学大纲》：知识点与学时`);
  lines.push(`- 招聘 JD 语料库：技能需求强度与趋势`);
  lines.push(`- 《工程教育认证通用标准 · 12 项毕业要求》：课程目标映射`);
  lines.push(`- 改革沙盘模拟方案：${plan?.major ?? '未指定专业'} / ${plan?.targetJob ?? '未指定岗位'}`);
  return lines.join('\n');
}
