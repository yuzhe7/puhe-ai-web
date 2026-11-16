'use client';

import { useRef, useState } from 'react';
import {
  Microscope, Sparkles, Send, Download, Loader2, BookOpen, Wrench, ShieldCheck,
  CircleCheck, FileText, Clock3, Layers3, ArrowRight, RotateCcw, Quote,
} from 'lucide-react';
import { Card, SectionHeader, Badge, MarkdownLite, ProgressBar, Empty } from '@/components/ui';
import type { ResearchEvent, ResearchSource } from '@/lib/ai/research';

const TOPICS = [
  '人工智能专业课程体系如何适配大模型时代的岗位需求？',
  '计算机科学与技术专业的同质化风险与差异化改造路径',
  '《数据结构》课程改革对 AI 应用开发岗位就业竞争力的影响',
  '工程教育认证 12 项毕业要求与京津冀产业需求的偏差研究',
];

interface Phase { key: string; label: string; text: string; progress: number }
interface EvidenceGroup { index: number; question: string; items: ResearchSource[] }
interface Finding { index: number; question: string; summary: string; confidence: number; citations: number[] }
interface Done { confidence: number; sources: number; toolCalls: number; durationMs: number; mode: 'llm' | 'local' }

const EMPTY = () => ({
  running: false, phases: [] as Phase[], questions: [] as string[],
  evidence: [] as EvidenceGroup[], tools: [] as { name: string; label: string; summary: string }[],
  findings: [] as Finding[], report: '', crosscheck: null as { text: string; uniqueSources: number; duplicates: number } | null,
  done: null as Done | null, error: '',
});

type State = ReturnType<typeof EMPTY>;

export default function ResearchPage() {
  const [query, setQuery] = useState(TOPICS[0]);
  const [s, setS] = useState<State>(EMPTY());
  const abortRef = useRef<AbortController | null>(null);

  const patch = (fn: (p: State) => State) => setS((p) => fn(p));

  const run = async (q: string) => {
    const text = q.trim();
    if (!text || s.running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setS({ ...EMPTY(), running: true });
    try {
      const res = await fetch('/api/research', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }), signal: controller.signal,
      });
      if (!res.body) throw new Error('服务端未返回研究流');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const e = JSON.parse(line.slice(5).trim()) as ResearchEvent;
            if (e.type === 'phase') patch((p) => ({ ...p, phases: [...p.phases.filter((x) => x.key !== e.key), e] }));
            else if (e.type === 'plan') patch((p) => ({ ...p, questions: e.questions }));
            else if (e.type === 'evidence') patch((p) => ({ ...p, evidence: [...p.evidence, e] }));
            else if (e.type === 'tool') patch((p) => ({ ...p, tools: [...p.tools, e] }));
            else if (e.type === 'finding') patch((p) => ({ ...p, findings: [...p.findings, e] }));
            else if (e.type === 'crosscheck') patch((p) => ({ ...p, crosscheck: { text: e.text, uniqueSources: e.uniqueSources, duplicates: e.duplicates } }));
            else if (e.type === 'delta') patch((p) => ({ ...p, report: p.report + e.text }));
            else if (e.type === 'error') patch((p) => ({ ...p, error: e.message }));
            else if (e.type === 'done') patch((p) => ({ ...p, done: { confidence: e.confidence, sources: e.sources, toolCalls: e.toolCalls, durationMs: e.durationMs, mode: e.mode }, running: false }));
          } catch { /* 忽略心跳行 */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') patch((p) => ({ ...p, error: (err as Error).message, running: false }));
    } finally {
      patch((p) => ({ ...p, running: false }));
    }
  };

  const exportMd = () => {
    if (!s.report) return;
    const sources = Array.from(new Map(s.evidence.flatMap((g) => g.items).map((i) => [i.source, i])).values());
    const md = [
      `# Deep Research · ${query}`, '',
      `> 生成时间：${new Date().toLocaleString('zh-CN')}｜置信度 ${s.done?.confidence ?? '—'}%｜独立证据源 ${s.done?.sources ?? sources.length} 个｜工具调用 ${s.done?.toolCalls ?? s.tools.length} 次`, '',
      s.report, '', '## 参考证据', ...sources.map((x, i) => `- [${i + 1}] ${x.title} · ${x.source}（相关度 ${x.score}）`), '',
    ].join('\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'puhe-deep-research.md'; a.click();
    URL.revokeObjectURL(url);
  };

  const sources = Array.from(new Map(s.evidence.flatMap((g) => g.items).map((i) => [i.source, i])).values());
  const progress = s.phases.length ? s.phases[s.phases.length - 1].progress : 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="tech-panel glow-border animate-fade-up rounded-2xl p-5 sm:p-6">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue"><Microscope size={11} /> Deep Research</Badge>
            <Badge tone="green">4 路并行取证 · 交叉验证</Badge>
            <Badge tone="orange">SSE 流式 · 引用可溯</Badge>
          </div>
          <h2 className="mt-3 text-[21px] font-bold tracking-tight text-ink-900 sm:text-[25px]">让多智能体替你把一个问题「查透」</h2>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-ink-500">
            规划智能体拆解子问题 → 检索智能体多路 RAG 取证 → 对齐智能体调用确定性工具计算 → 交叉验证去重 → 报告智能体输出带 [n] 引用的研究简报。
            配置大模型后仅替换语言组织，数值结论始终来自算法工具。
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={2}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void run(query); }}
              className="input flex-1 resize-none !py-2.5 text-[13px]" placeholder="输入一个需要多源证据的研究问题…" />
            <div className="flex shrink-0 gap-2">
              <button onClick={() => void run(query)} disabled={s.running || !query.trim()} className="btn-primary !px-5">
                {s.running ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} 开始研究
              </button>
              <button onClick={() => { abortRef.current?.abort(); setS(EMPTY()); }} className="btn-ghost !px-3" title="重置"><RotateCcw size={15} /></button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {TOPICS.map((t) => (
              <button key={t} onClick={() => { setQuery(t); void run(t); }} disabled={s.running}
                className="chip border-ink-200 bg-surface-2 text-[10px] text-ink-500 hover:border-brand-300 hover:text-brand-700 disabled:opacity-40">
                <Sparkles size={10} /> {t.length > 22 ? `${t.slice(0, 21)}…` : t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {s.running && (
        <div className="card animate-fade-up px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-ink-500">
            <span className="flex items-center gap-2"><span className="live-dot" /> {s.phases.at(-1)?.label || '正在启动研究流程'} · {s.phases.at(-1)?.text || ''}</span>
            <span className="mono-num">{progress}%</span>
          </div>
          <div className="mt-2"><ProgressBar value={progress} /></div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        {/* 研究轨迹 */}
        <div className="space-y-5 lg:col-span-5">
          <Card className="animate-fade-up">
            <SectionHeader title="研究轨迹" sub="每一步都是真实执行的 Agent 动作" icon={<Layers3 size={16} />}
              extra={<Badge tone="blue">{s.phases.length} 阶段</Badge>} />
            {!s.phases.length ? <Empty text="点击「开始研究」查看多智能体执行轨迹" /> : (
              <div className="space-y-2">
                {s.phases.map((p, i) => (
                  <div key={`${p.key}-${i}`} className="flex animate-fade-up gap-2.5 rounded-xl border border-ink-200/70 bg-surface-2/60 p-2.5">
                    <span className="mono-num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand-50 text-[10px] font-bold text-brand-700">0{i + 1}</span>
                    <div className="min-w-0">
                      <div className="text-[11.5px] font-semibold text-ink-800">{p.label}</div>
                      <div className="mt-0.5 text-[10.5px] leading-relaxed text-ink-500">{p.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {!!s.questions.length && (
            <Card className="animate-fade-up">
              <SectionHeader title="子问题拆解" sub="规划智能体输出的独立取证单元" icon={<Microscope size={16} />} />
              <div className="space-y-1.5">
                {s.questions.map((q, i) => (
                  <div key={i} className="flex gap-2 rounded-lg border border-ink-200/70 bg-surface-2/50 p-2.5 text-[10.5px] leading-relaxed text-ink-600">
                    <span className="mono-num shrink-0 text-brand-600">Q{i + 1}</span><span>{q}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!!s.tools.length && (
            <Card className="animate-fade-up">
              <SectionHeader title="工具调用与发现" sub="Function Calling 真实执行记录" icon={<Wrench size={16} />} extra={<Badge tone="gray">{s.tools.length} 次</Badge>} />
              <div className="space-y-1.5">
                {s.tools.map((t, i) => {
                  const f = s.findings.find((x) => x.index === Math.min(3, Math.floor(i)));
                  return (
                    <div key={i} className="rounded-lg border border-ink-200/70 bg-surface-2/50 p-2.5">
                      <div className="flex items-center gap-2"><code className="mono-num rounded bg-brand-50 px-1.5 py-0.5 text-[9.5px] text-brand-700">{t.name}</code><span className="text-[10px] text-ink-500">{t.summary}</span></div>
                      {f && <div className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-ink-400"><span className="text-emerald-600">置信 {f.confidence}%</span><span>·</span><span className="truncate">{f.summary.slice(0, 70)}…</span></div>}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {s.crosscheck && (
            <Card className="animate-fade-up">
              <SectionHeader title="交叉验证" sub="来源去重与数值溯源" icon={<ShieldCheck size={16} />} />
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[10.5px] leading-relaxed text-ink-600">
                <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-emerald-700"><CircleCheck size={13} /> {s.crosscheck.uniqueSources} 个独立证据源</div>
                {s.crosscheck.text}
              </div>
            </Card>
          )}
        </div>

        {/* 简报 */}
        <div className="space-y-5 lg:col-span-7">
          <Card className="animate-fade-up">
            <SectionHeader title="研究简报" sub="带 [n] 引用 · 逐 token 流式生成" icon={<FileText size={16} />}
              extra={<div className="flex items-center gap-2">
                {s.done && <Badge tone={s.done.mode === 'llm' ? 'green' : 'amber'}>{s.done.mode === 'llm' ? '大模型综合' : '本地确定性引擎'}</Badge>}
                <button onClick={exportMd} disabled={!s.report} className="btn-ghost !py-1.5 !text-xs"><Download size={12} /> 导出</button>
              </div>} />
            {s.error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-[11px] text-rose-700">{s.error}</div>}
            {!s.report ? <Empty text={s.running ? '研究进行中，简报将随流式输出实时呈现…' : '尚未生成简报'} /> : (
              <div className="max-h-[560px] overflow-y-auto pr-1"><MarkdownLite text={s.report} />{s.running && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse-soft bg-brand-500 align-middle" />}</div>
            )}
          </Card>

          {s.done && (
            <div className="grid animate-fade-up grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { l: '综合置信度', v: `${s.done.confidence}%`, i: ShieldCheck },
                { l: '独立证据源', v: s.done.sources, i: BookOpen },
                { l: '工具调用', v: s.done.toolCalls, i: Wrench },
                { l: '耗时', v: `${(s.done.durationMs / 1000).toFixed(1)}s`, i: Clock3 },
              ].map((x) => {
                const I = x.i;
                return (
                  <div key={x.l} className="card p-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-ink-400"><I size={11} /> {x.l}</div>
                    <div className="mono-num mt-1 text-[19px] font-bold text-ink-900">{x.v}</div>
                  </div>
                );
              })}
            </div>
          )}

          <Card className="animate-fade-up">
            <SectionHeader title="参考证据" sub={`${sources.length} 条独立来源 · 每条都可回溯到原始语料`} icon={<Quote size={16} />} />
            {!sources.length ? <Empty text="研究开始后自动列出去重后的证据片段" /> : (
              <div className="space-y-2">
                {sources.slice(0, 10).map((h, i) => (
                  <div key={`${h.source}-${i}`} className="rounded-xl border border-ink-200/70 bg-surface-2/50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mono-num rounded bg-brand-50 px-1.5 py-0.5 text-[9.5px] font-bold text-brand-700">[{i + 1}]</span>
                      <span className="text-[11.5px] font-medium text-ink-800">{h.title}</span>
                      <span className="mono-num ml-auto text-[9.5px] text-ink-400">score {h.score}</span>
                    </div>
                    <div className="mt-1.5 text-[10.5px] leading-relaxed text-ink-500">{h.snippet}…</div>
                    <div className="mt-1.5 flex items-center gap-1 text-[9.5px] text-ink-400"><ArrowRight size={10} /> {h.source}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
