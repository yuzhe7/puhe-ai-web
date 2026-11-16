import { NextRequest } from 'next/server';
import { majors, courses, jobs, skills, knowledgePoints, demoStats } from '@/lib/dataset';
import { crossSideMatch, similarityMatrix } from '@/lib/graph';
import { groupOf, majorMeta, MAJOR_GROUPS, MAJOR_SOURCES } from '@/lib/hot-majors';
import { buildTaxonomy, classifyMajor, DISCIPLINE_CATEGORIES } from '@/lib/major-taxonomy';
import { dataIntegrityReport, safeString, checkRateLimit, clientIp, rateLimitResponse } from '@/lib/validation';

export const runtime = 'nodejs';

/* ------------------------------------------------------------------ 静态口径 */
/** 与请求参数无关的白名单、元信息与文案，只构建一次 */
const VALID_GROUPS = new Set<string>(MAJOR_GROUPS);
const VALID_TAGS = new Set<string>([...Object.values(majorMeta).map((m) => m.tag), '试点基础']);
const VALID_DISCIPLINES = new Set(DISCIPLINE_CATEGORIES.map((c) => c.id));
const TAG_LIST = Array.from(VALID_TAGS);
const DISCIPLINE_META = DISCIPLINE_CATEGORIES.map(({ id, name, kind, description }) => ({ id, name, kind, description }));
const SOURCES = MAJOR_SOURCES;
const STATS = {
  majors: majors.length, courses: courses.length, knowledgePoints: knowledgePoints.length,
  jobs: jobs.length, skills: skills.length, jdTotal: demoStats.jdTotal,
  catalogMajorCount: demoStats.majorCount,
};
const DISCLAIMER = '专业目录取自公开权威资料口径，课程/学时/在招数/薪资为教学演示抽样数据，非真实统计；系统未穷尽全国 845 种本科专业；标注「观察池」的专业仅为学科目录覆盖演示，不表示试点校实际开设，试点校实际专业为 12 个抽样专业。';

/** 一次遍历计数，替代「对每个分组各 filter 一次」的 O(n²) */
function countBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/** 非法枚举值不再静默产生 0 结果：忽略该条件并回传警告 */
function normalize(raw: string, valid: ReadonlySet<string>, label: string, warnings: string[]): string {
  if (!raw) return '';
  if (valid.has(raw)) return raw;
  warnings.push(`${label}「${raw}」不存在，已忽略`);
  return '';
}

interface SearchableRow {
  name: string; code: string; college: string; category: string; courses: string[];
}
function matchesQuery(r: SearchableRow, q: string): boolean {
  return !q || `${r.name} ${r.code} ${r.college} ${r.category} ${r.courses.join(' ')}`.toLowerCase().includes(q);
}

/* ------------------------------------------------------------------ 全量快照 */
/**
 * 演示数据集是静态 TS 常量：专业行、归类统计、完整性自检都与筛选参数无关，
 * 因此按进程缓存一次，每次请求只做参数规范化、过滤与分面计数。
 * 索引化说明：
 *  - courseByName：按课程名直接取课程，替代每个专业遍历全部 109 门课；
 *  - riskByMajor：一次遍历相似度矩阵得出每个专业的最高同质化对象，替代 62 次全矩阵扫描。
 * 若将来接入动态教务数据源，需在此处增加失效机制。
 */
function createSnapshot() {
  const courseByName = new Map(courses.map((c) => [c.name, c]));
  const riskByMajor = new Map<string, { other: string; score: number }>();
  for (const cell of similarityMatrix()) {
    if (cell.a === cell.b) continue;
    const pairs: [string, string][] = [[cell.a, cell.b], [cell.b, cell.a]];
    for (const [name, other] of pairs) {
      const current = riskByMajor.get(name);
      if (!current || cell.score > current.score) riskByMajor.set(name, { other, score: cell.score });
    }
  }

  const rows = majors.map((m) => {
    const meta = groupOf(m.name);
    const owned = m.courses
      .map((n) => courseByName.get(n))
      .filter((c): c is (typeof courses)[number] => c !== undefined);
    const kpSet = new Set(owned.flatMap((c) => c.knowledgePoints));
    const matched = jobs
      .map((j) => ({ title: j.title, industry: j.industry, score: +crossSideMatch(m, j).toFixed(2) }))
      .filter((x) => x.score >= 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    // 学科大类归类：精确映射 → 关键词规则 → 兜底，依据一并回传便于审计
    const cls = classifyMajor({
      name: m.name, code: m.code, college: m.college, category: m.category,
      students: m.students, heat: meta.heat, courses: m.courses,
    });
    return {
      name: m.name, code: m.code, college: m.college, category: m.category, students: m.students,
      group: meta.group, sourceId: meta.sourceId, tag: meta.tag, heat: meta.heat,
      // 口径分层：试点校抽样专业 vs 全国学科目录观察池（后者不表示试点校实际开设）
      scope: meta.sourceId === 'pilot' ? '试点校' : '观察池',
      courseCount: owned.length, kpCount: kpSet.size, objectives: m.objectives,
      courses: m.courses, matchedJobs: matched,
      discipline: cls.id, disciplineName: cls.name, disciplineKind: cls.kind,
      disciplineBy: cls.matchedBy, disciplineEvidence: cls.evidence,
      topRisk: riskByMajor.get(m.name) || null,
    };
  });

  const byGroup = countBy(rows, (r) => r.group);
  const byTag = countBy(rows, (r) => r.tag);
  return {
    rows,
    // 归类统计基于全量 rows，不受筛选影响（供总览卡片与分类分布图使用）
    taxonomy: buildTaxonomy(rows),
    groupStats: MAJOR_GROUPS.map((g) => ({ name: g, count: byGroup.get(g) || 0 })),
    tagStats: Array.from(byTag, ([name, count]) => ({ name, count })),
    integrity: dataIntegrityReport(),
  };
}

let snapshot: ReturnType<typeof createSnapshot> | null = null;
function getSnapshot() {
  if (!snapshot) snapshot = createSnapshot();
  return snapshot;
}

/** 专业目录：来源可追溯 + 学科大类自动归类 + 课程/知识点覆盖 + 岗位匹配 + 数据完整性自检 */
export async function GET(req: NextRequest) {
  const rl = checkRateLimit(`majors:${clientIp(req.headers)}`, 120);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  // 命令面板专用精简清单：只在用户首次唤起 ⌘K 时拉取一次，避免数据集进入首屏 bundle
  if (req.nextUrl.searchParams.get('brief') === '1') {
    return Response.json({
      majors: majors.map((m) => ({ name: m.name, code: m.code, college: m.college, category: m.category })),
      courses: courses.map((c) => ({ name: c.name, credits: c.credits, hours: c.hours, category: c.category, keywords: `${c.name} ${c.knowledgePoints.join(' ')}` })),
      jobs: jobs.map((j) => ({ title: j.title, industry: j.industry, count: j.count, keywords: `${j.title} ${j.skills.join(' ')}` })),
    });
  }

  const rawQ = req.nextUrl.searchParams.get('q') ?? '';
  const q = safeString(rawQ, 60).toLowerCase();
  const filterWarnings: string[] = [];
  if (rawQ.length > 60) filterWarnings.push('搜索词超过 60 字，已截断');
  const group = normalize(safeString(req.nextUrl.searchParams.get('group'), 40), VALID_GROUPS, '来源分类', filterWarnings);
  const tag = normalize(safeString(req.nextUrl.searchParams.get('tag'), 20), VALID_TAGS, '标签', filterWarnings);
  const discipline = normalize(safeString(req.nextUrl.searchParams.get('discipline'), 40), VALID_DISCIPLINES, '学科大类', filterWarnings);

  const { rows, taxonomy, groupStats, tagStats, integrity } = getSnapshot();

  const filtered = rows.filter((r) =>
    (!group || r.group === group) &&
    (!tag || r.tag === tag) &&
    (!discipline || r.discipline === discipline) &&
    matchesQuery(r, q));

  // 分面计数：排除该控件自身的筛选维度，统计「当前其他条件下各可选项还剩多少」
  const groupBase = rows.filter((r) => (!tag || r.tag === tag) && (!discipline || r.discipline === discipline) && matchesQuery(r, q));
  const groupCounts = countBy(groupBase, (r) => r.group);
  const groupFacets = MAJOR_GROUPS.map((g) => ({ name: g, count: groupCounts.get(g) || 0 }));

  const disciplineBase = rows.filter((r) => (!group || r.group === group) && (!tag || r.tag === tag) && matchesQuery(r, q));
  const disciplineCounts = countBy(disciplineBase, (r) => r.discipline);
  const disciplineOptions = DISCIPLINE_META
    .filter((c) => c.id !== 'other' || taxonomy.unclassified > 0)
    .map((c) => ({ ...c, count: disciplineCounts.get(c.id) || 0 }));

  return Response.json({
    rows: filtered,
    total: rows.length,
    matched: filtered.length,
    groupStats, groupFacets, tagStats,
    tags: TAG_LIST,
    filterWarnings,
    normalizedFilters: { group, tag, discipline },
    taxonomy,
    disciplineOptions,
    sources: SOURCES,
    integrity,
    stats: STATS,
    disclaimer: DISCLAIMER,
  });
}
