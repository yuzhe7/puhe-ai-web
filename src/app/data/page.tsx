'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Database, FileUp, FileText, Image as ImageIcon, Mic, Search, ShieldCheck,
  CheckCircle2, AlertCircle, Layers3, Code2, Trash2, Sparkles,
} from 'lucide-react';
import { Card, SectionHeader, Badge, Loading, Empty, ProgressBar } from '@/components/ui';

interface IngestResult {
  ok: boolean; channel: string; filename?: string; size?: number; chars?: number;
  chunks?: number; blockedSentences?: number; preview?: string; note?: string;
  stats?: { total: number; byType: Record<string, number> };
}
interface RagHit { source: string; sourceType: string; title: string; text: string; score: number }

const QUALITY = [
  { k: '字段完整度', w: 30, v: 96 }, { k: '数据新鲜度', w: 25, v: 91 },
  { k: '格式规范度', w: 25, v: 94 }, { k: '语义准确度', w: 20, v: 89 },
];

export default function DataPage() {
  const [tab, setTab] = useState<'upload' | 'rag' | 'governance'>('upload');
  const [pasted, setPasted] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [drag, setDrag] = useState(false);
  const [query, setQuery] = useState('大模型应用开发工程师需要哪些技能');
  const [hits, setHits] = useState<RagHit[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number> } | null>(null);
  const [ragBusy, setRagBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/rag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '产教融合', topK: 1 }) })
      .then((r) => r.json()).then((d) => setStats(d.stats)).catch(() => null);
  }, []);

  const upload = async (file?: File | null, useText = false) => {
    setBusy(true); setResult(null);
    try {
      const fd = new FormData();
      if (useText) { fd.append('text', pasted); fd.append('title', title || '粘贴文本'); }
      else if (file) fd.append('file', file);
      else { setBusy(false); return; }
      const res = await fetch('/api/ingest', { method: 'POST', body: fd });
      const d = await res.json() as IngestResult;
      setResult(d);
      if (d.stats) setStats(d.stats);
    } catch (e) { setResult({ ok: false, channel: '请求失败', note: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const doRetrieve = async () => {
    if (!query.trim()) return;
    setRagBusy(true);
    try {
      const r = await fetch('/api/rag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, topK: 6 }) });
      const d = await r.json();
      setHits(d.hits || []); setExpanded(d.expanded);
    } finally { setRagBusy(false); }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-xl border border-ink-200 bg-white p-1">
          {[
            { k: 'upload', l: '多模态接入', icon: FileUp }, { k: 'rag', l: 'RAG 检索验证', icon: Search }, { k: 'governance', l: '治理与安全', icon: ShieldCheck },
          ].map((x) => {
            const Icon = x.icon;
            return <button key={x.k} onClick={() => setTab(x.k as typeof tab)} className={`tab flex items-center gap-1.5 ${tab === x.k ? 'tab-active' : ''}`}><Icon size={13} />{x.l}</button>;
          })}
        </div>
        <div className="flex gap-2"><Badge tone="blue"><Database size={11} /> 知识切片 {stats?.total ?? '—'}</Badge><Badge tone="green">端侧 TF-IDF 向量检索</Badge></div>
      </div>

      {tab === 'upload' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <Card>
              <SectionHeader title="文档 / 图片上传" sub="上传成功后自动切片入库，立即参与 RAG 检索与 AI 诊断" icon={<FileUp size={16} />} extra={<Badge tone="blue">多模态</Badge>} />
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files?.[0]); }}
                onClick={() => fileRef.current?.click()}
                className={`grid min-h-[168px] cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-6 text-center transition-all ${drag ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-ink-50/40 hover:border-brand-300 hover:bg-brand-50/30'}`}>
                <div>
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-brand-600 shadow-sm"><FileUp size={22} /></div>
                  <div className="mt-3 text-[13px] font-medium text-ink-800">拖拽文件到此处，或点击选择</div>
                  <div className="mt-1.5 text-[11px] text-ink-400">支持 TXT / MD / CSV / JSON / DOCX / PDF / PNG / JPG</div>
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    {[
                      { i: FileText, t: '培养方案 / 课程大纲' }, { i: FileText, t: '招聘 JD' },
                      { i: ImageIcon, t: '截图 → 视觉模型' }, { i: Mic, t: '语音 → Copilot' },
                    ].map((x, i) => { const I = x.i; return <span key={i} className="chip border-ink-200 bg-white text-[10px] text-ink-500"><I size={11} />{x.t}</span>; })}
                  </div>
                </div>
              </div>
              <input ref={fileRef} type="file" className="hidden" accept=".txt,.md,.csv,.json,.html,.docx,.pdf,image/*" onChange={(e) => void upload(e.target.files?.[0])} />

              <div className="my-4 flex items-center gap-3 text-[11px] text-ink-300"><div className="h-px flex-1 bg-ink-100" />或粘贴文本<div className="h-px flex-1 bg-ink-100" /></div>
              <input className="input !text-xs" placeholder="文档标题（如：2026版计算机科学与技术培养方案）" value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea className="input mt-2 min-h-[110px] resize-none !text-xs" placeholder="粘贴培养方案、课程大纲或招聘 JD 正文…" value={pasted} onChange={(e) => setPasted(e.target.value)} />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10.5px] text-ink-400">{pasted.length} 字 · 按句切片，每片 ≤ 200 字</span>
                <div className="flex gap-2">
                  <button className="btn-ghost !py-1.5 !text-xs" onClick={() => { setPasted(''); setTitle(''); }}><Trash2 size={13} /> 清空</button>
                  <button className="btn-primary !py-1.5 !text-xs" disabled={busy || pasted.trim().length < 10} onClick={() => void upload(null, true)}>
                    {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Sparkles size={13} />} 解析并入库
                  </button>
                </div>
              </div>
            </Card>

            <Card>
              <SectionHeader title="解析结果" icon={<CheckCircle2 size={15} />} />
              {busy ? <Loading text="正在抽取文本并切片入库…" /> : result ? (
                <div className="space-y-3">
                  <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {result.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                    <span className="font-medium">{result.ok ? '入库成功' : '未能抽取文本'}</span>
                    <span className="ml-auto text-[10.5px] opacity-80">{result.channel}</span>
                  </div>
                  {result.ok && (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[{ l: '文件', v: result.filename || '粘贴文本' }, { l: '抽取字符', v: result.chars ?? '—' }, { l: '新增切片', v: result.chunks ?? 0 }].map((x) => (
                        <div key={x.l} className="rounded-xl bg-ink-50 p-2.5"><div className="label !text-[10px]">{x.l}</div><div className="mt-1 truncate text-[12px] font-semibold text-ink-800">{String(x.v)}</div></div>
                      ))}
                    </div>
                  )}
                  {Boolean(result.blockedSentences) && (
                    <div className="flex items-center gap-2 rounded-xl border border-rose-200/60 bg-rose-50/60 px-3 py-2 text-[11px] text-rose-700">
                      <ShieldCheck size={14} /> AI 安全：已拦截 {result.blockedSentences} 段疑似提示词注入内容，未写入知识库
                    </div>
                  )}
                  {result.preview && <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-[11px] leading-relaxed text-ink-600"><div className="mb-1 font-medium text-ink-700">文本预览</div>{result.preview}…</div>}
                  {result.note && <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-[11px] leading-relaxed text-amber-800">{result.note}</div>}
                </div>
              ) : <Empty text="上传一份文档后，这里会显示解析通道、切片数与文本预览" />}
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <SectionHeader title="知识库构成" icon={<Layers3 size={15} />} />
              {stats ? (
                <div className="space-y-2.5">
                  {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <div key={k}>
                      <div className="mb-1 flex justify-between text-[11px]"><span className="text-ink-600">{k}</span><span className="font-mono text-ink-500">{v}</span></div>
                      <ProgressBar value={(v / stats.total) * 100 * 2.2} tone={k === '用户上传' ? 'orange' : 'brand'} />
                    </div>
                  ))}
                  <div className="mt-3 rounded-xl bg-brand-50 px-3 py-2.5 text-[11px] text-brand-700">共 <strong>{stats.total}</strong> 个切片，全部参与 TF-IDF 稀疏向量索引</div>
                </div>
              ) : <Loading />}
            </Card>
            <Card>
              <SectionHeader title="数据质量看板" icon={<ShieldCheck size={15} />} />
              <div className="space-y-3">
                {QUALITY.map((q) => (
                  <div key={q.k}>
                    <div className="mb-1 flex justify-between text-[11px]"><span className="text-ink-600">{q.k} <span className="text-ink-300">权重 {q.w}%</span></span><span className="font-mono font-medium text-ink-700">{q.v}</span></div>
                    <ProgressBar value={q.v} tone="green" />
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[10.5px] leading-relaxed text-ink-400">质量评分 = 30% 完整度 + 25% 新鲜度 + 25% 规范度 + 20% 语义准确度</div>
            </Card>
            <Card className="border-brand-100 bg-brand-50/40">
              <SectionHeader title="端云协同架构" icon={<Code2 size={15} />} />
              <p className="text-[11px] leading-relaxed text-ink-600">
                <strong>端侧</strong>：浏览器/服务端本地完成中文二元组切分、TF-IDF 向量化、余弦检索与跨域术语扩展，零成本、可离线；
                <strong>云侧</strong>：仅把检索到的证据片段送入大模型做语言组织与工具编排。
                数值结论始终由确定性算法给出，模型不产生数字。
              </p>
            </Card>
          </div>
        </div>
      )}

      {tab === 'rag' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card>
            <SectionHeader title="RAG 检索验证" sub="输入自然语言问题，查看查询扩展、召回片段与相关度，验证「回答有据可依」" icon={<Search size={16} />} />
            <div className="flex gap-2">
              <input className="input !text-xs" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void doRetrieve(); }} placeholder="例如：数据结构课程里哪些知识点已经过时？" />
              <button className="btn-primary !shrink-0 !text-xs" onClick={() => void doRetrieve()} disabled={ragBusy}>{ragBusy ? '检索中…' : '检索'}</button>
            </div>
            {expanded && <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-[10.5px] text-brand-700">跨域术语扩展后的查询：<code>{expanded}</code></div>}
            <div className="mt-4 space-y-2.5">
              {ragBusy ? <Loading /> : hits?.length ? hits.map((h, i) => (
                <div key={i} className="rounded-xl border border-ink-100 p-3.5 transition-colors hover:border-brand-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip border-brand-100 bg-brand-50 font-mono text-[10px] text-brand-700">#{i + 1} · {h.score}</span>
                    <span className="text-[12px] font-semibold text-ink-800">{h.title}</span>
                    <span className="ml-auto text-[10px] text-ink-400">{h.sourceType} · {h.source}</span>
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-ink-600">{h.text}</p>
                  <div className="mt-2"><ProgressBar value={Math.min(100, h.score * 220)} tone="brand" /></div>
                </div>
              )) : <Empty text="点击「检索」查看召回结果" />}
            </div>
          </Card>
          <div className="space-y-4">
            <Card>
              <SectionHeader title="检索管线" icon={<Layers3 size={15} />} />
              <div className="space-y-2.5">
                {['① 分句切片（≤200 字）', '② 中文二元组 + 英文词切分', '③ TF-IDF 稀疏向量化', '④ 跨域术语查询扩展', '⑤ 余弦相似度排序', '⑥ 标题命中加权', '⑦ Top-K 注入 Prompt'].map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-2 text-[11px] text-ink-600"><span className="font-mono text-brand-600">0{i + 1}</span>{s.slice(2)}</div>
                ))}
              </div>
            </Card>
            <Card className="border-emerald-100 bg-emerald-50/40">
              <div className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                <p className="text-[11px] leading-relaxed text-ink-600">检索片段会作为 <code className="rounded bg-white px-1">system</code> 证据注入大模型上下文，并在前端渲染「证据溯源」卡片。若答案中的数值无法在证据中匹配，将自动追加人工复核提示。</p>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'governance' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionHeader title="数据资产全景" sub="对应项目书第七章：高校供给侧 + 产业需求侧，宏观 / 中观 / 微观三层" icon={<Database size={16} />} />
            <div className="space-y-3">
              {[
                { t: '高校供给侧', d: '培养方案、课程大纲、知识点清单、毕业要求（37 个本科专业）', tone: 'brand' },
                { t: '产业需求侧', d: '招聘 JD、行业标准、岗位技能标签（京津冀水利 / 电力 / 数字经济）', tone: 'orange' },
                { t: '政策与术语', d: '教育强国纲要、审核评估指标、工程教育认证 12 项要求、跨域对齐词典', tone: 'green' },
              ].map((x) => (
                <div key={x.t} className="rounded-xl border border-ink-100 p-3.5">
                  <div className="text-[12.5px] font-semibold text-ink-800">{x.t}</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-ink-500">{x.d}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionHeader title="安全与合规设计" icon={<ShieldCheck size={16} />} />
            <div className="space-y-2.5">
              {[
                ['敏感数据分级', '学生信息全程去标识化；演示数据集不含任何真实个人信息'],
                ['密钥隔离', 'AI_API_KEY 仅存服务端 .env.local，.gitignore 已排除，绝不进入浏览器包'],
                ['输入防护', 'Prompt 注入模式检测、手机号/身份证/学号自动脱敏、长度限制'],
                ['输出可控', '数值溯源校验、置信度评估、无证据兜底话术、上游异常自动降级'],
                ['权限与用途', 'RBAC 多角色视角（管理员/管理者/院系/课程/学生），数据仅用于产教融合分析'],
                ['合规声明', '遵循《个人信息保护法》与教育数据规范；上传文档仅存于服务端内存，重启即清空'],
              ].map(([k, v], i) => (
                <div key={i} className="flex gap-2.5 rounded-xl bg-ink-50/60 p-3">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                  <div><div className="text-[11.5px] font-semibold text-ink-800">{k}</div><div className="mt-0.5 text-[10.5px] leading-relaxed text-ink-500">{v}</div></div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <SectionHeader title="开发者接口" sub="外部 Agent 可通过 MCP 协议直接调用平台的三维诊断能力" icon={<Code2 size={16} />} />
            <pre className="overflow-x-auto rounded-xl bg-ink-900 p-4 text-[11px] leading-relaxed text-slate-200">{`# 列出全部工具
curl -X POST http://localhost:3000/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 调用宏观诊断工具
curl -X POST http://localhost:3000/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"analyze_similarity","arguments":{"major":"计算机科学与技术"}}}'`}</pre>
          </Card>
        </div>
      )}
    </div>
  );
}
