/**
 * 交付物导出（CSV）
 * --------------------------------------------------------------------------
 * 把「诊断结论」变成教务能直接导入的表格：课程 × 知识点 × 学时 × 缺口建议。
 * 选 CSV 而非 xlsx：零依赖、Excel / WPS 直开、可进教务系统批量导入；
 * 文件头写入 UTF-8 BOM，避免中文在 Excel 里变乱码。
 *
 * 两种导出：
 *  - course：课程-知识点矩阵（含改革后学时与缺口判定）
 *  - match：岗位技能 × 知识点对齐明细（用于论证「为什么这门课要加学时」）
 */
import { courses, jobs, knowledgePoints, majors, skills } from './dataset';
import { alignScore, crossSideMatch, knowledgeGaps } from './graph';
import { baselinePlan, simulate } from './simulator';
import type { SimPlan } from './simulator';

const BOM = '\uFEFF';

/** RFC4180 转义：含逗号 / 引号 / 换行的字段用双引号包裹并转义内部引号 */
function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(head: string[], rows: unknown[][]): string {
  return BOM + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** 未指定目标岗位时，按与 /majors 一致的口径取契合度最高的岗位 */
export function resolveJob(majorName: string, jobTitle?: string): string {
  const major = majors.find((m) => m.name === majorName);
  if (!major) return jobs[0]?.title ?? '';
  if (jobTitle && jobs.some((j) => j.title === jobTitle)) return jobTitle;
  let best = jobs[0]?.title ?? '';
  let bestScore = -1;
  jobs.forEach((j) => {
    const s = crossSideMatch(major, j);
    if (s > bestScore) { bestScore = s; best = j.title; }
  });
  return best;
}

export interface ExportResult {
  filename: string;
  csv: string;
  rows: number;
}

/**
 * 课程-知识点矩阵。
 * plan 传入时使用沙盘当前学时（即「改革后」），否则按基线学制导出。
 */
export function buildCourseMatrixCsv(majorName: string, jobTitle?: string, plan?: Partial<SimPlan>): ExportResult | null {
  const major = majors.find((m) => m.name === majorName);
  if (!major) return null;
  const targetJob = resolveJob(major.name, jobTitle || plan?.targetJob);

  const base = baselinePlan(major.name, targetJob);
  const merged: SimPlan = {
    major: major.name,
    targetJob,
    hours: plan?.hours && Object.keys(plan.hours).length ? { ...base.hours, ...plan.hours } : base.hours,
    modules: plan?.modules ?? base.modules,
    removed: plan?.removed ?? base.removed,
  };

  // 用同一个确定性内核算出「现行 / 改革后」两组指标，保证导出的数就是页面上的数
  const result = simulate(merged);
  const hoursById = new Map(result.courseRows.map((r) => [r.name, r]));

  const head = [
    '专业', '专业代码', '学院', '目标岗位',
    '课程', '课程类别', '学分', '现行学时', '改革后学时', '学时变化',
    '知识点', '知识点学时', 'Bloom层次', '产业需求强度', '覆盖度', '缺口判定', '调整建议', '对齐产业技能',
  ];
  const rows: unknown[][] = [];

  major.courses.forEach((cn) => {
    const course = courses.find((c) => c.name === cn);
    if (!course) return;
    const row = hoursById.get(course.name);
    const newHours = row?.hours ?? course.hours;
    // 传入改革后学时：覆盖度与缺口判定随之重算，保证表格内部自洽
    const gapByName = new Map(knowledgeGaps(course.name, { hours: newHours }).map((g) => [g.name, g]));
    course.knowledgePoints.forEach((kn) => {
      const kp = knowledgePoints.find((k) => k.name === kn);
      const gap = gapByName.get(kn);
      rows.push([
        major.name, major.code, major.college, targetJob,
        course.name, course.category, course.credits,
        row?.baseHours ?? course.hours,
        row?.hours ?? course.hours,
        (row?.hours ?? course.hours) - (row?.baseHours ?? course.hours),
        kn,
        kp?.hours ?? '',
        kp?.bloom ?? '',
        gap?.demand ?? kp?.industryDemand ?? '',
        gap?.coverage ?? '',
        gap?.label ?? '',
        gap?.reason ?? '',
        (gap?.evidence ?? []).join('；'),
      ]);
    });
  });

  if (!rows.length) return null;
  return {
    filename: `谱合产教_课程知识点矩阵_${major.name}.csv`,
    csv: toCsv(head, rows),
    rows: rows.length,
  };
}

/** 岗位技能 × 知识点对齐明细 */
export function buildMatchCsv(majorName: string, jobTitle?: string): ExportResult | null {
  const major = majors.find((m) => m.name === majorName);
  if (!major) return null;
  const targetJob = resolveJob(major.name, jobTitle);
  const job = jobs.find((j) => j.title === targetJob);
  if (!job) return null;

  const scope = new Set(major.courses);
  const kps = knowledgePoints.filter((k) => k.courseNames.some((cn) => scope.has(cn)));

  const head = ['专业', '专业代码', '目标岗位', '行业', '岗位技能', '技能类别', '需求强度', '最相近知识点', '对齐度', '加权贡献', '知识点所在课程'];
  const rows: unknown[][] = [];

  job.skills.forEach((sn) => {
    const s = skills.find((x) => x.name === sn);
    if (!s) return;
    let best: { kp: (typeof knowledgePoints)[number] | null; align: number } = { kp: null, align: 0 };
    kps.forEach((k) => {
      const score = alignScore(k.name, k.aliases, sn);
      if (score > best.align) best = { kp: k, align: score };
    });
    rows.push([
      major.name, major.code, job.title, job.industry,
      sn, s.category, s.demand,
      best.kp?.name ?? '—',
      +best.align.toFixed(3),
      +(best.align * (s.demand / 100)).toFixed(3),
      best.kp?.courseNames.filter((c) => scope.has(c)).join('、') ?? '',
    ]);
  });

  if (!rows.length) return null;
  return {
    filename: `谱合产教_岗位技能对齐明细_${major.name}_${job.title}.csv`,
    csv: toCsv(head, rows),
    rows: rows.length,
  };
}
