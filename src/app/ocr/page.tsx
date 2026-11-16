'use client';

/**
 * Xiaomi-OCR-0 文档解析工作台
 * --------------------------------------------------------------------------
 * 一条完整链路：本地推理端点配置 → 单张图片解析（parse / KIE / VQA）
 * → 人工复核修正 → 注入防护后入 RAG 语料 → Copilot / Deep Research 可检索。
 * 该通道与 /models 的文本大模型配置相互独立，不会改变 Copilot 的对话模型。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import Link from 'next/link';
import {
  Cpu, KeyRound, ShieldCheck, Eye, EyeOff, Loader2, CheckCircle2, XCircle,
  RotateCcw, ExternalLink, Copy, Terminal, Sparkles, Server, Info, Database,
  FileText, PlugZap,
} from 'lucide-react';
import clsx from 'clsx';
import { Card, SectionHeader, Badge, Segmented } from '@/components/ui';

type OcrTask = 'parse' | 'kie' | 'vqa';

interface Preset {
  id: string; name: string; baseUrl: string; model: string;
  note: string; command: string; experimental: boolean;
}
interface TaskSpec { id: OcrTask; name: string; desc: string; output: string; prompt: string }
interface Current {
  source: 'runtime' | 'env' | 'none'; configured: boolean; preset: string;
  baseUrl: string; model: string; maskedKey: string; updatedAt: number | null;
  demoMode: boolean; note: string;
}
interface Payload {
  current: Current;
  presets: Preset[];
  tasks: TaskSpec[];
  links: { repo: string; modelCard: string; modelscope: string; ollama: string };
  limitations: string[];
  security: string[];
  pipeline: string[];
  limits: { imageBytes: number; textChars: number; maxTokens: number };
  corpus: { total: number; byType: Record<string, number> };
}
interface FormState { preset: string; baseUrl: string; apiKey: string; model: string }
interface ParseResult {
  ok: boolean; text?: string; task?: string; model?: string; prompt?: string;
  latencyMs?: number; chars?: number; truncated?: boolean; otsl?: boolean; error?: string;
}
interface HealthResult {
  ok: boolean; latencyMs?: number; model?: string;
  servedModels?: string[]; note?: string; error?: string;
}
interface IngestResult { ok?: boolean; chunks?: number; blockedSentences?: number; stats?: { total: number }; error?: string }
interface Notice { tone: 'ok' | 'err' | 'info'; text: string }
interface ImageState { name: string; dataUrl: string; size: number }

const EMPTY_FORM: FormState = { preset: 'vllm', baseUrl: '', apiKey: '', model: '' };

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-medium text-ink-700">{label}</span>
        {hint && <span className="text-[10px] text-ink-400">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export default function OcrPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [task, setTask] = useState<OcrTask>('parse');
  const [fields, setFields] = useState('专业名称, 课程名称, 学分, 学时, 技能要求');
  const [question, setQuestion] = useState('这份培养方案的总学分和核心课程分别是什么？');
  const [customPrompt, setCustomPrompt] = useState('');
  const [image, setImage] = useState<ImageState | null>(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [ingestInfo, setIngestInfo] = useState<IngestResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/ocr', { cache: 'no-store' });
      const d: Payload = await r.json();
      setPayload(d);
      setForm((f) => (f.baseUrl ? f : {
        ...EMPTY_FORM,
        preset: d.current.preset || 'vllm',
        baseUrl: d.current.baseUrl || d.presets[0]?.baseUrl || '',
        model: d.current.model || d.presets[0]?.model || '',
      }));
    } catch {
      setNotice({ tone: 'err', text: '无法读取 OCR 配置，请确认服务已启动' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const refresh = () => { void load(); window.dispatchEvent(new Event('puhe:status-refresh')); };
  const asBody = () => ({ preset: form.preset, apiKey: form.apiKey.trim(), baseUrl: form.baseUrl.trim(), model: form.model.trim() });
  const busy = testing || saving || clearing || parsing || ingesting;
  const cur = payload?.current;
  const activePreset = payload?.presets.find((p) => p.id === form.preset);
  const activeTask = payload?.tasks.find((t) => t.id === task);

  const applyPreset = (p: Preset) => {
    setForm({ preset: p.id, baseUrl: p.baseUrl, apiKey: '', model: p.model });
    setHealth(null);
    setNotice({ tone: 'info', text: `已载入「${p.name}」预设，请确认服务已启动后测试连接` });
  };

  const test = async (useCurrent = false) => {
    setTesting(true); setHealth(null); setNotice(null);
    try {
      const r = await fetch('/api/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(useCurrent ? { action: 'test', useCurrent: true } : { action: 'test', ...asBody() }),
      });
      const d: HealthResult = await r.json();
      setHealth(d);
      setNotice(d.ok
        ? { tone: 'ok', text: `连通成功，耗时 ${d.latencyMs ?? '—'} ms${d.note ? ` · ${d.note}` : ''}` }
        : { tone: 'err', text: d.error || '连通性测试未通过' });
    } catch {
      setNotice({ tone: 'err', text: '测试请求失败，请稍后重试' });
    } finally { setTesting(false); }
  };

  const save = async () => {
    setSaving(true); setNotice(null);
    try {
      const r = await fetch('/api/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', ...asBody() }),
      });
      const d = await r.json() as { ok?: boolean; error?: string; current?: Current };
      if (!r.ok || !d.ok) {
        setNotice({ tone: 'err', text: d.error || '保存失败，请检查表单' });
      } else {
        setNotice({ tone: 'ok', text: `已启用 ${d.current?.model || form.model}，现在可以上传图片解析` });
        setForm((f) => ({ ...f, apiKey: '' }));
        refresh();
      }
    } catch {
      setNotice({ tone: 'err', text: '保存请求失败，请稍后重试' });
    } finally { setSaving(false); }
  };

  const clear = async () => {
    setClearing(true); setNotice(null);
    try {
      await fetch('/api/ocr', { method: 'DELETE' });
      setHealth(null);
      setNotice({ tone: 'info', text: '已清除网页配置；如 .env 中配置了 OCR_*，会自动回落到该端点' });
      refresh();
    } catch {
      setNotice({ tone: 'err', text: '清除失败，请稍后重试' });
    } finally { setClearing(false); }
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    const max = payload?.limits.imageBytes ?? 4 * 1024 * 1024;
    if (!/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
      setNotice({ tone: 'err', text: '仅支持 PNG / JPG / WebP / GIF / BMP 图片' });
      return;
    }
    if (file.size > max) {
      setNotice({ tone: 'err', text: `图片超过 ${Math.round(max / 1024 / 1024)}MB 上限，请压缩后重试` });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage({ name: file.name, dataUrl: String(reader.result), size: file.size });
      setResult(null); setIngestInfo(null);
      setNotice({ tone: 'info', text: `已载入 ${file.name}，点击「开始解析」调用本地模型` });
    };
    reader.onerror = () => setNotice({ tone: 'err', text: '图片读取失败，请重新选择' });
    reader.readAsDataURL(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    pickFile(e.dataTransfer.files?.[0]);
  };

  const parse = async () => {
    if (!image) { setNotice({ tone: 'err', text: '请先选择一张文档图片' }); return; }
    if (!cur?.configured) { setNotice({ tone: 'err', text: '请先在右侧配置并保存 OCR 推理端点' }); return; }
    setParsing(true); setResult(null); setIngestInfo(null); setNotice(null);
    try {
      const r = await fetch('/api/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'parse', image: image.dataUrl, task,
          fields, question, customPrompt,
        }),
      });
      const d: ParseResult = await r.json();
      setResult(d);
      if (d.ok && d.text) {
        setText(d.text);
        setNotice({ tone: 'ok', text: `解析完成，耗时 ${d.latencyMs ?? '—'} ms · ${d.chars ?? d.text.length} 字符；请人工复核后再入库` });
      } else {
        setNotice({ tone: 'err', text: d.error || '解析未返回内容' });
      }
    } catch {
      setNotice({ tone: 'err', text: '解析请求失败，请确认本地推理服务在线' });
    } finally { setParsing(false); }
  };

  const ingest = async () => {
    if (text.trim().length < 10) { setNotice({ tone: 'err', text: '可入库文本至少需要 10 个字符' }); return; }
    setIngesting(true); setNotice(null);
    try {
      const r = await fetch('/api/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ingest', text, title: `OCR/${task}/${image?.name || '文档'}` }),
      });
      const d: IngestResult = await r.json();
      setIngestInfo(d);
      setNotice(d.ok
        ? { tone: 'ok', text: `已入库 ${d.chunks ?? 0} 个片段，拦截 ${d.blockedSentences ?? 0} 段可疑指令，当前语料 ${d.stats?.total ?? '—'} chunks` }
        : { tone: 'err', text: d.error || '入库失败' });
      refresh();
    } catch {
      setNotice({ tone: 'err', text: '入库请求失败，请稍后重试' });
    } finally { setIngesting(false); }
  };

  const copyText = async () => {
    try { await navigator.clipboard.writeText(text); setNotice({ tone: 'info', text: '解析结果已复制到剪贴板' }); }
    catch { setNotice({ tone: 'err', text: '复制失败，请手动选中文本' }); }
  };

  return (
    <div className="space-y-5">
      {/* 当前状态 */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Cpu size={18} className="text-brand-600" />
              <h2 className="text-[15px] font-semibold text-ink-900">Xiaomi-OCR-0 · 文档解析通道</h2>
              {cur?.configured ? <Badge tone="green">OCR 已启用</Badge> : <Badge tone="amber">未启用</Badge>}
              {cur?.source === 'runtime' && <Badge tone="blue">网页配置</Badge>}
              {cur?.source === 'env' && <Badge tone="blue">.env / Secrets</Badge>}
              {cur?.demoMode && <Badge tone="red">DEMO_MODE 强制离线</Badge>}
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <div><div className="label text-[10.5px]">模型 ID</div><div className="mono-num mt-0.5 text-[15px] font-semibold text-ink-800">{cur?.model || '未启用'}</div></div>
              <div><div className="label text-[10.5px]">推理端点</div><div className="mono-num mt-0.5 text-[12.5px] text-ink-700">{cur?.baseUrl || '—'}</div></div>
              <div><div className="label text-[10.5px]">密钥</div><div className="mono-num mt-0.5 text-[12.5px] text-ink-700">{cur?.maskedKey || '免密钥（本地网关）'}</div></div>
              <div><div className="label text-[10.5px]">RAG 语料</div><div className="mono-num mt-0.5 text-[12.5px] text-ink-700">{payload?.corpus.total ?? '—'} chunks</div></div>
            </div>
            <p className="mt-3 max-w-3xl text-[11.5px] leading-relaxed text-ink-400">{cur?.note || '正在读取配置…'}</p>
            <p className="mt-1 max-w-3xl text-[10.5px] leading-relaxed text-ink-400">该通道独立于「模型接入配置」：只在文档采集时使用本地 OCR 模型，不改变 Copilot / Deep Research 的对话模型。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => void test(true)} disabled={busy || !cur?.configured}>
              {testing ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />} 测试当前配置
            </button>
            <button className="btn-ghost" onClick={clear} disabled={busy || cur?.source !== 'runtime'}>
              {clearing ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} 清除配置
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* 左：接入配置 */}
        <div className="space-y-5">
          <Card>
            <SectionHeader title="选择部署路线" sub="官方权重走 SGLang / vLLM，桌面机可试 Ollama 实验版" icon={<Server size={16} />} />
            <div className="space-y-2">
              {(payload?.presets || []).map((p) => {
                const active = form.preset === p.id;
                return (
                  <button key={p.id} onClick={() => applyPreset(p)} className={clsx(
                    'w-full rounded-xl border p-3 text-left transition-all',
                    active ? 'border-brand-400 bg-brand-50/60 shadow-sm' : 'border-ink-200/70 bg-surface-2 hover:border-brand-300',
                  )}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={clsx('text-[12.5px] font-semibold', active ? 'text-brand-700' : 'text-ink-800')}>{p.name}</span>
                      {p.experimental && <Badge tone="amber">实验性</Badge>}
                      {active && <CheckCircle2 size={14} className="text-brand-600" />}
                    </div>
                    <div className="mono-num mt-1 truncate text-[10.5px] text-ink-400">{p.baseUrl || '自定义地址'} · {p.model || '自定义模型 ID'}</div>
                    <div className="mt-1.5 text-[10.5px] leading-snug text-ink-500">{p.note}</div>
                  </button>
                );
              })}
            </div>
            {activePreset?.command && (
              <details className="mt-3 rounded-xl border border-ink-200/70 bg-surface-2 px-3 py-2.5">
                <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-ink-600"><Terminal size={13} /> 官方启动命令</summary>
                <pre className="mono-num mt-2 overflow-x-auto whitespace-pre-wrap text-[10px] leading-relaxed text-ink-600">{activePreset.command}</pre>
              </details>
            )}
          </Card>

          <Card>
            <SectionHeader title="推理端点配置" sub="填写后无需改 .env、无需重启；本地网关可留空密钥" icon={<KeyRound size={16} />} />
            <div className="space-y-3.5">
              <Field label="API Key（可选）" hint={cur?.source === 'runtime' ? '留空表示沿用已保存的密钥' : '本地 vLLM / Ollama 通常不需要'}>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={form.apiKey}
                    onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                    placeholder="留空即可（本地网关免密钥）" autoComplete="off" className="input w-full pr-10" />
                  <button onClick={() => setShowKey((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-brand-600" title={showKey ? '隐藏' : '显示'}>
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>
              <Field label="Base URL" hint="OpenAI 兼容端点，末尾不加 /chat/completions">
                <input value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="http://127.0.0.1:8000/v1" className="input w-full" />
              </Field>
              <Field label="模型 ID" hint="须与推理服务实际加载的模型名一致">
                <input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="SeerRay-Lab/Xiaomi-OCR-0" className="input w-full" />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={save} disabled={busy}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />} 保存并启用
              </button>
              <button className="btn-ghost" onClick={() => void test(false)} disabled={busy}>
                {testing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} 测试连接
              </button>
            </div>

            {notice && (
              <div className={clsx('mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[11.5px] leading-relaxed',
                notice.tone === 'ok' ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
                  : notice.tone === 'err' ? 'border-rose-200 bg-rose-50/70 text-rose-800'
                    : 'border-brand-200 bg-brand-50/70 text-brand-800')}>
                {notice.tone === 'err' ? <XCircle size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}
                <span>{notice.text}</span>
              </div>
            )}

            {health && !health.ok && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2.5 text-[11px] leading-relaxed text-rose-800">
                <strong>连接失败</strong>：{health.error}。常见原因：服务未启动、端口不对、权重未加载完成、模型 ID 与 /v1/models 列出的不一致。
              </div>
            )}
            {health?.ok && health.servedModels && health.servedModels.length > 0 && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-[10.5px] leading-relaxed text-emerald-800">
                服务端已加载模型：<span className="mono-num">{health.servedModels.join('、')}</span>
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader title="安全与边界" sub="与平台既有安全策略一致" icon={<ShieldCheck size={16} />} />
            <ul className="space-y-1.5">
              {(payload?.security || []).map((s) => (
                <li key={s} className="flex items-start gap-2 text-[10.5px] leading-relaxed text-ink-500">
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-500" /> {s}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* 右：解析工作台 */}
        <div className="space-y-5">
          <Card>
            <SectionHeader title="文档解析工作台" sub="选择任务 → 上传图片 → 解析 → 复核 → 入库" icon={<FileText size={16} />}
              extra={<Badge tone="blue">{activeTask?.output || 'Markdown 文本'}</Badge>} />
            <div className="flex flex-wrap items-center gap-3">
              <Segmented<OcrTask> value={task} onChange={(v) => { setTask(v); setResult(null); setIngestInfo(null); }}
                options={(payload?.tasks || []).map((t) => ({ value: t.id, label: t.name }))} size="sm" />
              <span className="text-[10.5px] text-ink-400">{activeTask?.desc}</span>
            </div>

            <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className="mt-4 cursor-pointer rounded-xl border border-dashed border-ink-300 bg-surface-2/60 px-4 py-5 text-center transition-all hover:border-brand-400 hover:bg-brand-50/40">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" className="hidden"
                onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
              {image ? (
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <div className="h-24 w-24 shrink-0 rounded-lg border border-ink-200 bg-surface bg-contain bg-center bg-no-repeat"
                    style={{ backgroundImage: `url(${image.dataUrl})` }} />
                  <div className="text-left">
                    <div className="text-[12px] font-medium text-ink-800">{image.name}</div>
                    <div className="mono-num mt-1 text-[10.5px] text-ink-400">{Math.round(image.size / 1024)} KB · 点击或拖入可替换</div>
                  </div>
                </div>
              ) : (
                <>
                  <FileText size={22} className="mx-auto text-brand-500" />
                  <div className="mt-2 text-[12px] font-medium text-ink-700">点击选择或拖入文档图片</div>
                  <div className="mt-1 text-[10.5px] text-ink-400">培养方案 / 课程大纲 / 招聘 JD 截图 · PNG / JPG / WebP · ≤ {Math.round((payload?.limits.imageBytes ?? 4 * 1024 * 1024) / 1024 / 1024)}MB</div>
                </>
              )}
            </div>

            {task === 'kie' && (
              <div className="mt-3">
                <Field label="要抽取的字段" hint="逗号 / 顿号分隔，最多 20 个；留空则抽取全部键值对">
                  <input value={fields} onChange={(e) => setFields(e.target.value)} className="input w-full"
                    placeholder="专业名称, 课程名称, 学分, 技能要求" />
                </Field>
              </div>
            )}
            {task === 'vqa' && (
              <div className="mt-3">
                <Field label="针对图片提问" hint="只依据图中可见内容作答">
                  <input value={question} onChange={(e) => setQuestion(e.target.value)} className="input w-full"
                    placeholder="这份培养方案的总学分是多少？" />
                </Field>
              </div>
            )}
            <details className="mt-3 rounded-xl border border-ink-200/70 bg-surface-2 px-3 py-2">
              <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-ink-600"><Terminal size={13} /> 查看 / 覆盖提示词</summary>
              <pre className="mt-2 whitespace-pre-wrap text-[10px] leading-relaxed text-ink-500">{customPrompt || activeTask?.prompt || ''}</pre>
              <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value.slice(0, 2000))}
                placeholder="留空使用官方模板；填写后将覆盖（上限 2000 字符）"
                className="input mt-2 min-h-[70px] w-full text-[11px]" />
            </details>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => void parse()} disabled={busy || !image}>
                {parsing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} 开始解析
              </button>
              <button className="btn-ghost" onClick={() => void copyText()} disabled={!text}><Copy size={15} /> 复制结果</button>
              <button className="btn-ghost" onClick={() => void ingest()} disabled={busy || text.trim().length < 10}>
                {ingesting ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />} 复核后入库 RAG
              </button>
            </div>

            {result?.ok && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="green">{result.model}</Badge>
                <Badge tone="blue">{result.latencyMs} ms</Badge>
                <Badge tone="gray">{result.chars} 字符</Badge>
                {result.otsl && <Badge tone="amber">含 OTSL 表格标记</Badge>}
                {result.truncated && <Badge tone="red">输出被截断</Badge>}
              </div>
            )}
            {result?.ok && result.otsl && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[10.5px] leading-relaxed text-amber-800">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>结果含官方 OTSL 表格标记。轻量通道不做 OTSL→HTML 后处理；如需 HTML 表格，请使用官方 MCP 的区域解析管线。</span>
              </div>
            )}
            {ingestInfo?.ok && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[10.5px] leading-relaxed text-emerald-800">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
                <span>已入库 {ingestInfo.chunks} 个片段，逐句拦截 {ingestInfo.blockedSentences} 段可疑指令；Copilot 与 Deep Research 现在可以检索到这份文档。</span>
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader title="解析结果（可编辑）" sub="OCR 输出属于不可信文本，请人工复核修正后再入库" icon={<FileText size={16} />}
              extra={text ? <Badge tone="gray">{text.length} 字符</Badge> : undefined} />
            <textarea value={text} onChange={(e) => { setText(e.target.value.slice(0, payload?.limits.textChars ?? 200000)); setIngestInfo(null); }}
              placeholder="解析结果会显示在这里，可直接修改错字、删掉页眉页脚，再点击「复核后入库 RAG」"
              className="input min-h-[260px] w-full font-mono text-[11.5px] leading-relaxed" />
            {!text && (
              <div className="mt-2 text-[10.5px] leading-relaxed text-ink-400">
                提示：整页解析输出 Markdown；KIE 输出单个 JSON 对象；VQA 输出简洁答案。三类结果都可以作为语料入库。
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 底部说明 */}
      <Card>
        <SectionHeader title="从图片到证据：接入链路与已知边界" sub="Xiaomi-OCR-0 在本项目中的定位" icon={<Cpu size={16} />} />
        <div className="flex flex-wrap gap-2">
          {(payload?.pipeline || []).map((s) => (
            <span key={s} className="chip border-brand-200 bg-brand-50/70 text-[10.5px] text-brand-700">{s}</span>
          ))}
          {!payload?.pipeline?.length && <span className="text-[11px] text-ink-400">加载中…</span>}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-ink-200/70 bg-surface-2 p-3">
            <div className="mb-2 text-[11.5px] font-semibold text-ink-800">三类任务</div>
            <ul className="space-y-1.5">
              {(payload?.tasks || []).map((t) => (
                <li key={t.id} className="text-[10.5px] leading-relaxed text-ink-500"><strong className="text-ink-700">{t.name}</strong>：{t.desc}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-3">
            <div className="mb-2 text-[11.5px] font-semibold text-ink-800">轻量通道的已知限制</div>
            <ul className="space-y-1.5">
              {(payload?.limitations || []).map((s) => (
                <li key={s} className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-ink-500">
                  <Info size={11} className="mt-0.5 shrink-0 text-amber-600" /> {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px]">
          {payload?.links.repo && <a href={payload.links.repo} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">官方仓库 <ExternalLink size={12} /></a>}
          {payload?.links.modelCard && <a href={payload.links.modelCard} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">Hugging Face 模型卡 <ExternalLink size={12} /></a>}
          {payload?.links.modelscope && <a href={payload.links.modelscope} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">魔搭模型页 <ExternalLink size={12} /></a>}
          <Link href="/data" className="inline-flex items-center gap-1 text-brand-600 hover:underline">前往数据与知识库 <ExternalLink size={12} /></Link>
          <Link href="/copilot" className="inline-flex items-center gap-1 text-brand-600 hover:underline">向 Copilot 验证检索 <ExternalLink size={12} /></Link>
        </div>
      </Card>
    </div>
  );
}
