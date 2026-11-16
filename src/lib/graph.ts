/**
 * 三维递进式分析引擎 & 双侧三层图谱构建
 * 全部为确定性算法：相同的输入永远得到相同的输出，便于评委复现与验证。
 * 对应项目书 5.4 节：
 *   S(A,B) = 0.3 × J(A,B) + 0.4 × K(A,B) + 0.3 × G(A,B)
 */
import { majors, courses, knowledgePoints, jobs, skills, competencies } from './dataset';
import type { GraphPayload, SimilarityCell, GapItem, Layer, Side, Competency, Major, Job, KnowledgePoint } from './types';

const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));

/**
 * 性能与确定性：静态数据集下 alignScore / topologyVector / similarityMatrix 都是纯函数，
 * 结果可安全缓存。扩展专业目录后图谱调用量从 ~12×12 增长到 ~51×51，
 * 不缓存会造成 buildGraph('macro') 与自动寻优的明显卡顿。
 */
const CACHE_LIMIT = 30000;
const alignCache = new Map<string, number>();
const topologyCache = new Map<string, number[]>();
const majorKpCache = new Map<string, KnowledgePoint[]>();
let similarityCache: SimilarityCell[] | null = null;

/** 仅供测试 / 数据热更新时清空缓存 */
export function clearGraphCaches() {
  alignCache.clear();
  topologyCache.clear();
  majorKpCache.clear();
  similarityCache = null;
}

/** 专业覆盖的知识点集合：图谱构建时会被 M×J 次重复扫描，先按专业缓存 */
function kpsOfMajor(m: Major): KnowledgePoint[] {
  const cached = majorKpCache.get(m.id);
  if (cached) return cached;
  const scope = new Set(m.courses);
  const list = knowledgePoints.filter((k) => k.courseNames.some((cn) => scope.has(cn)));
  majorKpCache.set(m.id, list);
  return list;
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((x) => { if (B.has(x)) inter += 1; });
  return inter / (A.size + B.size - inter);
}

/** 知识点级重叠率：能发现「课程名称不同但知识点高度重叠」的隐性同质化 */
function knowledgeSetOf(majorCourseNames: string[]): Set<string> {
  const s = new Set<string>();
  courses.filter((c) => majorCourseNames.includes(c.name)).forEach((c) => c.knowledgePoints.forEach((k) => s.add(k)));
  return s;
}

export function knowledgeOverlap(a: string[], b: string[]): number {
  const A = knowledgeSetOf(a), B = knowledgeSetOf(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((x) => { if (B.has(x)) inter += 1; });
  return inter / (A.size + B.size - inter);
}

/** 轻量图拓扑相似度：以「课程所属类别 + 知识点共现邻接」构造向量，余弦相似度代替 Node2Vec 图嵌入 */
function topologyVector(majorCourseNames: string[]): number[] {
  const key = majorCourseNames.join('\u0001');
  const cached = topologyCache.get(key);
  if (cached) return cached;
  const dims = ['通识', '学科基础', '专业核心', '专业拓展', '实践'];
  const vec = dims.map((d) => courses.filter((c) => majorCourseNames.includes(c.name) && c.category === d).length);
  const kpList = knowledgePoints.map((k) => k.name);
  const kpSet = knowledgeSetOf(majorCourseNames);
  const sparse = kpList.map((k) => (kpSet.has(k) ? 1 : 0));
  const out = [...vec.map((v) => v / Math.max(1, vec.reduce((a, b) => a + b, 0))), ...sparse];
  if (topologyCache.size >= CACHE_LIMIT) topologyCache.clear();
  topologyCache.set(key, out);
  return out;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function topologySimilarity(a: string[], b: string[]): number {
  return clamp(cosine(topologyVector(a), topologyVector(b)));
}

/** 宏观维度：专业同质化综合评分 */
export function similarityMatrix(): SimilarityCell[] {
  // 返回浅拷贝：避免调用方原地排序污染缓存（缓存数组对外只读）
  if (similarityCache) return similarityCache.slice();
  const cells: SimilarityCell[] = [];
  for (let i = 0; i < majors.length; i += 1) {
    for (let j = i; j < majors.length; j += 1) {
      const A = majors[i], B = majors[j];
      const J = jaccard(A.courses, B.courses);
      const K = knowledgeOverlap(A.courses, B.courses);
      const G = topologySimilarity(A.courses, B.courses);
      cells.push({
        a: A.name, b: B.name,
        jaccard: +J.toFixed(3),
        knowledgeOverlap: +K.toFixed(3),
        topology: +G.toFixed(3),
        score: +(0.3 * J + 0.4 * K + 0.3 * G).toFixed(3),
      });
    }
  }
  similarityCache = cells;
  return cells.slice();
}

export function pairSimilarity(aName: string, bName: string): SimilarityCell {
  const found = similarityMatrix().find(
    (c) => (c.a === aName && c.b === bName) || (c.a === bName && c.b === aName),
  );
  return found || { a: aName, b: bName, jaccard: 0, knowledgeOverlap: 0, topology: 0, score: 0 };
}

/* ----------------------------------------------------------- 中观：能力偏差 */

export type CompetencyState = '高度匹配' | '部分匹配' | '培养不足' | '过度培养';
export interface CompetencyRow extends Competency {
  gap: number;
  state: CompetencyState;
  suggestion: string;
}

export function competencyDiagnosis(): CompetencyRow[] {
  return competencies.map((c) => {
    const gap = c.industryWeight - c.schoolWeight;
    let state: CompetencyState;
    if (gap >= 20) state = '培养不足';
    else if (gap <= -20) state = '过度培养';
    else if (Math.abs(gap) <= 10) state = '高度匹配';
    else state = '部分匹配';
    const suggestion = state === '培养不足'
      ? `建议在培养方案中补充「${c.name}」的可测量指标，并配套项目式实践环节`
      : state === '过度培养'
        ? `「${c.name}」校内覆盖充分而产业侧需求偏低，可适度压缩理论学时并转向应用情境`
        : `维持现有覆盖，建议补充过程性评价证据`;
    return { ...c, gap, state, suggestion };
  });
}

/* ----------------------------------------------------------- 微观：知识点缺口 */

/** 产业技能 → 课程知识点 的跨域语义对齐（同义词词典 + 字面重合 + 字符二元组相似度） */
export function bigrams(s: string): string[] {
  const clean = s.toLowerCase().replace(/[\s/（）()·、，,。；;：:_\-]/g, '');
  const out: string[] = [];
  for (let i = 0; i < clean.length - 1; i += 1) out.push(clean.slice(i, i + 2));
  if (clean.length === 1) out.push(clean);
  return out;
}

export function charCosine(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const map = new Map<string, number>();
  A.forEach((x) => map.set(x, (map.get(x) || 0) + 1));
  let dot = 0, nb = 0;
  B.forEach((x) => {
    const v = map.get(x) || 0;
    if (v) { dot += v; map.set(x, v - 1); }
    nb += 1;
  });
  return clamp(dot / Math.sqrt(A.length * nb));
}

/** 跨域语义对齐分数：别名精确命中 > 别名相似度 > 字面相似度 > 技能词频先验 */
/** 领域规则：教育侧学术表述 ↔ 产业侧工程表述。扩展专业目录后按产业域分组维护 */
const ALIGN_RULES: [RegExp, RegExp, number][] = [
  [/面向对象|类与对象|继承/, /Java|面向对象|OOP|后端/, 0.82],
  [/大语言模型|知识表示|Transformer/, /大模型|LLM|RAG|深度学习|知识图谱/, 0.9],
  [/软件测试|持续集成|版本控制/, /自动化测试|CI|Git|DevOps|测试开发/, 0.88],
  [/数据清洗|SQL|索引/, /ETL|数据|SQL|数据库/, 0.85],
  [/前端框架|HTML|REST/, /React|Vue|组件化|接口|API/, 0.86],
  [/BIM|GIS|无人机|空间/, /BIM|GIS|航测|数字孪生|空间/, 0.9],
  // 芯片 / 半导体
  [/半导体|MOS|光刻|Verilog|EDA|时序|载流子/, /芯片|IC设计|EDA|半导体|封测|RTL/, 0.92],
  // 网络空间安全
  [/密码学|加密|漏洞|渗透|等级保护|数据合规|哈希函数/, /渗透测试|安全合规|等保|密码学|数据安全/, 0.92],
  // 新能源与双碳
  [/储能|BMS|光伏|风电|氢能|碳足迹|碳资产|CCUS/, /储能|电池|光伏|风电|氢能|碳核算|ESG/, 0.9],
  // 低空 / 时空信息
  [/飞控|姿态|航迹|路径规划|空域|遥感|GNSS|时空索引/, /无人机|飞控|低空|遥感|北斗|时空/, 0.9],
  // 医疗健康
  [/医学影像|生理信号|电子病历|医疗器械|临床|护理|口腔/, /医学影像AI|临床数据|健康大数据|医疗器械|辅助诊断/, 0.9],
  // 数字经济 / 金融科技
  [/智能风控|支付清算|量化|数据治理|数据确权|用户增长|财务报表/, /金融科技|数据资产|AIGC|数字营销|风控/, 0.88],
  // 智能制造
  [/机器人运动学|示教|MES|柔性产线|工业数据采集|数字孪生|机器视觉/, /工业机器人|机器视觉|数字孪生|智能制造|SCADA/, 0.9],
  // 工业软件 / 仿真
  [/几何建模|有限元|CAE|工业软件|模型驱动/, /工业软件|CAE|仿真/, 0.9],
  // 智能建造 / 智慧水利
  [/装配式|BIM协同|智能施工|水文遥测|碳足迹/, /智能建造|BIM|智慧水利|碳核算/, 0.88],
  // 教育 / 交叉学科
  [/智能导学|学习分析|教育大模型|儿童发展/, /AI教育|智能导学|学前教育|学习分析/, 0.9],
  [/分子模拟|高通量筛选|AI辅助合成|晶体结构|材料表征/, /AI制药|新材料|分子模拟/, 0.9],
  // 数字内容 / 文法
  [/音频信号处理|视频编码|智能剪辑|三维建模|交互设计|传播模型/, /AIGC|内容生产|数字营销|交互设计/, 0.88],
  [/污染控制|环境监测|水处理/, /碳核算|环保|环境/, 0.84],
  [/知识产权法|合同法|民法/, /法律合规|知识产权/, 0.86],
];

export function alignScore(kpName: string, aliases: string[], skillName: string): number {
  const key = `${kpName}\u0001${aliases.join('\u0002')}\u0001${skillName}`;
  const cached = alignCache.get(key);
  if (cached !== undefined) return cached;

  let best = charCosine(kpName, skillName) * 0.6;
  aliases.forEach((alias) => {
    best = Math.max(best, charCosine(alias, skillName) * 0.95);
    if (skillName.includes(alias) || alias.includes(skillName)) best = Math.max(best, 0.94);
  });
  const haystack = kpName + aliases.join('');
  ALIGN_RULES.forEach(([ra, rb, score]) => {
    if (ra.test(haystack) && rb.test(skillName)) best = Math.max(best, score);
  });
  const result = +best.toFixed(3);
  if (alignCache.size >= CACHE_LIMIT) alignCache.clear();
  alignCache.set(key, result);
  return result;
}

export function knowledgeGaps(courseName: string): GapItem[] {
  const course = courses.find((c) => c.name === courseName);
  if (!course) return [];
  const skillVec = skills.map((s) => ({ name: s.name, demand: s.demand, aliases: s.aliases }));
  const items: GapItem[] = course.knowledgePoints.flatMap((name) => {
    // 防御：课程引用了未登记的孤立知识点时不抛异常，直接跳过并在诊断结果中缺失
    const kp = knowledgePoints.find((k) => k.name === name);
    if (!kp) return [];
    const matches = skillVec
      .map((s) => ({ ...s, sim: alignScore(name, kp.aliases, s.name) }))
      .filter((s) => s.sim >= 0.32)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3);
    const demand = matches.length
      ? Math.round(matches.reduce((acc, s) => acc + s.demand * s.sim, 0) / matches.reduce((acc, s) => acc + s.sim, 0))
      : kp.industryDemand;
    const coverage = clamp(kp.hours / 10);
    let label: GapItem['label'];
    let reason: string;
    if (demand >= 75 && coverage < 0.65) {
      label = '应加强'; reason = `产业需求强度 ${demand}，当前仅 ${kp.hours} 学时，建议增加课时并引入产业案例/实践环节`;
    } else if (demand >= 75 && coverage >= 0.65 && kp.trend === 'up') {
      label = '应加强'; reason = `产业需求强度 ${demand} 且处于上升趋势，建议升级教学内容至工程化用法`;
    } else if (demand <= 38) {
      label = '可精简'; reason = `产业需求强度仅 ${demand}（${kp.trend === 'down' ? '衰退技能' : '低频'}），建议压缩 ${Math.max(2, Math.round(kp.hours * 0.3))} 学时`;
    } else {
      label = '保持'; reason = `产业需求 ${demand}，教学覆盖 ${kp.hours} 学时，供需基本平衡`;
    }
    return [{
      name, course: courseName, hours: kp.hours, demand,
      coverage: +coverage.toFixed(2), label, reason,
      evidence: matches.map((m) => `${m.name}（对齐度 ${m.sim}）`),
    }];
  });
  // 应新增：产业侧高频技能，且与本课程领域相关，但课程知识体系未覆盖
  // 关键约束：只保留与「课程名 / 本课程知识点 / 知识点的产业同义表述」有语义关联的技能，
  // 避免把 Java、Python 这类通用编程语言错误塞进《数据结构》等课程。
  const allKpNames = new Set(knowledgePoints.map((k) => k.name));
  const courseTerms = Array.from(new Set([
    courseName,
    ...course.knowledgePoints,
    ...course.knowledgePoints.flatMap((n) => knowledgePoints.find((k) => k.name === n)?.aliases || []),
  ]));
  const courseAliases = new Set(course.knowledgePoints.flatMap((n) => [n, ...(knowledgePoints.find((k) => k.name === n)?.aliases || [])]));
  const GENERIC_CATEGORIES = new Set(['编程语言', '软技能', '产品']);
  skills
    .filter((s) => s.demand >= 85 && !GENERIC_CATEGORIES.has(s.category))
    .filter((s) => !allKpNames.has(s.name) && !courseAliases.has(s.name))
    .filter((s) => !Array.from(courseAliases).some((a) => alignScore(a, [], s.name) > 0.75))
    .filter((s) => {
      const terms = [s.name, ...s.aliases];
      return terms.some((t) => courseTerms.some((c) => c.includes(t) || t.includes(c) || alignScore(c, [], t) >= 0.42));
    })
    .sort((a, b) => b.demand - a.demand)
    .slice(0, 2)
    .forEach((s) => {
      items.push({
        name: s.name, course: courseName, hours: 0, demand: s.demand, coverage: 0,
        label: '应新增', reason: `产业需求强度 ${s.demand}，且与本课程领域直接相关但教学体系未覆盖，建议新增模块或融入现有章节`,
        evidence: [`技能标签「${s.name}」在 ${jobs.filter((j) => j.skills.includes(s.name)).length} 类岗位 JD 中出现`],
      });
    });
  return items.sort((a, b) => ({ 应新增: 0, 应加强: 1, 保持: 2, 可精简: 3 }[a.label] - { 应新增: 0, 应加强: 1, 保持: 2, 可精简: 3 }[b.label]));
}

/* ----------------------------------------------------------- 图谱构建 */

export const layerNames: Record<Layer, string> = {
  macro: '宏观层 · 专业—课程关系图谱',
  meso: '中观层 · 培养目标—岗位能力对齐图谱',
  micro: '微观层 · 知识点—岗位技能映射图谱',
};

export const sideNames: Record<Side, string> = {
  supply: '高校供给侧',
  demand: '产业需求侧',
};

export function buildGraph(layer: Layer, sides: Side[] = ['supply', 'demand'], focusMajor = '计算机科学与技术'): GraphPayload {
  const categories = [
    { name: '专业', color: '#3461f4' },
    { name: '课程', color: '#5b8def' },
    { name: '知识点', color: '#8eaeff' },
    { name: '培养目标/能力', color: '#16a34a' },
    { name: '岗位', color: '#e8843c' },
    { name: '技能', color: '#f0a868' },
  ];
  const nodeMap = new Map<string, GraphPayload['nodes'][number]>();
  const links: GraphPayload['links'] = [];
  const addNode = (n: GraphPayload['nodes'][number]) => { if (!nodeMap.has(n.id)) nodeMap.set(n.id, n); };
  const addLink = (l: GraphPayload['links'][number]) => {
    if (nodeMap.has(l.source) && nodeMap.has(l.target) && l.source !== l.target) links.push(l);
  };
  const focus = majors.find((m) => m.name === focusMajor) || majors[0];

  if (layer === 'macro') {
    if (sides.includes('supply')) {
      majors.forEach((m) => addNode({
        id: `m:${m.id}`, name: m.name, category: 0, side: 'supply', layer,
        value: m.students, symbolSize: 26 + Math.sqrt(m.students) / 2,
        meta: { 类型: '专业', 学院: m.college, '在校生': m.students, '课程数': m.courses.length },
      }));
      courses.forEach((c) => addNode({
        id: `c:${c.id}`, name: c.name, category: 1, side: 'supply', layer,
        value: c.hours, symbolSize: 12 + c.hours / 16,
        meta: { 类型: '课程', 学分: c.credits, 学时: c.hours, 类别: c.category },
      }));
      majors.forEach((m) => m.courses.forEach((cn) => {
        const c = courses.find((x) => x.name === cn);
        if (c) addLink({ source: `m:${m.id}`, target: `c:${c.id}`, relation: '包含', weight: 1, layer });
      }));
    }
    if (sides.includes('demand')) {
      const groups = Array.from(new Set(jobs.map((j) => j.industry)));
      groups.forEach((g) => addNode({
        id: `g:${g}`, name: `${g}岗位群`, category: 4, side: 'demand', layer,
        value: jobs.filter((j) => j.industry === g).length, symbolSize: 30,
        meta: { 类型: '岗位类别', 岗位数: jobs.filter((j) => j.industry === g).length },
      }));
      jobs.forEach((j) => {
        addNode({
          id: `j:${j.id}`, name: j.title, category: 4, side: 'demand', layer,
          value: j.count, symbolSize: 16 + Math.sqrt(j.count) / 4,
          meta: { 类型: '岗位', 在招: j.count, 薪资: j.salary, 地区: j.region },
        });
        addLink({ source: `g:${j.industry}`, target: `j:${j.id}`, relation: '归属', weight: 1, layer });
      });
      // 跨侧对齐：专业 ↔ 岗位（按技能匹配度）
      majors.forEach((m) => jobs.forEach((j) => {
        const score = crossSideMatch(m, j);
        if (score >= 0.34) addLink({ source: `m:${m.id}`, target: `j:${j.id}`, relation: '产教对齐', weight: +score.toFixed(2), layer });
      }));
    }
  }

  if (layer === 'meso') {
    if (sides.includes('supply')) {
      addNode({ id: 'major:focus', name: focus.name, category: 0, side: 'supply', layer, value: 100, symbolSize: 42, meta: { 类型: '专业', 学院: focus.college } });
      focus.objectives.forEach((o, i) => {
        addNode({ id: `o:${i}`, name: o.length > 18 ? `${o.slice(0, 17)}…` : o, category: 3, side: 'supply', layer, value: 60, symbolSize: 20, meta: { 类型: '培养目标', 原文: o } });
        addLink({ source: 'major:focus', target: `o:${i}`, relation: '培养目标', weight: 1, layer });
      });
      competencies.forEach((c) => {
        addNode({ id: `comp:${c.id}`, name: `${c.code}. ${c.name}`, category: 3, side: 'supply', layer, value: c.schoolWeight, symbolSize: 12 + c.schoolWeight / 6, meta: { 类型: '毕业要求', '校内覆盖度': c.schoolWeight, '产业需求度': c.industryWeight } });
        const related = focus.objectives.findIndex((o) => /工具|团队|沟通|学习|设计|分析|规范|社会|环境|项目/.test(o) && o.length > 0);
        addLink({ source: `o:${Math.max(0, related)}`, target: `comp:${c.id}`, relation: '支撑', weight: c.schoolWeight / 100, layer });
      });
    }
    if (sides.includes('demand')) {
      jobs.slice(0, 7).forEach((j) => {
        addNode({ id: `j:${j.id}`, name: j.title, category: 4, side: 'demand', layer, value: j.count, symbolSize: 18 + Math.sqrt(j.count) / 5, meta: { 类型: '岗位', 在招: j.count, 薪资: j.salary } });
        j.skills.slice(0, 5).forEach((sn) => {
          const s = skills.find((x) => x.name === sn);
          if (!s) return;
          addNode({ id: `s:${s.id}`, name: s.name, category: 5, side: 'demand', layer, value: s.demand, symbolSize: 10 + s.demand / 9, meta: { 类型: '岗位能力要求', 需求强度: s.demand, 趋势: s.trend } });
          addLink({ source: `j:${j.id}`, target: `s:${s.id}`, relation: '要求', weight: s.demand / 100, layer });
        });
      });
      competencies.forEach((c) => {
        const best = skills.find((s) => charCosine(c.name, s.name) > 0.3) || skills[0];
        addLink({ source: `comp:${c.id}`, target: `s:${best.id}`, relation: c.industryWeight - c.schoolWeight >= 20 ? '能力缺失' : '语义对齐', weight: +clamp(1 - Math.abs(c.industryWeight - c.schoolWeight) / 100).toFixed(2), layer });
      });
    }
  }

  if (layer === 'micro') {
    if (sides.includes('supply')) {
      const focusCourses = focus.courses.slice(0, 8);
      focusCourses.forEach((cn) => {
        const c = courses.find((x) => x.name === cn);
        if (!c) return;
        addNode({ id: `c:${c.id}`, name: c.name, category: 1, side: 'supply', layer, value: c.hours, symbolSize: 24, meta: { 类型: '课程', 学时: c.hours, 学分: c.credits } });
        c.knowledgePoints.forEach((kn) => {
          const k = knowledgePoints.find((x) => x.name === kn);
          if (!k) return;
          addNode({ id: `k:${k.id}`, name: k.name, category: 2, side: 'supply', layer, value: k.industryDemand, symbolSize: 10 + k.hours * 0.8, meta: { 类型: '知识点', 学时: k.hours, 认知层级: k.bloom, '产业需求': k.industryDemand, 趋势: k.trend } });
          addLink({ source: `c:${c.id}`, target: `k:${k.id}`, relation: '包含知识点', weight: 1, layer });
        });
      });
    }
    if (sides.includes('demand')) {
      skills.filter((s) => s.demand >= 62).forEach((s) => {
        addNode({ id: `s:${s.id}`, name: s.name, category: 5, side: 'demand', layer, value: s.demand, symbolSize: 10 + s.demand / 8, meta: { 类型: '岗位技能', 需求强度: s.demand, 趋势: s.trend, 类别: s.category } });
      });
      knowledgePoints.filter((k) => k.courseNames.some((cn) => focus.courses.includes(cn))).forEach((k) => {
        skills.forEach((s) => {
          const score = alignScore(k.name, k.aliases, s.name);
          if (score >= 0.62 && nodeMap.has(`s:${s.id}`)) {
            addLink({ source: `k:${k.id}`, target: `s:${s.id}`, relation: score >= 0.85 ? '强匹配' : '语义对齐', weight: score, layer });
          }
        });
      });
    }
  }

  return { nodes: Array.from(nodeMap.values()), links, categories };
}

/** 专业—岗位跨侧匹配度：以知识点/技能对齐分数的加权平均近似 */
export function crossSideMatch(m: Major, j: Job): number {
  if (!j) return 0;
  const kps = kpsOfMajor(m);
  if (!kps.length) return 0;
  let total = 0;
  j.skills.forEach((sn) => {
    const s = skills.find((x) => x.name === sn);
    if (!s) return;
    total += Math.max(...kps.map((k) => alignScore(k.name, k.aliases, s.name))) * (s.demand / 100);
  });
  return clamp(total / Math.max(1, j.skills.length));
}
