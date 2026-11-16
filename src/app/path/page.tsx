'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Route, GraduationCap, BriefcaseBusiness, Download, Sparkles, Target, Clock3,
  Check, X, Search, ArrowRight, BookOpen, Loader2, Info, Map, Zap, Layers3,
} from 'lucide-react';
import { Card, SectionHeader, Badge, Loading, MarkdownLite, ProgressBar } from '@/components/ui';
import { pathGraphOption } from '@/lib/charts';
import { autoMatchJob } from '@/lib/major-context';
import type { PathResult } from '@/lib/pathway';

const EChart = dynamic(() => import('@/components/EChart'), { ssr: false, loading: () => <Loading /> });

interface Catalog {
  jobs: { title: string; industry: string; count: number; skills: string[] }[];
  majors: string[];
  knowledgePoints: { name: string; hours: number; demand: number; course: string }[];
}

const PRESETS: { label: string; pick: (list: Catalog['knowledgePoints']) => string[] }[] = [
  { label: '零基础', pick: () => [] },
  { label: '已修基础课', pick: (l) => l.filter((k) => k.demand < 70).slice(0, 10).map((k) => k.name) },
  { label: '已修核心课', pick: (l) => l.filter((k) => k.demand >= 60).slice(0, 16).map((k) => k.name) },
];

function ReadinessRing({ value }: { value: number }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-[132px] w-[132px] shrink-0 place-items-center">
      <svg viewBox="0 0 132 132" className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" /><stop offset="100%" stopColor="#3461f4" />
          </linearGradient>
        </defs>
        <circle cx="66" cy="66" r={r} fill="none" stroke="rgb(var(--ink-200))" strokeWidth="10" />
        <circle cx="66" cy="66" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} className="transition-all duration-700" />
      </svg>
      <div className="text-center">
        <div className="mono-num text-[27px] font-bold leading-none text-ink-900">{value}<span className="text-[12px] text-ink-400">%</span></div>
        <div className="mt-1 text-[10px] text-ink-400">能力就绪度</div>
      </div>
    </div>
  );
}

export default function PathPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [job, setJob] = useState('AI应用开发工程师');
  const [major, setMajor] = useState('计算机科学与技术');
  const [known, setKnown] = useState<string[]>([]);
  const [result, setResult] = useState<PathResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [autoHint, setAutoHint] = useState('');

  // 深链接 /path?job=xxx&major=xxx：只带专业时自动匹配契合度最高的目标岗位
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const j = p.get('job'), m = p.get('major');
    if (j) setJob(j);
    if (m) setMajor(m);
    if (m && !j) void autoMatchJob(m, (value, hint) => { setJob(value); setAutoHint(hint); });
    if (m && j) setAutoHint(`已按专业目录自动带入目标岗位「${j}」`);
  }, []);

  // 手动切换专业时联动重匹配目标岗位并清空已掌握知识点；手动改岗位则保留用户选择
  const switchMajor = (next: string) => {
    setMajor(next);
    setKnown([]);
    setAutoHint('');
    void autoMatchJob(next, (value, hint) => { setJob(value); setAutoHint(hint); });
  };

  useEffect(() => {
    fetch(`/api/path?major=${encodeURIComponent(major)}`).then((r) => r.json()).then((d: Catalog) => setCatalog(d)).catch(() => null);
  }, [major]);

  const plan = useCallback(async (j: string, m: string, k: string[]) => {
    setBusy(true);
    try {
      const res = await fetch('/api/path', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: j, major: m, known: k }),
      });
      setResult(await res.json() as PathResult);
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void plan(job, major, known); }, [job, major, known, plan]);

  const graph = useMemo(() => result ? pathGraphOption(result.graph) : null, [result]);
  const filteredKps = useMemo(() => (catalog?.knowledgePoints || []).filter((k) => !filter || k.name.includes(filter) || k.course.includes(filter)), [catalog, filter]);
  const jobMeta = catalog?.jobs.find((j) => j.title === job);

  const exportMd = () => {
    if (!result) return;
    const lines = [
      `# ${result.job} · 岗位能力补强学习计划`, '',
      `- 专业：${result.major}`, `- 加权能力就绪度：${result.readiness}%`, `- 预计补强学时：${result.estimatedHours}h`, '',
      `## 技能路径`, ...result.skillPaths.map((s) => `- **${s.skill}**（需求 ${s.demand}｜就绪 ${s.readiness}%）：${s.path.join(' → ') || '需新建产业模块'}｜${s.action}`), '',
      `## 分学期计划`, ...result.semesters.flatMap((s) => [`### ${s.name} · ${s.focus}（${s.hours}h）`, ...s.items.map((i) => `- ${i.type}：${i.name}（${i.course}，${i.hours}h）— ${i.note}`)]), '',
      `## 说明`, ...result.advice.map((a) => `- ${a.replace(/\*/g, '')}`), '',
      `> 由谱合产教 AI Native 平台生成，路径基于知识点共现图 + 跨域语义对齐的多源 Dijkstra 最短路径。`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `puhe-path-${result.job}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="tech-panel glow-border animate-fade-up rounded-2xl p-5 sm:p-6">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue"><Route size={11} /> Graph Shortest Path</Badge>
              <Badge tone="green">多源 Dijkstra · 确定性图算法</Badge>
              <Badge tone="orange">学生视角 / 个性化</Badge>
            </div>
            <h2 className="mt-3 text-[21px] font-bold tracking-tight text-ink-900 sm:text-[25px]">从「我现在会什么」到「岗位要我懂什么」，最短怎么走？</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-500">
              选择目标岗位与已掌握知识点，平台在「知识点共现 × 产业技能语义对齐」图上求最小学习成本路径，
              自动排出分学期补强计划与学时预算，把面向管理者的诊断能力下沉到每个学生。
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportMd} disabled={!result} className="btn-ghost !text-xs"><Download size={14} /> 导出学习计划</button>
            <button onClick={() => void plan(job, major, known)} disabled={busy} className="btn-primary !text-xs">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} 重新规划
            </button>
          </div>
        </div>
        <div className="relative z-10 mt-5 flex flex-wrap items-center gap-3 border-t border-ink-200/70 pt-4">
          <label className="flex items-center gap-2 text-[11.5px] text-ink-500">目标岗位
            <select value={job} onChange={(e) => { setJob(e.target.value); setAutoHint(''); }} className="input !w-auto !py-1.5 !text-xs">
              {catalog?.jobs.map((j) => <option key={j.title} value={j.title}>{j.title}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11.5px] text-ink-500">所在专业
            <select value={major} onChange={(e) => switchMajor(e.target.value)} className="input !w-auto !py-1.5 !text-xs">
              {catalog?.majors.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          {jobMeta && <span className="chip border-ink-200 bg-surface-2 text-[10px] text-ink-500"><BriefcaseBusiness size={11} /> 在招 {jobMeta.count.toLocaleString()} · {jobMeta.skills.length} 项核心技能</span>}
          <span className="chip border-brand-200 bg-brand-50 text-[10px] text-brand-700"><GraduationCap size={11} /> 已选 {known.length} 个知识点</span>
          {autoHint && <div className="w-full text-[10.5px] text-brand-700"><Sparkles size={11} className="mr-1 inline" />{autoHint} · 已自动重新规划学习路径</div>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* 已掌握知识点 */}
        <div className="space-y-5 lg:col-span-4">
          <Card className="animate-fade-up">
            <SectionHeader title="我已掌握的知识点" sub="勾选后即时重算最短补强路径" icon={<Check size={16} />}
              extra={<button onClick={() => setKnown([])} className="chip border-ink-200 bg-surface-2 text-[10px] text-ink-500 hover:text-rose-600"><X size={10} /> 清空</button>} />
            <div className="mb-3 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => setKnown(p.pick(catalog?.knowledgePoints || []))}
                  className="chip border-ink-200 bg-surface-2 text-[10px] text-ink-500 hover:border-brand-300 hover:text-brand-700">{p.label}</button>
              ))}
            </div>
            <div className="relative mb-3">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="搜索知识点 / 课程…" className="input !py-2 !pl-8 !text-xs" />
            </div>
            <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
              {filteredKps.map((k) => {
                const on = known.includes(k.name);
                return (
                  <button key={k.name} onClick={() => setKnown((prev) => on ? prev.filter((x) => x !== k.name) : [...prev, k.name])}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${on ? 'border-emerald-300 bg-emerald-50/70' : 'border-ink-200/70 bg-surface-2/50 hover:border-brand-300'}`}>
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-300'}`}>{on && <Check size={10} />}</span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-700">{k.name}</span>
                    <span className="mono-num shrink-0 text-[9.5px] text-ink-400">{k.demand}</span>
                  </button>
                );
              })}
              {!filteredKps.length && <div className="py-6 text-center text-[11px] text-ink-400">没有匹配的知识点</div>}
            </div>
          </Card>
          <Card>
            <SectionHeader title="分学期学习计划" sub="按课程先修顺序排序，每学期学时预算 96h" icon={<GraduationCap size={16} />} />
            <div className="grid gap-3 grid-cols-1">
              {result?.semesters.map((s, i) => (
                <div key={s.name} className="glow-border relative rounded-xl border border-ink-200/70 bg-surface-2/50 p-3.5">
                  <div className="mono-num absolute right-3 top-2 text-[26px] font-bold text-ink-100">0{i + 1}</div>
                  <div className="text-[12.5px] font-semibold text-ink-900">{s.name}</div>
                  <div className="mt-0.5 text-[10.5px] text-brand-700">{s.focus}</div>
                  <div className="mono-num mt-2 text-[10px] text-ink-400">{s.items.length} 项 · {s.hours}h</div>
                  <div className="mt-2 space-y-1.5">
                    {s.items.slice(0, 8).map((it, k) => (
                      <div key={`${it.name}-${k}`} className="flex items-start gap-1.5 rounded-lg bg-surface px-2 py-1.5 text-[10px] leading-snug text-ink-600">
                        <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${it.type === '产业模块' ? 'bg-orange-500' : 'bg-brand-500'}`} />
                        <span className="min-w-0 flex-1"><b className="font-medium text-ink-800">{it.name}</b><br /><span className="text-ink-400">{it.course} · {it.hours}h</span></span>
                      </div>
                    ))}
                    {!s.items.length && <div className="rounded-lg bg-surface px-2 py-3 text-center text-[10px] text-ink-400">能力已达标 · 参与企业级项目巩固</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* 规划结果 */}
        <div className="space-y-5 lg:col-span-8">
          <Card className="animate-fade-up">
            <div className="flex flex-wrap items-center gap-6">
              <ReadinessRing value={result?.readiness ?? 0} />
              <div className="min-w-[180px] flex-1">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-900"><Target size={15} className="text-brand-600" /> {result?.job || job} · 能力画像</div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-500">按岗位 JD 技能需求强度加权计算就绪度，低就绪技能优先进入补强计划。</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { l: '预计学时', v: result?.estimatedHours ?? '—', u: 'h', i: Clock3 },
                    { l: '学期数', v: result?.semesters.length ?? '—', u: '期', i: Layers3 },
                    { l: '待补技能', v: result?.skillPaths.filter((s) => s.readiness < 70).length ?? '—', u: '项', i: Zap },
                  ].map((x) => {
                    const I = x.i;
                    return (
                      <div key={x.l} className="rounded-xl border border-ink-200/70 bg-surface-2/60 p-2.5">
                        <div className="flex items-center gap-1 text-[10px] text-ink-400"><I size={11} /> {x.l}</div>
                        <div className="mono-num mt-1 text-[17px] font-bold text-ink-900">{x.v}<span className="ml-0.5 text-[10px] font-normal text-ink-400">{x.u}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <SectionHeader title="补强路径图" sub="绿：已掌握｜蓝：待补强｜橙：目标技能" icon={<Map size={16} />} extra={<Badge tone="blue">{result?.graph.nodes.length ?? 0} 节点</Badge>} />
              {graph ? <EChart option={graph} height={300} /> : <Loading />}
            </Card>
            <Card>
              <SectionHeader title="AI 规划结论" sub="数值由图算法产出，可逐项复算" icon={<Sparkles size={16} />} />
              {result ? <MarkdownLite text={result.advice.map((a, i) => `${i + 1}. ${a}`).join('\n')} /> : <Loading />}
              <div className="mt-4 space-y-2">
                {result?.evidence.map((e) => (
                  <div key={e.label} className="flex gap-2 rounded-lg border border-ink-200/70 bg-surface-2/60 p-2.5">
                    <span className="chip h-fit shrink-0 border-brand-100 bg-brand-50 text-[9px] text-brand-700">{e.label}</span>
                    <span className="text-[10.5px] leading-relaxed text-ink-600">{e.text}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <SectionHeader title="技能 → 知识点 最短补强路径" sub="点击任一技能查看路径细节" icon={<Route size={16} />}
              extra={<Badge tone="gray">{result?.skillPaths.length ?? 0} 项技能</Badge>} />
            <div className="space-y-2">
              {result?.skillPaths.map((s) => {
                const expanded = activeSkill === s.skill;
                return (
                  <button key={s.skill} onClick={() => setActiveSkill(expanded ? null : s.skill)}
                    className="w-full rounded-xl border border-ink-200/70 bg-surface-2/50 p-3 text-left transition-colors hover:border-brand-300">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-medium text-ink-800">{s.skill}</span>
                      <span className={`chip border-ink-200 bg-surface px-1.5 py-0.5 text-[9px] ${s.trend === 'up' ? 'text-orange-700' : 'text-ink-400'}`}>需求 {s.demand} · {s.trend === 'up' ? '↑ 上升' : '→ 平稳'}</span>
                      <span className="chip border-ink-200 bg-surface px-1.5 py-0.5 text-[9px] text-ink-400">置信 {s.confidence}%</span>
                      <span className="mono-num ml-auto text-[11px] text-ink-500">就绪 <b className={s.readiness >= 70 ? 'text-emerald-600' : s.readiness >= 40 ? 'text-amber-600' : 'text-rose-600'}>{s.readiness}%</b></span>
                    </div>
                    <div className="mt-2"><ProgressBar value={s.readiness} tone={s.readiness >= 70 ? 'green' : s.readiness >= 40 ? 'orange' : 'red'} /></div>
                    {expanded && (
                      <div className="mt-3 animate-fade-up rounded-lg border border-brand-100 bg-brand-50/50 p-3">
                        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                          {s.path.length ? s.path.map((p, i) => (
                            <span key={`${p}-${i}`} className="flex items-center gap-1.5">
                              {i > 0 && <ArrowRight size={11} className="text-brand-500" />}
                              <span className="rounded-md bg-surface px-1.5 py-1 text-ink-700">{p}</span>
                            </span>
                          )) : <span className="text-ink-500">知识体系中暂无直接对应节点，需校企共建产业实训模块。</span>}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-ink-500">
                          <span className="flex items-center gap-1"><BookOpen size={11} /> {s.courses.join(' / ') || '企业实训'}</span>
                          <span className="flex items-center gap-1"><Clock3 size={11} /> {s.hours}h</span>
                          <span className="flex items-center gap-1"><Info size={11} /> {s.action}</span>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
