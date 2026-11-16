/**
 * 专业学科大类自动归类（v7）
 * --------------------------------------------------------------------------
 * 与 hot-majors.ts 的「来源分类」不同：这里按**学科门类**归类，服务于
 * 「计算机 / 电力工程 / 电气自动化 / 交通工程 / 经济贸易 / 法学 / 医学」
 * 七个指定类，其余专业由规则引擎自动归类并生成可读总结。
 *
 * 归类口径（三级优先，保证 100% 覆盖、结果可复现）：
 *  ① 精确映射：对当前收录的 62 个专业逐一指定，避免关键词歧义
 *     （例如「电气工程及其自动化」归电力工程而非电气自动化；v8 法学门类
 *      8 个新增专业含「经济/国际」字样，必须由精确映射锁定到法学）；
 *  ② 语义关键词：未来新增专业按名称 + 学院 + 现有学科类 + 课程体系匹配，
 *     指定类优先于自动类，长关键词优先，避免「智能」误命中多个类；
 *  ③ 兜底「其他交叉专业」：任何未命中项都保留在统计里，绝不静默丢弃。
 *
 * 本模块是纯函数，不依赖数据库与大模型；新增专业后无需改 UI，
 * 只要名字命中关键词就会自动进入对应大类并出现在总结里。
 */
import type { Major } from './types';

export type TaxonomyKind = 'specified' | 'auto';

export interface DisciplineCategory {
  id: string;
  name: string;
  kind: TaxonomyKind;
  /** 归类口径说明，展示在目录页 */
  description: string;
  /** 新增专业自动归类时使用的关键词（按数组顺序优先） */
  keywords: readonly string[];
}

/** 7 个指定类 + 6 个自动类 + 1 个兜底类；顺序即页面展示与匹配优先级 */
export const DISCIPLINE_CATEGORIES: readonly DisciplineCategory[] = [
  {
    id: 'computer', name: '计算机', kind: 'specified',
    description: '计算机、软件、数据、网络空间安全、人工智能与数字媒体技术',
    keywords: ['计算机科学与技术', '软件工程', '数据科学与大数据技术', '网络空间安全', '人工智能', '物联网', '工业软件', '数字媒体技术', '计算机', '软件', '数据科学', '网络安全'],
  },
  {
    id: 'power', name: '电力工程', kind: 'specified',
    description: '发电、输配电、智能电网、水利水电与能源动力',
    keywords: ['电气工程及其自动化', '智能电网', '水利水电', '农业水利', '智慧水利', '能源与动力', '电力系统', '电网', '发电', '水电'],
  },
  {
    id: 'automation', name: '电气自动化', kind: 'specified',
    description: '自动控制、机器人、机电一体化与智能制造装备',
    keywords: ['机器人工程', '智能制造工程', '机械电子工程', '自动化', '控制工程', '机电一体化', 'PLC'],
  },
  {
    id: 'transport', name: '交通工程', kind: 'specified',
    description: '车辆、低空交通、导航定位与城市空间规划',
    keywords: ['车辆工程', '低空技术', '交通运输', '交通工程', '时空信息', '智慧城市', '飞行器', '导航'],
  },
  {
    id: 'economy', name: '经济贸易', kind: 'specified',
    description: '数字经济、金融、电子商务、会计与数据化经营管理',
    keywords: ['数字经济', '大数据管理与应用', '金融科技', '电子商务', '会计学', '经济', '金融', '贸易', '工商管理'],
  },
  {
    id: 'law', name: '法学', kind: 'specified',
    description: '法律实务、知识产权、涉外法治与数据合规治理（v8 专题扩样）',
    // 不使用单词「合规」：它是多门课程名的组成部分，会让非法律专业误命中
    keywords: ['法学', '法律', '知识产权', '纪检监察', '国际法', '司法鉴定', '国家安全学', '海外利益安全', '涉外法治', '信用风险管理', '国际经贸规则', '法学院', '监察法', '电子取证'],
  },
  {
    id: 'medicine', name: '医学', kind: 'specified',
    description: '临床医学、口腔、护理、医工交叉与健康保障',
    keywords: ['临床医学', '口腔医学', '护理学', '生物医学工程', '医疗器械', '健康与医疗保障', '医学', '临床', '护理'],
  },
  {
    id: 'chip', name: '芯片与电子信息', kind: 'auto',
    description: '集成电路、微电子、通信与智能视听电子（自动归类）',
    keywords: ['集成电路', '微电子', '电子信息工程', '通信工程', '智能视听', '半导体', '电子信息'],
  },
  {
    id: 'energy', name: '新能源与双碳', kind: 'auto',
    description: '新能源发电、储能、碳中和与环境治理（自动归类）',
    keywords: ['新能源', '储能', '碳中和', '环境科学与工程', '碳核算', '双碳', '环境工程'],
  },
  {
    id: 'civil', name: '土木水利与建造', kind: 'auto',
    description: '土木工程、智能建造与工程测绘（自动归类）',
    keywords: ['土木工程', '智能建造', '测绘工程', '建筑', 'BIM', '工程测量'],
  },
  {
    id: 'material', name: '材料与化工', kind: 'auto',
    description: '材料科学、分子工程与化工（自动归类）',
    keywords: ['材料科学', '智能分子', '材料', '化工', '化学', '分子工程'],
  },
  {
    id: 'edu', name: '教育文法与传媒', kind: 'auto',
    description: '教育学、学前教育与新闻传播（自动归类）',
    keywords: ['人工智能教育', '学前教育', '网络与新媒体', '教育学', '新闻传播', '传播学', '文法'],
  },
  {
    id: 'spatial', name: '时空海洋与公共安全', kind: 'auto',
    description: '应急管理、海洋观测与时空信息（自动归类）',
    keywords: ['智慧应急', '海洋科学', '应急管理', '海洋', '遥感', '公共安全'],
  },
  {
    id: 'other', name: '其他交叉专业', kind: 'auto',
    description: '未命中任何规则的交叉学科，保留在统计中以便后续补充口径（兜底）',
    keywords: [],
  },
];

/** 当前 62 个收录专业的精确归类（每个专业唯一归属，口径见 docs/11） */
export const MAJOR_DISCIPLINE: Record<string, string> = {
  // 计算机 · 8
  '计算机科学与技术': 'computer', '软件工程': 'computer', '数据科学与大数据技术': 'computer',
  '物联网工程': 'computer', '人工智能': 'computer', '网络空间安全': 'computer',
  '工业软件': 'computer', '数字媒体技术': 'computer',
  // 电力工程 · 6
  '电气工程及其自动化': 'power', '智能电网信息工程': 'power', '能源与动力工程': 'power',
  '水利水电工程': 'power', '农业水利工程': 'power', '智慧水利': 'power',
  // 电气自动化 · 4
  '自动化': 'automation', '机器人工程': 'automation',
  '智能制造工程': 'automation', '机械电子工程': 'automation',
  // 交通工程 · 4
  '车辆工程': 'transport', '低空技术与工程': 'transport',
  '时空信息工程': 'transport', '智慧城市与空间规划': 'transport',
  // 经济贸易 · 5
  '数字经济': 'economy', '大数据管理与应用': 'economy', '金融科技': 'economy',
  '电子商务': 'economy', '会计学': 'economy',
  // 法学 · 9（v8 专题扩样：8 个法学类 0301 特设/国控专业，代码经教育部目录核对）
  '法学': 'law', '知识产权': 'law', '信用风险管理与法律防控': 'law',
  '国际经贸规则': 'law', '纪检监察': 'law', '国际法': 'law',
  '司法鉴定学': 'law', '国家安全学': 'law', '海外利益安全': 'law',
  // 医学 · 6
  '临床医学': 'medicine', '口腔医学': 'medicine', '护理学': 'medicine',
  '生物医学工程': 'medicine', '医疗器械与装备工程': 'medicine', '健康与医疗保障': 'medicine',
  // 芯片与电子信息 · 6（自动）
  '集成电路科学与工程': 'chip', '微电子科学与工程': 'chip', '电子信息工程': 'chip',
  '通信工程': 'chip', '集成电路设计与集成系统': 'chip', '智能视听工程': 'chip',
  // 新能源与双碳 · 4（自动）
  '新能源科学与工程': 'energy', '储能科学与工程': 'energy',
  '碳中和科学与工程': 'energy', '环境科学与工程': 'energy',
  // 土木水利与建造 · 3（自动）
  '土木工程': 'civil', '智能建造': 'civil', '测绘工程': 'civil',
  // 材料与化工 · 2（自动）
  '材料科学与工程': 'material', '智能分子工程': 'material',
  // 教育文法与传媒 · 3（自动）
  '人工智能教育': 'edu', '学前教育': 'edu', '网络与新媒体': 'edu',
  // 时空海洋与公共安全 · 2（自动）
  '智慧应急': 'spatial', '海洋科学与技术': 'spatial',
};

export interface TaxonomyMajor {
  name: string;
  code?: string;
  college?: string;
  category?: string;
  students?: number;
  heat?: number;
  courses?: readonly string[];
}

export interface Classification {
  id: string;
  name: string;
  kind: TaxonomyKind;
  /** exact = 精确映射，keyword = 语义规则，fallback = 兜底 */
  matchedBy: 'exact' | 'keyword' | 'fallback';
  /** 命中的关键词，便于审计归类依据 */
  evidence: string;
}

/** 单个专业归类：精确映射 → 关键词规则 → 兜底 */
export function classifyMajor(m: TaxonomyMajor): Classification {
  const exact = MAJOR_DISCIPLINE[m.name];
  if (exact) {
    const cat = DISCIPLINE_CATEGORIES.find((c) => c.id === exact);
    if (cat) return { id: cat.id, name: cat.name, kind: cat.kind, matchedBy: 'exact', evidence: '精确映射表' };
  }
  const haystack = [m.name, m.category || '', m.college || '', (m.courses || []).join(' ')].join(' ');
  // 指定类优先，其次自动类；同类内按关键词长度降序，先命中更具体的词
  const ordered = [...DISCIPLINE_CATEGORIES].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'specified' ? -1 : 1;
    return 0;
  });
  for (const cat of ordered) {
    const hit = [...cat.keywords].sort((a, b) => b.length - a.length).find((k) => k && haystack.includes(k));
    if (hit) return { id: cat.id, name: cat.name, kind: cat.kind, matchedBy: 'keyword', evidence: `命中「${hit}」` };
  }
  const fallback = DISCIPLINE_CATEGORIES[DISCIPLINE_CATEGORIES.length - 1];
  return { id: fallback.id, name: fallback.name, kind: 'auto', matchedBy: 'fallback', evidence: '未命中规则，进入兜底类' };
}

export interface TaxonomyCategoryView extends DisciplineCategory {
  count: number;
  share: number;
  /** 该类的自动小结：数量、占比、学院覆盖、平均热度 */
  summary: string;
  majors: {
    name: string; code: string; college: string; students: number; heat: number;
    matchedBy: Classification['matchedBy']; evidence: string;
  }[];
}

export interface TaxonomyResult {
  total: number;
  classified: number;
  unclassified: number;
  coverage: number;
  specifiedCount: number;
  autoCount: number;
  specifiedCategories: number;
  autoCategories: number;
  categories: TaxonomyCategoryView[];
  /** 自动生成的归类总结，直接用于页面展示与报告 */
  highlights: string[];
  method: string;
}

const pct = (n: number, total: number) => (total ? +((n / total) * 100).toFixed(1) : 0);

/** 对全量专业构建归类结果；rows 可来自 dataset 的 majors 或 API 的行数据 */
export function buildTaxonomy(rows: readonly TaxonomyMajor[]): TaxonomyResult {
  const total = rows.length;
  const buckets = new Map<string, { row: TaxonomyMajor; cls: Classification }[]>();
  rows.forEach((row) => {
    const cls = classifyMajor(row);
    const list = buckets.get(cls.id) || [];
    list.push({ row, cls });
    buckets.set(cls.id, list);
  });

  const categories: TaxonomyCategoryView[] = DISCIPLINE_CATEGORIES.map((cat) => {
    const items = buckets.get(cat.id) || [];
    const colleges = new Set(items.map((x) => x.row.college).filter(Boolean));
    const heats = items.map((x) => x.row.heat).filter((h): h is number => typeof h === 'number');
    const avgHeat = heats.length ? Math.round(heats.reduce((a, b) => a + b, 0) / heats.length) : 0;
    const share = pct(items.length, total);
    const summary = items.length
      ? `${items.length} 个专业 · 占比 ${share}% · 覆盖 ${colleges.size} 个学院 · 平均热度 ${avgHeat}`
      : '当前无专业，保留分类口径以便后续扩展';
    return {
      ...cat,
      count: items.length,
      share,
      summary,
      majors: items.map(({ row, cls }) => ({
        name: row.name, code: row.code || '', college: row.college || '',
        students: row.students || 0, heat: row.heat || 0,
        matchedBy: cls.matchedBy, evidence: cls.evidence,
      })),
    };
  });

  const specified = categories.filter((c) => c.kind === 'specified' && c.id !== 'other');
  const auto = categories.filter((c) => c.kind === 'auto' && c.id !== 'other' && c.count > 0);
  const specifiedCount = specified.reduce((s, c) => s + c.count, 0);
  const autoCount = auto.reduce((s, c) => s + c.count, 0);
  const unclassified = buckets.get('other')?.length || 0;
  const topSpecified = [...specified].sort((a, b) => b.count - a.count).slice(0, 3);
  const autoList = auto.map((c) => `${c.name}（${c.count}）`).join('、');

  const highlights = [
    `共收录 ${total} 个专业，完成学科归类 ${total - unclassified} 个，覆盖率 ${pct(total - unclassified, total)}%${unclassified ? `；${unclassified} 个暂入「其他交叉专业」等待口径补充` : '，无未归类专业'}。`,
    `7 个指定学科类收录 ${specifiedCount} 个专业（${pct(specifiedCount, total)}%），数量最多的是 ${topSpecified.map((c) => `${c.name} ${c.count} 个`).join('、')}。`,
    autoList
      ? `其余 ${autoCount} 个专业按名称、所属学院与课程体系语义自动归为 ${auto.length} 类：${autoList}。`
      : '其余专业未触发自动归类规则。',
    `归类依据可在每个专业上查看（精确映射 / 关键词命中 / 兜底），新增专业无需改动页面即可自动进入统计。`,
  ];

  return {
    total,
    classified: total - unclassified,
    unclassified,
    coverage: pct(total - unclassified, total),
    specifiedCount,
    autoCount,
    specifiedCategories: specified.length,
    autoCategories: auto.length,
    categories,
    highlights,
    method: `精确映射（${Object.keys(MAJOR_DISCIPLINE).length} 个收录专业）→ 名称/学院/学科类/课程关键词规则 → 其他交叉专业兜底`,
  };
}

/** 便捷入口：直接对 dataset 的 majors 构建（供脚本 / 服务端复用） */
export function taxonomyOfMajors(majors: readonly Major[], heats?: Record<string, number>): TaxonomyResult {
  return buildTaxonomy(majors.map((m) => ({
    name: m.name, code: m.code, college: m.college, category: m.category,
    students: m.students, courses: m.courses, heat: heats?.[m.name],
  })));
}
