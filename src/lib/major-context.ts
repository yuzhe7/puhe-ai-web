/**
 * 专业深链接上下文（v9）
 * --------------------------------------------------------------------------
 * 解决「从专业目录卡片跳转到沙盘 / 诊断 / 路径后，目标岗位和对比专业仍是默认值」的问题。
 *
 * 匹配依据全部来自确定性算法，不调用大模型：
 *  - 目标岗位 = /api/majors 中该专业 matchedJobs[0]（crossSideMatch 语义对齐最高分）
 *  - 对比专业 = /api/majors 中该专业 topRisk.other（similarityMatrix 同质化最高分）
 *
 * 三条链路：
 *  ① 目录页生成链接时直接带上已算好的 job / compare，跳转后立即生效、无需额外请求；
 *  ② 只带 major 的深链接（命令面板、手动 URL、其他页面）由各目标页调用
 *     autoMatchJob / autoMatchCompare 自动补齐；
 *  ③ 用户在目标页手动切换「专业」时联动重匹配；手动改岗位/对比专业则尊重用户选择。
 *
 * 所有页面在 state 变化后本来就会自动重算（沙盘 260ms 防抖重算、诊断 useMemo、
 * 路径 useEffect 重新规划），因此匹配完成即等于「自动开始分析 / 对比」。
 */
export interface MajorContextRow {
  name: string;
  matchedJobs: { title: string; industry?: string; score: number }[];
  topRisk: { other: string; score: number } | null;
}

export interface MajorLinks {
  simulate: string;
  diagnosis: string;
  path: string;
}

export function bestJobOf(row: MajorContextRow | null | undefined): { title: string; score: number } | null {
  const top = row?.matchedJobs?.[0];
  return top?.title ? { title: top.title, score: top.score } : null;
}

export function compareMajorOf(row: MajorContextRow | null | undefined): { name: string; score: number } | null {
  const risk = row?.topRisk;
  return risk?.other ? { name: risk.other, score: risk.score } : null;
}

/** 生成三个携带完整上下文的深链接；岗位/对比专业缺失时自动省略该参数由目标页补齐 */
export function buildMajorLinks(m: MajorContextRow): MajorLinks {
  const major = encodeURIComponent(m.name);
  const job = bestJobOf(m);
  const compare = compareMajorOf(m);
  const jobQ = job ? `&job=${encodeURIComponent(job.title)}` : '';
  const cmpQ = compare ? `&compare=${encodeURIComponent(compare.name)}` : '';
  return {
    simulate: `/simulate?major=${major}${jobQ}`,
    diagnosis: `/diagnosis?tab=macro&major=${major}${cmpQ}`,
    path: `/path?major=${major}${jobQ}`,
  };
}

/** 复用专业目录 API，按名称精确取回该专业的岗位匹配与同质化风险（q 可能命中多行，故用 find） */
export async function fetchMajorContext(major: string): Promise<MajorContextRow | null> {
  if (!major) return null;
  try {
    const res = await fetch(`/api/majors?q=${encodeURIComponent(major)}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const rows: MajorContextRow[] = Array.isArray(data.rows) ? data.rows : [];
    return rows.find((r) => r.name === major) || null;
  } catch {
    return null;
  }
}

/** 匹配序号：用户快速连续切换专业时，丢弃过期响应，避免旧结果覆盖新选择 */
let jobMatchSeq = 0;
let compareMatchSeq = 0;

/** apply(value, hint)：hint 可直接展示在页面上，说明匹配依据与分数 */
export async function autoMatchJob(major: string, apply: (value: string, hint: string) => void): Promise<boolean> {
  const seq = ++jobMatchSeq;
  const hit = bestJobOf(await fetchMajorContext(major));
  if (!hit || seq !== jobMatchSeq) return false;
  apply(hit.title, `已按「${major}」自动匹配目标岗位「${hit.title}」· 契合度 ${hit.score}`);
  return true;
}

export async function autoMatchCompare(major: string, apply: (value: string, hint: string) => void): Promise<boolean> {
  const seq = ++compareMatchSeq;
  const hit = compareMajorOf(await fetchMajorContext(major));
  if (!hit || seq !== compareMatchSeq) return false;
  apply(hit.name, `已按「${major}」自动匹配对比专业「${hit.name}」· 同质化评分 ${hit.score}`);
  return true;
}
