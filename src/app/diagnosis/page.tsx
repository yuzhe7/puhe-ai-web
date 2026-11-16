'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Layers3, GitBranch, Zap, ArrowRight, BookOpen, AlertTriangle, CheckCircle2,
  TrendingDown, TrendingUp, FileDown, Sparkles,
} from 'lucide-react';
import { Card, SectionHeader, Badge, Segmented, Loading, Empty, ProgressBar } from '@/components/ui';
import { heatmapOption, radarOption, gapBarOption, sankeyOption } from '@/lib/charts';
import { majors, courses, skills } from '@/lib/dataset';
import { autoMatchCompare } from '@/lib/major-context';
import type { SimilarityCell, GapItem } from '@/lib/types';
import type { CompetencyRow } from '@/lib/graph';

const EChart = dynamic(() => import('@/components/EChart'), { ssr: false, loading: () => <Loading /> });

type Tab = 'macro' | 'meso' | 'micro';

export default function DiagnosisPage() {
  const [tab, setTab] = useState<Tab>('macro');
  const [simRows, setSimRows] = useState<SimilarityCell[]>([]);
  const [compRows, setCompRows] = useState<CompetencyRow[]>([]);
  const [gapRows, setGapRows] = useState<GapItem[]>([]);
  const [course, setCourse] = useState('数据结构');
  const [majorA, setMajorA] = useState('计算机科学与技术');
  const [majorB, setMajorB] = useState('软件工程');
  const [loading, setLoading] = useState(true);
  const [autoHint, setAutoHint] = useState('');

  // 深链接 /diagnosis?major=xxx&compare=yyy：只带专业时自动匹配同质化最高的对比专业
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('tab');
    if (q === 'meso' || q === 'micro' || q === 'macro') setTab(q);
    const courseParam = params.get('course');
    if (courseParam && courses.some((c) => c.name === courseParam)) setCourse(courseParam);
    const majorParam = params.get('major');
    const validMajor = majorParam && majors.some((m) => m.name === majorParam) ? majorParam : null;
    if (validMajor) setMajorA(validMajor);
    const compareParam = params.get('compare');
    const validCompare = compareParam && majors.some((m) => m.name === compareParam) ? compareParam : null;
    if (validCompare) setMajorB(validCompare);
    if (validMajor && !validCompare) {
      void autoMatchCompare(validMajor, (value, hint) => { setMajorB(value); setAutoHint(hint); });
    } else if (validMajor && validCompare) {
      setAutoHint(`已按专业目录自动带入对比专业「${validCompare}」`);
    }
  }, []);

  // 手动切换专业 A 时联动重匹配对比专业；手动改专业 B 则保留用户选择
  const switchMajorA = (next: string) => {
    setMajorA(next);
    setAutoHint('');
    void autoMatchCompare(next, (value, hint) => { setMajorB(value); setAutoHint(hint); });
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'similarity' }) }).then((r) => r.json()),
      fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'competency' }) }).then((r) => r.json()),
    ]).then(([a, b]) => { setSimRows(a.rows || []); setCompRows(b.rows || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'gap', course }) })
      .then((r) => r.json()).then((d) => setGapRows(d.rows || [])).catch(() => null);
  }, [course]);

  const names = useMemo(() => majors.map((m) => m.name), []);
  const heat = useMemo(() => simRows.length ? heatmapOption(simRows, names) : null, [simRows, names]);
  const radar = useMemo(() => compRows.length ? radarOption(compRows) : null, [compRows]);
  const gapBar = useMemo(() => gapRows.length ? gapBarOption(gapRows.map((g) => ({ name: g.name, demand: g.demand, hours: g.hours, label: g.label }))) : null, [gapRows]);
  const sankey = useMemo(() => gapRows.length ? sankeyOption(gapRows.map((g) => ({ name: g.name, label: g.label, demand: g.demand })), skills.filter((s) => s.demand >= 88).map((s) => s.name)) : null, [gapRows]);

  const pair = useMemo(() => simRows.find((r) => (r.a === majorA && r.b === majorB) || (r.a === majorB && r.b === majorA)), [simRows, majorA, majorB]);
  const topRisk = useMemo(() => simRows.filter((r) => r.a !== r.b).sort((a, b) => b.score - a.score).slice(0, 8), [simRows]);
  const gapCounts = useMemo(() => ({
    应新增: gapRows.filter((g) => g.label === '应新增').length,
    应加强: gapRows.filter((g) => g.label === '应加强').length,
    可精简: gapRows.filter((g) => g.label === '可精简').length,
    保持: gapRows.filter((g) => g.label === '保持').length,
  }), [gapRows]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={tab} onChange={setTab} options={[
            { value: 'macro', label: '① 宏观 · 专业同质化' },
            { value: 'meso', label: '② 中观 · 能力偏差' },
            { value: 'micro', label: '③ 微观 · 知识点缺口' },
          ]} />
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="blue"><Layers3 size={11} /> 三维递进式分析引擎</Badge>
          <Badge tone="green">确定性算法 · 结果可复现</Badge>
        </div>
      </div>

      {/* ---------------- 宏观 ---------------- */}
      {tab === 'macro' && (
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <Card>
              <SectionHeader title="专业同质化相似度矩阵" sub="S(A,B) = 0.3 × 课程 Jaccard + 0.4 × 知识点重叠率 + 0.3 × 图拓扑余弦相似度" icon={<Layers3 size={16} />} extra={<Badge tone="blue">全量 {majors.length} 专业两两计算</Badge>} />
              {loading ? <Loading /> : heat ? <EChart option={heat} height={430} /> : <Empty text="暂无数据" />}
            </Card>
            <Card>
              <SectionHeader title="高风险专业对 TOP 8" sub="综合评分 ≥ 0.6 判定为同质化高风险，建议合并实训课程或重构专业特色方向" icon={<AlertTriangle size={16} />} />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead><tr className="border-b border-ink-100 text-[11px] text-ink-400">
                    <th className="pb-2 font-medium">专业 A</th><th className="pb-2 font-medium">专业 B</th>
                    <th className="pb-2 font-medium">Jaccard</th><th className="pb-2 font-medium">知识点重叠</th>
                    <th className="pb-2 font-medium">拓扑相似</th><th className="pb-2 font-medium">综合评分</th><th className="pb-2 font-medium">判定</th>
                  </tr></thead>
                  <tbody>{topRisk.map((r, i) => (
                    <tr key={i} className="border-b border-ink-50 last:border-0">
                      <td className="py-2 text-ink-700">{r.a}</td><td className="py-2 text-ink-700">{r.b}</td>
                      <td className="py-2 font-mono text-ink-500">{r.jaccard}</td><td className="py-2 font-mono text-ink-500">{r.knowledgeOverlap}</td>
                      <td className="py-2 font-mono text-ink-500">{r.topology}</td>
                      <td className="py-2"><span className="font-mono font-semibold text-brand-700">{r.score}</span></td>
                      <td className="py-2"><Badge tone={r.score >= 0.6 ? 'red' : r.score >= 0.45 ? 'amber' : 'green'}>{r.score >= 0.6 ? '高风险' : r.score >= 0.45 ? '需关注' : '差异化良好'}</Badge></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <SectionHeader title="专业两两对比" icon={<BookOpen size={15} />} />
              <div className="space-y-2.5">
                <select className="input !text-xs" value={majorA} onChange={(e) => switchMajorA(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select>
                <div className="text-center text-[11px] text-ink-400">↕ 对比</div>
                <select className="input !text-xs" value={majorB} onChange={(e) => { setMajorB(e.target.value); setAutoHint(''); }}>{names.map((n) => <option key={n}>{n}</option>)}</select>
              </div>
              {autoHint && <div className="mt-2 text-[10.5px] text-brand-700"><Sparkles size={11} className="mr-1 inline" />{autoHint} · 已自动完成两两对比</div>}
              {pair && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl bg-gradient-to-br from-brand-50 to-white p-4 text-center">
                    <div className="label">综合同质化评分</div>
                    <div className="mt-1 text-[34px] font-bold leading-none text-brand-700">{pair.score}</div>
                    <div className="mt-1.5 text-[11px] text-ink-500">{pair.score >= 0.6 ? '存在显著低水平重复建设风险' : '差异化程度可接受'}</div>
                  </div>
                  {[
                    { k: '课程 Jaccard 相似度', v: pair.jaccard, w: 0.3 },
                    { k: '知识点重叠率', v: pair.knowledgeOverlap, w: 0.4 },
                    { k: '图拓扑余弦相似度', v: pair.topology, w: 0.3 },
                  ].map((x) => (
                    <div key={x.k}>
                      <div className="mb-1 flex justify-between text-[11px]"><span className="text-ink-500">{x.k} <span className="text-ink-300">×{x.w}</span></span><span className="font-mono font-medium text-ink-700">{x.v}</span></div>
                      <ProgressBar value={x.v * 100} tone="brand" />
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card className="border-amber-100 bg-amber-50/40">
              <SectionHeader title="试点验证对照" icon={<CheckCircle2 size={15} />} />
              <p className="text-[11.5px] leading-relaxed text-ink-600">
                项目书记录：河北水利电力学院计算机科学与技术 vs 软件工程，课程 Jaccard <strong>0.68</strong>、知识点重叠率 <strong>72.3%</strong>；
                与数据科学与大数据技术相似度 <strong>0.45</strong>。本平台用本地数据集复算，结论与资深教师经验判断一致性达 85% 以上。
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------- 中观 ---------------- */}
      {tab === 'meso' && (
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <Card>
              <SectionHeader title="培养目标 — 岗位能力偏差雷达" sub="依据工程教育认证 12 项毕业要求构建统一能力词表，蓝校内 / 橙产业" icon={<GitBranch size={16} />} />
              {loading ? <Loading /> : radar ? <EChart option={radar} height={380} /> : <Empty text="暂无数据" />}
            </Card>
            <Card>
              <SectionHeader title="四态偏差判定规则" icon={<Layers3 size={15} />} />
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  { t: '培养不足', d: '产业 − 校内 ≥ 20', c: 'border-rose-100 bg-rose-50/60' },
                  { t: '部分匹配', d: '偏差 10 ~ 20', c: 'border-amber-100 bg-amber-50/60' },
                  { t: '高度匹配', d: '|偏差| ≤ 10', c: 'border-emerald-100 bg-emerald-50/60' },
                  { t: '过度培养', d: '校内 − 产业 ≥ 20', c: 'border-brand-100 bg-brand-50/60' },
                ].map((x) => (
                  <div key={x.t} className={`rounded-xl border p-3 ${x.c}`}>
                    <div className="text-[12px] font-semibold text-ink-800">{x.t}</div>
                    <div className="mt-1 font-mono text-[10.5px] text-ink-500">{x.d}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <Card>
            <SectionHeader title="12 项毕业要求偏差清单" sub="偏差 = 产业岗位需求强度 − 高校培养目标覆盖度" extra={<Badge tone="orange">中观层</Badge>} />
            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {compRows.map((r) => (
                <div key={r.id} className="rounded-xl border border-ink-100 p-3 transition-colors hover:border-brand-200 hover:bg-brand-50/30">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-ink-100 font-mono text-[11px] font-semibold text-ink-600">{r.code}</span>
                    <span className="text-[12.5px] font-semibold text-ink-800">{r.name}</span>
                    <span className={`ml-auto chip ${r.state === '培养不足' ? 'border-rose-200 bg-rose-50 text-rose-700' : r.state === '过度培养' ? 'border-brand-200 bg-brand-50 text-brand-700' : r.state === '高度匹配' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{r.state}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10.5px] text-ink-500">
                    <span className="w-20 shrink-0">校内 {r.schoolWeight}</span>
                    <div className="relative h-1.5 flex-1 rounded-full bg-ink-100">
                      <div className="absolute h-full rounded-full bg-brand-400" style={{ width: `${r.schoolWeight}%` }} />
                      <div className="absolute top-[-2px] h-[10px] w-[2px] bg-orange-500" style={{ left: `${r.industryWeight}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right">产业 {r.industryWeight} · 偏差 {r.gap > 0 ? '+' : ''}{r.gap}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-500">{r.suggestion}</p>
                  <p className="mt-1 text-[10px] text-ink-400">证据：{r.evidence}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ---------------- 微观 ---------------- */}
      {tab === 'micro' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { l: '应新增', v: gapCounts.应新增, c: 'text-rose-600', bg: 'bg-rose-50 border-rose-100', icon: TrendingUp, d: '课程体系完全缺失的高需求技能' },
              { l: '应加强', v: gapCounts.应加强, c: 'text-orange-600', bg: 'bg-orange-50 border-orange-100', icon: Zap, d: '高需求但课时/深度不足的知识点' },
              { l: '可精简', v: gapCounts.可精简, c: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', icon: TrendingDown, d: '低频或衰退技能，建议压缩学时' },
              { l: '保持', v: gapCounts.保持, c: 'text-ink-600', bg: 'bg-ink-50 border-ink-100', icon: CheckCircle2, d: '供需基本平衡，维持现有安排' },
            ].map((x) => {
              const Icon = x.icon;
              return <div key={x.l} className={`card border p-4 ${x.bg}`}><div className="flex items-center justify-between"><span className="text-[12px] font-semibold">{x.l}</span><Icon size={16} className={x.c} /></div><div className={`mt-1 text-[28px] font-bold leading-none ${x.c}`}>{x.v}</div><p className="mt-1.5 text-[10.5px] opacity-70">{x.d}</p></div>;
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12px] text-ink-500">选择课程：</span>
            <select className="input !w-auto min-w-[220px] !py-2 !text-xs" value={course} onChange={(e) => setCourse(e.target.value)}>
              {courses.map((c) => <option key={c.id} value={c.name}>{c.name}（{c.hours} 学时）</option>)}
            </select>
            <Badge tone="blue">{course} · {gapRows.length} 个知识点参与对齐</Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionHeader title="知识点产业需求 vs 教学覆盖" sub="柱高为产业需求强度，浅蓝为当前教学覆盖折算；颜色标识改革指令" icon={<Zap size={16} />} />
              {gapBar ? <EChart option={gapBar} height={330} /> : <Loading />}
            </Card>
            <Card>
              <SectionHeader title="知识点 → 改革指令 → 产业技能 流向" sub="桑基图呈现跨域语义对齐后的三级映射关系" icon={<GitBranch size={16} />} />
              {sankey ? <EChart option={sankey} height={330} /> : <Loading />}
            </Card>
          </div>

          <Card>
            <SectionHeader title={`${course} · 课程改革指令清单`} sub="每条建议均带匹配证据，可直接用于课程大纲修订" icon={<BookOpen size={16} />} extra={<Badge tone="green">可追溯</Badge>} />
            <div className="grid gap-2.5 md:grid-cols-2">
              {gapRows.map((g) => (
                <div key={g.name} className="rounded-xl border border-ink-100 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className={`chip ${g.label === '应新增' ? 'border-rose-200 bg-rose-50 text-rose-700' : g.label === '应加强' ? 'border-orange-200 bg-orange-50 text-orange-700' : g.label === '可精简' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-ink-200 bg-ink-50 text-ink-500'}`}>{g.label}</span>
                    <span className="text-[12.5px] font-semibold text-ink-800">{g.name}</span>
                    <span className="ml-auto font-mono text-[10.5px] text-ink-400">需求 {g.demand} · {g.hours} 学时</span>
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-ink-600">{g.reason}</p>
                  <p className="mt-1.5 text-[10.5px] text-brand-700">证据：{g.evidence.join('、') || '领域词频统计'}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="card flex flex-wrap items-center justify-between gap-3 border-brand-100 bg-gradient-to-r from-brand-50 to-white p-4">
            <div className="flex items-start gap-2.5">
              <Sparkles size={17} className="mt-0.5 text-brand-600" />
              <div><div className="text-[13px] font-semibold text-ink-900">让 AI 把诊断结论写成完整报告</div>
                <p className="mt-0.5 text-[11px] text-ink-500">Copilot 会调用 RAG 检索 + 三维工具链，生成带证据溯源的诊断报告</p></div>
            </div>
            <div className="flex gap-2">
              <a href={`/copilot?q=${encodeURIComponent(`请生成${course}课程改革诊断报告`)}`} className="btn-primary !py-2 !text-xs">交给 AI Copilot <ArrowRight size={13} /></a>
              <a href="/report" className="btn-ghost !py-2 !text-xs"><FileDown size={13} /> 报告中心</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
