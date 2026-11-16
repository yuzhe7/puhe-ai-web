'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bot, User, Send, Sparkles, Mic, MicOff, Volume2, Square, ShieldCheck,
  Wrench, BookOpen, ArrowRight, RotateCcw, Cpu, Network, FileText,
} from 'lucide-react';
import { Card, SectionHeader, Badge, MarkdownLite, Empty } from '@/components/ui';
import { AGENT_ROLES } from '@/lib/ai/prompts';
import type { StreamEvent, AgentCard } from '@/lib/types';

const QUICK_PROMPTS = [
  '计算机科学与技术和软件工程是不是太像了？',
  '《数据结构》这门课应该怎么改？',
  '分析培养目标与岗位能力的偏差',
  'AI应用开发工程师岗位需要哪些技能？',
  '生成一份面向院系负责人的三维诊断报告',
];

interface StepItem { agent: string; stage: string; text: string }
interface ToolItem { name: string; label: string; args: Record<string, unknown>; summary: string }
interface Citation { source: string; title: string; snippet: string }
interface Turn {
  id: string;
  content: string;
  steps: StepItem[];
  tools: ToolItem[];
  cards: AgentCard[];
  citations: Citation[];
  safety: { level: string; text: string }[];
  mode?: 'llm' | 'local';
  done: boolean;
  error?: string;
}
type Message = { id: string; role: 'user'; content: string } | ({ id: string; role: 'assistant' } & Turn);

function CardView({ card }: { card: AgentCard }) {
  if (card.kind === 'report' && (card.payload as { type?: string })?.type === 'citations') {
    const items = (card.payload as { items: { title: string; snippet: string; score: number }[] }).items;
    return (
      <div className="mt-2 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-700"><BookOpen size={13} /> {card.title}</div>
        <div className="space-y-1.5">{items.map((it, i) => (
          <div key={i} className="text-[10.5px] leading-relaxed text-ink-600"><span className="font-medium text-ink-800">{it.title}</span> <span className="text-ink-300">({it.score})</span><br />{it.snippet}…</div>
        ))}</div>
      </div>
    );
  }
  const p = card.payload as Record<string, unknown>;
  const rows = (p.rows || p.items || []) as Record<string, unknown>[];
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-brand-100">
      <div className="flex items-center gap-1.5 bg-brand-50 px-3 py-2 text-[11.5px] font-semibold text-brand-700">
        <Sparkles size={13} /> 生成式 UI 卡片 · {card.title}
      </div>
      <div className="max-h-52 overflow-y-auto p-3">
        {rows.length ? (
          <div className="space-y-1.5">
            {rows.slice(0, 8).map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[10.5px] text-ink-600">
                <span className="font-medium text-ink-800">{String(r.a || r.name || r.code || r.title || `#${i + 1}`)}</span>
                {r.b !== undefined && <span>↔ {String(r.b)}</span>}
                {(r.score ?? r.demand ?? r.gap ?? r.label) !== undefined && (
                  <span className="ml-auto font-mono text-brand-700">{String(r.score ?? r.demand ?? r.gap ?? r.label)}</span>
                )}
                {typeof r.state === 'string' && <span className="ml-auto">{r.state}</span>}
              </div>
            ))}
          </div>
        ) : <div className="text-[10.5px] text-ink-400">{JSON.stringify(p).slice(0, 160)}</div>}
      </div>
    </div>
  );
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mode, setMode] = useState<'llm' | 'local' | null>(null);
  const [warn, setWarn] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);
  const recognitionRef = useRef<{ stop: () => void; start: () => void } | null>(null);

  useEffect(() => {
    fetch('/api/status').then((r) => r.json()).then((s) => setMode(s.mode)).catch(() => null);
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true); setInput(''); setWarn('');
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: q };
    const turnId = `a-${Date.now()}`;
    const turn: Message = { id: turnId, role: 'assistant', content: '', steps: [], tools: [], cards: [], citations: [], safety: [], done: false };
    setMessages((prev) => [...prev, userMsg, turn]);

    const patch = (fn: (t: Turn) => Turn) => setMessages((prev) => prev.map((m) => m.id === turnId && m.role === 'assistant' ? { ...m, ...fn(m as Turn) } : m));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, history: messages.filter((m) => m.role === 'user').slice(-4).map((m) => ({ role: 'user', content: m.content })) }),
      });
      if (!res.body) throw new Error('服务端未返回流');
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
            const e = JSON.parse(line.slice(5).trim()) as StreamEvent;
            if (e.type === 'step') patch((t) => ({ ...t, steps: [...t.steps, { agent: e.agent, stage: e.stage, text: e.text }] }));
            else if (e.type === 'tool') patch((t) => ({ ...t, tools: [...t.tools, { name: e.name, label: e.label, args: e.args, summary: e.summary }] }));
            else if (e.type === 'delta') patch((t) => ({ ...t, content: t.content + e.text }));
            else if (e.type === 'card') patch((t) => ({ ...t, cards: [...t.cards, e.card] }));
            else if (e.type === 'citations') patch((t) => ({ ...t, citations: e.items }));
            else if (e.type === 'safety') patch((t) => ({ ...t, safety: [...t.safety, { level: e.level, text: e.text }] }));
            else if (e.type === 'error') patch((t) => ({ ...t, error: e.message }));
            else if (e.type === 'done') patch((t) => ({ ...t, mode: e.mode, done: true }));
          } catch { /* 忽略心跳/不完整帧 */ }
        }
      }
      patch((t) => ({ ...t, done: true }));
    } catch (err) {
      patch((t) => ({ ...t, error: (err as Error).message, done: true }));
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (autoSent.current) return;
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) { autoSent.current = true; setInput(q); void send(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleVoice = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { setWarn('当前浏览器不支持语音识别，建议使用 Chrome / Edge'); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const rec = new Ctor();
    rec.lang = 'zh-CN'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (ev: SRResultEvent) => { const t = ev.results[0][0].transcript; setInput(t); setListening(false); };
    rec.onerror = () => { setListening(false); setWarn('语音识别失败，请检查麦克风权限'); };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec as unknown as { stop: () => void; start: () => void };
    rec.start(); setListening(true);
  };

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) { setWarn('当前浏览器不支持语音合成'); return; }
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(text.replace(/[*#>`]/g, '').slice(0, 600));
    u.lang = 'zh-CN'; u.rate = 1.05;
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u); setSpeaking(true);
  };

  const lastTurn = [...messages].reverse().find((m) => m.role === 'assistant') as (Turn & { id: string }) | undefined;

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 xl:grid-cols-[1fr_320px]">
      {/* 对话区 */}
      <Card pad={false} className="flex min-h-[640px] flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white"><Bot size={18} /></div>
            <div><div className="text-[13.5px] font-semibold text-ink-900">谱合产教 · 诊断 Copilot</div>
              <div className="text-[10.5px] text-ink-400">多 Agent 编排 · RAG 证据约束 · Function Calling · 流式生成</div></div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={mode === 'llm' ? 'green' : 'amber'}><Cpu size={11} />{mode === 'llm' ? '大模型 Agent' : '本地确定性引擎'}</Badge>
            <button className="btn-ghost !px-2.5 !py-1.5 !text-xs" onClick={() => { setMessages([]); setWarn(''); }}><RotateCcw size={13} /> 清空</button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-ink-50/30 p-5">
          {messages.length === 0 && (
            <div className="mx-auto max-w-lg pt-6 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Sparkles size={26} /></div>
              <h3 className="mt-4 text-[16px] font-semibold text-ink-900">你好，我是产教融合诊断智能体</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-500">
                我可以检索培养方案与招聘 JD、构建双侧三层图谱、运行三维诊断算法，并给出带证据溯源的课程改革指令。
                所有数值均来自确定性计算，不会凭空生成。
              </p>
              <div className="mt-5 grid gap-2 text-left">
                {QUICK_PROMPTS.map((q) => (
                  <button key={q} onClick={() => void send(q)} className="group flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[12px] text-ink-600 transition-all hover:border-brand-300 hover:text-brand-700 hover:shadow-sm">
                    <Sparkles size={13} className="shrink-0 text-brand-400" />{q}<ArrowRight size={13} className="ml-auto shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => m.role === 'user' ? (
            <div key={m.id} className="flex justify-end gap-2.5">
              <div className="max-w-[82%] rounded-2xl rounded-tr-md bg-brand-600 px-4 py-2.5 text-[12.5px] leading-relaxed text-white shadow-sm">{m.content}</div>
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-500"><User size={16} /></div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white"><Bot size={16} /></div>
              <div className="min-w-0 max-w-[86%] flex-1">
                {(m as Turn).steps.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {(m as Turn).steps.slice(-4).map((s, i) => (
                      <span key={i} className="chip border-brand-100 bg-brand-50/70 text-[10px] text-brand-700"><span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-brand-500" />{s.agent} · {s.stage}</span>
                    ))}
                  </div>
                )}
                <div className="rounded-2xl rounded-tl-md border border-ink-200 bg-white px-4 py-3 shadow-sm">
                  {(m as Turn).content ? <MarkdownLite text={(m as Turn).content} /> : (
                    <div className="flex items-center gap-2 py-1 text-[11.5px] text-ink-400"><span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" /> 智能体正在规划与检索…</div>
                  )}
                  {(m as Turn).cards.slice(0, 3).map((c, i) => <CardView key={i} card={c} />)}
                  {(m as Turn).done && (m as Turn).content && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-2.5">
                      <button onClick={() => speak((m as Turn).content)} className="inline-flex items-center gap-1 text-[10.5px] text-ink-400 hover:text-brand-600">
                        {speaking ? <Square size={11} /> : <Volume2 size={11} />} {speaking ? '停止朗读' : '朗读结论'}
                      </button>
                      <span className="text-[10.5px] text-ink-300">·</span>
                      <span className="text-[10.5px] text-ink-400">{(m as Turn).tools.length} 次工具调用 · {(m as Turn).citations.length} 条证据 · {(m as Turn).mode === 'llm' ? 'LLM 生成' : '本地引擎'}</span>
                    </div>
                  )}
                  {(m as Turn).error && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{(m as Turn).error}</div>}
                </div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="border-t border-ink-100 bg-white p-4">
          {warn && <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{warn}</div>}
          <div className="flex flex-wrap gap-1.5 pb-2.5">
            {QUICK_PROMPTS.slice(0, 3).map((q) => (
              <button key={q} onClick={() => void send(q)} disabled={busy} className="chip border-ink-200 bg-ink-50 text-[10.5px] text-ink-500 hover:border-brand-300 hover:text-brand-700 disabled:opacity-40">{q}</button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              className="input min-h-[62px] flex-1 resize-none !text-[12.5px]"
              placeholder="例如：计算机科学与技术和软件工程的同质化风险有多高？《数据结构》哪些知识点该精简？"
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            />
            <button onClick={toggleVoice} className={`btn-ghost !h-[42px] !w-[42px] !px-0 ${listening ? '!border-rose-300 !text-rose-600' : ''}`} title="语音输入">
              {listening ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            <button onClick={() => void send(input)} disabled={busy || !input.trim()} className="btn-primary !h-[42px] !px-4">
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send size={16} />}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10.5px] text-ink-400">
            <span>Enter 发送 · Shift+Enter 换行 · 支持语音提问与结论朗读</span>
            <span className="flex items-center gap-1"><ShieldCheck size={11} /> 输入注入拦截 / PII 脱敏 / 输出数值溯源</span>
          </div>
        </div>
      </Card>

      {/* Agent 工作流面板 */}
      <div className="space-y-4">
        <Card>
          <SectionHeader title="多 Agent 工作流" sub="五智能体分工，每一步可观测" icon={<Network size={15} />} />
          <div className="space-y-2">
            {AGENT_ROLES.map((r, i) => {
              const active = lastTurn?.steps.some((s) => s.agent === r.name);
              return (
                <div key={r.key} className={`flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors ${active ? 'border-brand-200 bg-brand-50/60' : 'border-ink-100 bg-white'}`}>
                  <span className="text-[16px]">{r.icon}</span>
                  <div className="min-w-0 flex-1"><div className="text-[11.5px] font-semibold text-ink-800">{r.name}</div><div className="truncate text-[10px] text-ink-400">{r.desc}</div></div>
                  <span className={`font-mono text-[10px] ${active ? 'text-brand-600' : 'text-ink-300'}`}>0{i + 1}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionHeader title="本轮执行轨迹" sub="Function Calling 实时调用记录" icon={<Wrench size={15} />} extra={lastTurn && <Badge tone="blue">{lastTurn.tools.length} 次</Badge>} />
          {lastTurn?.steps.length || lastTurn?.tools.length ? (
            <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {lastTurn.steps.map((s, i) => (
                <div key={`s${i}`} className="flex gap-2 text-[10.5px]">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <div><span className="font-medium text-ink-700">{s.stage}</span> · {s.text}</div>
                </div>
              ))}
              {lastTurn.tools.map((t, i) => (
                <div key={`t${i}`} className="rounded-lg border border-ink-100 bg-ink-50/60 p-2">
                  <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold text-brand-700"><Wrench size={11} /> {t.name}()</div>
                  <div className="mt-1 text-[10px] text-ink-500">{t.summary}</div>
                  <div className="mt-1 truncate font-mono text-[9.5px] text-ink-300">{JSON.stringify(t.args)}</div>
                </div>
              ))}
            </div>
          ) : <Empty text="发起一次提问即可看到完整执行轨迹" />}
        </Card>

        <Card>
          <SectionHeader title="证据溯源（RAG）" sub="回答必须引用这些片段" icon={<BookOpen size={15} />} />
          {lastTurn?.citations.length ? (
            <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
              {lastTurn.citations.map((c, i) => (
                <div key={i} className="rounded-lg border border-ink-100 p-2.5">
                  <div className="text-[10.5px] font-semibold text-ink-800">{c.title}</div>
                  <div className="mt-0.5 text-[9.5px] text-brand-600">{c.source}</div>
                  <div className="mt-1 text-[10px] leading-relaxed text-ink-500">{c.snippet}…</div>
                </div>
              ))}
            </div>
          ) : <Empty text="暂无检索证据" />}
        </Card>

        <Card>
          <SectionHeader title="安全与可控" icon={<ShieldCheck size={15} />} />
          <div className="space-y-2">
            {(lastTurn?.safety.length ? lastTurn.safety : [{ level: 'pass', text: '等待本轮安全检查…' }]).map((s, i) => (
              <div key={i} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[10.5px] ${s.level === 'block' ? 'bg-rose-50 text-rose-700' : s.level === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                <ShieldCheck size={12} /> {s.text}
              </div>
            ))}
            <div className="rounded-lg border border-ink-100 p-2.5 text-[10px] leading-relaxed text-ink-500">
              密钥仅存于服务端 <code className="rounded bg-ink-100 px-1">.env.local</code>；数值结论由确定性算法产出并经溯源校验；无密钥 / 上游异常时自动降级本地引擎。
            </div>
          </div>
        </Card>

        <a href="/api/mcp" target="_blank" rel="noreferrer" className="card flex items-center gap-2.5 border-brand-100 bg-brand-50/40 p-3.5 transition-colors hover:border-brand-300">
          <FileText size={16} className="text-brand-600" />
          <div className="flex-1"><div className="text-[11.5px] font-semibold text-ink-800">MCP 工具端点</div><div className="text-[10px] text-ink-400">7 个工具 / tools/list · tools/call</div></div>
          <ArrowRight size={14} className="text-brand-600" />
        </a>
      </div>
    </div>
  );
}

/* Web Speech API 的最小类型声明（避免引入额外 DOM 类型依赖） */
interface SR {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: (e: SRResultEvent) => void; onerror: () => void; onend: () => void;
  start: () => void; stop: () => void;
}
interface SRResultEvent { results: Array<Array<{ transcript: string }>> }
