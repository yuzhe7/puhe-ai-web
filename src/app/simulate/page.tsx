'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  SlidersHorizontal, Sparkles, Download, RotateCcw, Plus, X, Target, Clock3,
  TrendingUp, Layers3, Zap, FileText, ChevronRight, Check, Loader2, Info, Cpu,
} from 'lucide-react';
import { Card, SectionHeader, Badge, DeltaBar, Loading, MarkdownLite, ProgressBar } from '@/components/ui';
import { compareRadarOption } from '@/lib/charts';
import { autoMatchJob } from '@/lib/major-context';
import type { SimPlan, SimResult, CourseRow } from '@/lib/simulator';

const EChart = dynamic(() => import('@/components/EChart'), { ssr: false, loading: () => <Loading /> });

interface Catalog {
  majors: { name: string; college: string; courses: number }[];
  jobs: { title: string; industry: string; count: number; skills: number }[];
  curriculum: CourseRow[];
  modules: { name: string; demand: number; trend: string; category: string; inJob: boolean; aligned: number }[];
  baseline: SimPlan;
}

const KPI = [
  { key: 'match', label: '目标岗位匹配度', unit: '分', icon: Target, tone: 'text-brand-600', max: 100 },
  { key: 'balance', label: '毕业要求均衡度', unit: '分', icon: Layers3, tone: 'text-emerald-600', max: 100 },
  { key: 'modern', label: '现代工具覆盖', unit: '分', icon: Cpu, tone: 'text-violet-600', max: 100 },
  { key: 'practice', label: '实践学时占比', unit: '%', icon: TrendingUp, tone: 'text-orange-600', max: 100 },
  { key: 'gapCount', label: '待调整知识点', unit: '项', icon: Zap, tone: 'text-rose-600', max: 30, inverse: true },
] as const;

export default function SimulatePage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [plan, setPlan] = useState<SimPlan | null>(null);
  const [result, setResult] = useState<SimResult | null>(null);
  const [trace, setTrace] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [budget, setBudget] = useState(48);
  const [major, setMajor] = useState('计算机科学与技术');
  const [job, setJob] = useState('AI应用开发工程师');
  const [syllabusCourse, setSyllabusCourse] = useState('数据结构');
  const [syllabus, setSyllabus] = useState('');
  const [syllabusBusy, setSyllabusBusy] = useState(false);
  const [showSyllabus, setShowSyllabus] = useState(false);
  const [autoHint, setAutoHint] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 深链接 /simulate?major=xxx&job=xxx：只带专业时自动匹配契合度最高的岗位
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const m = p.get('major'), j = p.get('job');
    if (m) setMajor(m);
    if (j) setJob(j);
    if (m && !j) void autoMatchJob(m, (value, hint) => { setJob(value); setAutoHint(hint); });
    if (m && j) setAutoHint(`已按专业目录自动带入目标岗位「${j}」`);
  }, []);

  // 手动切换专业时联动重匹配目标岗位；手动改岗位则保留用户选择
  const switchMajor = (next: string) => {
    setMajor(next);
    setAutoHint('');
    void autoMatchJob(next, (value, hint) => { setJob(value); setAutoHint(hint); });
  };

  // 专业 / 岗位变化时拉取配置清单并重置为现行方案
  useEffect(() => {
    let alive = true;
    fetch(`/api/simulate?major=${encodeURIComponent(major)}&job=${encodeURIComponent(job)}`)
      .then((r) => r.json()).then((d: Catalog) => {
        if (!alive) return;
        // 服务端已把非法专业/岗位回退到合法值，这里同步 select 的显示值，避免出现空选项
        if (d.baseline.major !== major) setMajor(d.baseline.major);
        if (d.baseline.targetJob !== job) setJob(d.baseline.targetJob);
        setCatalog(d); setPlan(d.baseline); setTrace([]);
        setSyllabusCourse(d.curriculum.find((c) => c.name === '数据结构')?.name || d.curriculum[4]?.name || d.curriculum[0]?.name || '数据结构');
      }).catch(() => null);
    return () => { alive = false; };
  }, [major, job]);

  const compute = useCallback(async (p: SimPlan, withTrace: string[] = []) => {
    setBusy(true);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const d = await res.json();
      setResult(d.result as SimResult);
      setTrace(withTrace);
    } finally { setBusy(false); }
  }, []);

  // 实时重算：参数变化 260ms 后触发，避免拖动滑杆产生大量请求
  useEffect(() => {
    if (!plan) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void compute(plan, trace); }, 260);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, compute]);

  const patchPlan = (fn: (p: SimPlan) => SimPlan) => setPlan((p) => p ? fn(p) : p);

  const optimize = async () => {
    if (!plan) return;
    setOptimizing(true);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ major, targetJob: job, optimize: true, budget }),
      });
      const d = await res.json();
      setPlan(d.plan as SimPlan);
      setResult(d.result as SimResult);
      setTrace(d.trace as string[]);
    } finally { setOptimizing(false); }
  };

  const generateSyllabus = async () => {
    if (!plan) return;
    setSyllabusBusy(true); setShowSyllabus(true);
    try {
      const res = await fetch('/api/syllabus', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course: syllabusCourse, plan }),
      });
      const d = await res.json();
      setSyllabus(d.markdown || d.error || '');
    } finally { setSyllabusBusy(false); }
  };

  const download = (name: string, text: string, type = 'application/json') => {
    const blob = new Blob([text], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const radar = useMemo(() => result ? compareRadarOption(result.radar.dims, result.radar.before, result.radar.after) : null, [result]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* 顶部操作条 */}
      <div className="tech-panel glow-border animate-fade-up rounded-2xl p-5 sm:p-6">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue"><SlidersHorizontal size={11} /> What-if Simulation</Badge>
              <Badge tone="green">确定性算法 · 实时重算</Badge>
              <Badge tone="orange">贪心寻优 / 学时预算约束</Badge>
            </div>
            <h2 className="mt-3 text-[21px] font-bold tracking-tight text-ink-900 sm:text-[25px]">调整一门课的学时，会怎样改变毕业生的岗位竞争力？</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-500">
              拖动滑杆调整课程学时、增删产业模块，平台会基于「知识点 × 产业技能」语义对齐矩阵实时重算五维指标。
              所有数值来自本地确定性算法，可在任何环境复现；「AI 一键寻优」会在你设定的学时预算内搜索近似最优改革方案。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={optimize} disabled={optimizing || !plan} className="btn-primary !text-xs">
              {optimizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} AI 一键寻优
            </button>
            <button onClick={() => plan && download(`puhe-reform-${major}.json`, JSON.stringify({ plan, result }, null, 2))} className="btn-ghost !text-xs" disabled={!plan}>
              <Download size={14} /> 导出方案
            </button>
          </div>
        </div>
        <div className="relative z-10 mt-5 flex flex-wrap items-center gap-3 border-t border-ink-200/70 pt-4">
          <label className="flex items-center gap-2 text-[11.5px] text-ink-500">目标专业
            <select value={major} onChange={(e) => switchMajor(e.target.value)} className="input !w-auto !py-1.5 !text-xs">
              {catalog?.majors.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11.5px] text-ink-500">目标岗位
            <select value={job} onChange={(e) => { setJob(e.target.value); setAutoHint(''); }} className="input !w-auto !py-1.5 !text-xs">
              {catalog?.jobs.map((j) => <option key={j.title} value={j.title}>{j.title}</option>)}
            </select>
          </label>
          <label className="flex min-w-[220px] flex-1 items-center gap-2 text-[11.5px] text-ink-500">学时预算 <span className="mono-num font-semibold text-brand-700">+{budget}h</span>
            <input type="range" min={0} max={96} step={8} value={budget} onChange={(e) => setBudget(+e.target.value)} className="h-1.5 flex-1 accent-brand-600" />
          </label>
          <button onClick={() => { if (catalog) { setPlan(catalog.baseline); setTrace([]); setSyllabus(''); } }} className="btn-ghost !py-1.5 !text-xs">
            <RotateCcw size={13} /> 重置
          </button>
          {autoHint && <div className="w-full text-[10.5px] text-brand-700"><Sparkles size={11} className="mr-1 inline" />{autoHint} · 已按新参数自动重算</div>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* 配置面板 */}
        <div className="space-y-5 lg:col-span-5">
          <Card className="animate-fade-up">
            <SectionHeader title="课程学时与结构" sub={`${catalog?.curriculum.length ?? 0} 门课程 · 拖动滑杆即时重算`} icon={<Clock3 size={16} />}
              extra={<Badge tone="gray">现行 {result?.before.totalHours ?? '—'} h</Badge>} />
            <div className="max-h-[430px] space-y-2.5 overflow-y-auto pr-1">
              {catalog?.curriculum.map((c) => {
                const current = plan?.hours[c.name] ?? c.baseHours;
                const removed = plan?.removed.includes(c.name);
                const delta = current - c.baseHours;
                return (
                  <div key={c.name} className={`rounded-xl border p-3 transition-colors ${removed ? 'border-rose-200 bg-rose-50/60' : 'border-ink-200/70 bg-surface-2/60'}`}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-800">{c.name}</span>
                      <span className="chip border-ink-200 bg-surface px-1.5 py-0.5 text-[9.5px] text-ink-400">{c.category}</span>
                      <span className={`mono-num w-[62px] text-right text-[11px] font-semibold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-orange-600' : 'text-ink-500'}`}>
                        {removed ? '移除' : `${current}h`}
                      </span>
                      <button title={removed ? '恢复课程' : '移除课程'} onClick={() => patchPlan((p) => ({ ...p, removed: removed ? p.removed.filter((x) => x !== c.name) : [...p.removed, c.name] }))}
                        className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-rose-600">
                        {removed ? <RotateCcw size={12} /> : <X size={12} />}
                      </button>
                    </div>
                    <input type="range" min={24} max={96} step={8} disabled={removed} value={current}
                      onChange={(e) => patchPlan((p) => ({ ...p, hours: { ...p.hours, [c.name]: +e.target.value } }))}
                      className="mt-2 h-1.5 w-full accent-brand-600 disabled:opacity-30" />
                    <div className="mono-num mt-1 flex justify-between text-[9.5px] text-ink-400"><span>基线 {c.baseHours}h · {c.kpCount} 个知识点</span><span>{delta > 0 ? `+${delta}` : delta}h</span></div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="animate-fade-up">
            <SectionHeader title="新增产业模块" sub="按岗位 JD 需求强度排序，每个模块按 16 学时计入" icon={<Plus size={16} />}
              extra={<Badge tone="blue">{plan?.modules.length ?? 0} / 6</Badge>} />
            <div className="flex flex-wrap gap-1.5">
              {catalog?.modules.map((m) => {
                const on = plan?.modules.includes(m.name);
                return (
                  <button key={m.name} onClick={() => patchPlan((p) => ({ ...p, modules: on ? p.modules.filter((x) => x !== m.name) : p.modules.length < 6 ? [...p.modules, m.name] : p.modules }))}
                    className={`chip text-[10.5px] transition-all ${on ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 bg-surface-2 text-ink-500 hover:border-brand-300'}`}>
                    {on ? <Check size={11} /> : <Plus size={11} />} {m.name}
                    <span className="mono-num ml-0.5 opacity-60">{m.demand}</span>
                    {m.inJob && <span className="ml-0.5 rounded bg-orange-100 px-1 text-[9px] text-orange-700">JD</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-[10.5px] leading-relaxed text-ink-600">
              <Info size={13} className="mt-0.5 shrink-0 text-brand-600" />
              勾选「JD」标记的模块可直接提升目标岗位技能覆盖；未标记的模块用于拓展相邻岗位能力，可能影响实践学时占比但不一定提升当前匹配度。
            </div>
          </Card>
          <Card>
            <SectionHeader title="AI 改革建议" sub="基于模拟结果的确定性归因，不含模型臆测" icon={<Sparkles size={16} />} />
            {result ? <MarkdownLite text={result.advice.map((a, i) => `${i + 1}. ${a}`).join('\n')} /> : <Loading />}
            {!!trace.length && (
              <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-brand-700"><Sparkles size={12} /> 自动寻优轨迹（{trace.length} 轮）</div>
                <div className="space-y-1.5">
                  {trace.map((t, i) => (
                    <div key={i} className="flex gap-2 text-[10px] leading-relaxed text-ink-600"><span className="mono-num shrink-0 text-brand-600">0{i + 1}</span><span>{t}</span></div>
                  ))}
                </div>
              </div>
            )}
          </Card>
          <Card>
            <SectionHeader title="证据与口径" sub="评审可逐项复算" icon={<Info size={16} />} />
            <div className="space-y-2">
              {result?.evidence.map((e) => (
                <div key={e.label} className="flex gap-2.5 rounded-xl border border-ink-200/70 bg-surface-2/60 p-2.5">
                  <span className="chip h-fit shrink-0 border-brand-100 bg-brand-50 text-[9.5px] text-brand-700">{e.label}</span>
                  <span className="text-[10.5px] leading-relaxed text-ink-600">{e.text}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-ink-200/70 p-3">
              <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-800"><FileText size={13} className="text-brand-600" /> 生成改革后课程大纲</div>
              <div className="mt-2 flex gap-2">
                <select value={syllabusCourse} onChange={(e) => setSyllabusCourse(e.target.value)} className="input !py-1.5 !text-xs">
                  {catalog?.curriculum.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <button onClick={generateSyllabus} disabled={syllabusBusy} className="btn-soft shrink-0 !py-1.5 !text-xs">
                  {syllabusBusy ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />} 生成
                </button>
              </div>
              {showSyllabus && (
                <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-ink-200/70 bg-surface-2/60 p-3">
                  {syllabusBusy ? <Loading text="正在编排大纲…" /> : <MarkdownLite text={syllabus} />}
                </div>
              )}
              {syllabus && !syllabusBusy && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => download(`${syllabusCourse}-教学大纲.md`, syllabus, 'text/markdown')} className="btn-ghost !py-1.5 !text-xs"><Download size={12} /> 下载 .md</button>
                  <button onClick={() => setShowSyllabus(false)} className="btn-ghost !py-1.5 !text-xs">收起</button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* 结果面板 */}
        <div className="space-y-5 lg:col-span-7">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {KPI.map((k) => {
              const Icon = k.icon;
              const b = result ? (result.before[k.key] as number) : 0;
              const a = result ? (result.after[k.key] as number) : 0;
              const d = +(a - b).toFixed(1);
              const good = 'inverse' in k && k.inverse ? d < 0 : d > 0;
              return (
                <div key={k.key} className="card card-hover animate-fade-up p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] text-ink-400">{k.label}</span>
                    <Icon size={14} className={k.tone} />
                  </div>
                  <div className="mono-num mt-1.5 flex items-baseline gap-1 text-[23px] font-bold leading-none text-ink-900">
                    {result ? a : '—'}<span className="text-[10px] font-normal text-ink-400">{k.unit}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className={`mono-num text-[10px] font-semibold ${d === 0 ? 'text-ink-400' : good ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {d > 0 ? '+' : ''}{d} {k.unit}
                    </span>
                    {busy && <Loader2 size={10} className="animate-spin text-brand-500" />}
                  </div>
                  <div className="mt-2"><ProgressBar value={Math.min(100, (a / k.max) * 100)} tone={d < 0 && !('inverse' in k && k.inverse) ? 'red' : 'green'} /></div>
                </div>
              );
            })}
            <div className="card card-hover animate-fade-up p-3.5">
              <div className="flex items-center justify-between"><span className="text-[10.5px] text-ink-400">总学时成本</span><Clock3 size={14} className="text-brand-600" /></div>
              <div className="mono-num mt-1.5 flex items-baseline gap-1 text-[23px] font-bold leading-none text-ink-900">{result?.after.totalHours ?? '—'}<span className="text-[10px] font-normal text-ink-400">h</span></div>
              <div className="mono-num mt-2 text-[10px] text-ink-400">现行 {result?.before.totalHours ?? '—'}h · 预算上限 {(result?.before.totalHours ?? 0) + budget}h</div>
              <div className="mt-2"><ProgressBar value={result ? Math.min(100, (result.after.totalHours / ((result.before.totalHours || 1) + budget)) * 100) : 0} tone="brand" /></div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <SectionHeader title="五维改革成效" sub="蓝：改革方案｜灰虚线：现行方案" icon={<TrendingUp size={16} />} extra={<Badge tone="blue">实时</Badge>} />
              {radar ? <EChart option={radar} height={290} /> : <Loading />}
            </Card>
            <Card>
              <SectionHeader title="指标前后对比" sub="绿色表示改善方向" icon={<Layers3 size={16} />} />
              <div className="space-y-2.5">
                {result ? (
                  <>
                    <DeltaBar label="目标岗位匹配度" before={result.before.match} after={result.after.match} unit=" 分" />
                    <DeltaBar label="毕业要求均衡度" before={result.before.balance} after={result.after.balance} unit=" 分" />
                    <DeltaBar label="现代工具覆盖" before={result.before.modern} after={result.after.modern} unit=" 分" />
                    <DeltaBar label="待调整知识点" before={result.before.gapCount} after={result.after.gapCount} unit=" 项" max={30} inverse />
                  </>
                ) : <Loading />}
              </div>
            </Card>
          </div>

          <Card>
            <SectionHeader title="岗位技能覆盖明细" sub="每一行都由「知识点语义对齐 × 教学覆盖系数」计算得出" icon={<Target size={16} />}
              extra={<Badge tone="gray">{result?.skillRows.length ?? 0} 项技能</Badge>} />
            <div className="space-y-2">
              {result?.skillRows.map((r) => (
                <div key={r.name} className="rounded-xl border border-ink-200/70 bg-surface-2/50 p-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-medium text-ink-800">{r.name}</span>
                    <span className="chip border-ink-200 bg-surface px-1.5 py-0.5 text-[9px] text-ink-400">需求 {r.demand}</span>
                    <span className="mono-num ml-auto text-[10.5px] text-ink-400">{r.before}% → <b className={r.after > r.before ? 'text-emerald-600' : r.after < r.before ? 'text-rose-600' : 'text-ink-700'}>{r.after}%</b></span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${r.after}%` }} />
                    </div>
                    <span className="hidden w-[178px] truncate text-[9.5px] text-ink-400 sm:inline">{r.coveredBy}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
