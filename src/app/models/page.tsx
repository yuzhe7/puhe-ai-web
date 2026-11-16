'use client';

/**
 * 模型接入配置台
 * --------------------------------------------------------------------------
 * 在网页里直接选择服务商、填写 API Key / Base URL / 模型 ID，测试连通性并一键启用。
 * 密钥只提交到服务端内存，页面永远拿不到完整密钥（后端只返回脱敏值）。
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Cpu, KeyRound, PlugZap, ShieldCheck, Eye, EyeOff, Loader2, CheckCircle2,
  XCircle, RotateCcw, ExternalLink, Copy, Terminal, Sparkles, Server, Info,
} from 'lucide-react';
import clsx from 'clsx';
import { Card, SectionHeader, Badge } from '@/components/ui';

interface Provider {
  id: string; name: string; baseUrl: string; defaultModel: string;
  tokenUrl: string | null; note: string; throttleProne: boolean;
}
interface Current {
  source: 'demo' | 'runtime' | 'env' | 'none';
  configured: boolean; provider: string; providerName: string;
  baseUrl: string; model: string; visionModel: string;
  maskedKey: string; updatedAt: number | null; demoMode: boolean; note: string;
}
interface Payload {
  current: Current;
  status: { mode: 'llm' | 'local'; model: string; provider: { id: string; name: string; baseUrl: string } | null; vision: boolean };
  providers: Provider[];
  modelscopeCandidates: { id: string; use: string }[];
  recommendedModels: Record<string, { id: string; use: string; kind: 'text' | 'vision' }[]>;
  links: { modelscopeToken: string; modelscopeDocs: string; checkCommand: string };
  security: string[];
}
interface FormState {
  provider: string; apiKey: string; baseUrl: string; model: string; visionModel: string;
}
interface TestResult { ok: boolean; error?: string; latencyMs?: number; reply?: string }
interface Notice { tone: 'ok' | 'err' | 'info'; text: string }

const EMPTY_FORM: FormState = { provider: 'custom', apiKey: '', baseUrl: '', model: '', visionModel: '' };

export default function ModelsPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/models', { cache: 'no-store' });
      const d: Payload = await r.json();
      setPayload(d);
      setForm((f) => (f.baseUrl ? f : {
        ...EMPTY_FORM,
        provider: d.current.provider || 'custom',
        baseUrl: d.current.baseUrl || '',
        model: d.current.model || '',
        visionModel: d.current.visionModel || '',
      }));
    } catch {
      setNotice({ tone: 'err', text: '无法读取模型配置，请确认服务已启动' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const refresh = () => {
    void load();
    // 通知 AppShell 侧栏重新拉取 /api/status
    window.dispatchEvent(new Event('puhe:status-refresh'));
  };

  const applyProvider = (p: Provider) => {
    // 命名空间 ID（Qwen/xxx）只属于魔搭 / 自建网关；切到短名端点时自动清掉，
    // 否则会把魔搭的视觉模型 ID 带到百炼 / DeepSeek 上，导致图片抽取 404。
    const keepNamespace = p.id === 'modelscope' || p.id === 'custom';
    setForm((f) => ({
      ...f,
      provider: p.id,
      baseUrl: p.baseUrl,
      model: p.defaultModel,
      visionModel: !keepNamespace && f.visionModel.includes('/') ? '' : f.visionModel,
    }));
    setTestResult(null);
    setNotice({
      tone: 'info',
      text: `已载入「${p.name}」预设，模型清单已切换；请填写 API Key 后测试连接`,
    });
  };

  const asBody = () => ({
    provider: form.provider,
    apiKey: form.apiKey.trim(),
    baseUrl: form.baseUrl.trim(),
    model: form.model.trim(),
    visionModel: form.visionModel.trim(),
  });

  const test = async (useCurrent = false) => {
    setTesting(true); setTestResult(null); setNotice(null);
    try {
      const r = await fetch('/api/models/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(useCurrent ? { useCurrent: true } : asBody()),
      });
      const d: TestResult = await r.json();
      setTestResult(d);
      setNotice(d.ok
        ? { tone: 'ok', text: `连通成功，耗时 ${d.latencyMs ?? '—'} ms` }
        : { tone: 'err', text: d.error || '连通性测试未通过' });
    } catch {
      setNotice({ tone: 'err', text: '测试请求失败，请稍后重试' });
    } finally { setTesting(false); }
  };

  const save = async () => {
    setSaving(true); setNotice(null);
    try {
      const r = await fetch('/api/models', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asBody()),
      });
      const d = await r.json() as { ok?: boolean; error?: string; current?: Current; status?: Payload['status'] };
      if (!r.ok || !d.ok) {
        setNotice({ tone: 'err', text: d.error || '保存失败，请检查表单' });
      } else {
        setNotice({ tone: 'ok', text: `已启用 ${d.status?.model || form.model}，AI Copilot 与 Deep Research 将立即使用新模型` });
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
      const r = await fetch('/api/models', { method: 'DELETE' });
      const d = await r.json() as { ok?: boolean; status?: Payload['status'] };
      setNotice({
        tone: 'info',
        text: d.status?.mode === 'local'
          ? '已恢复本地确定性引擎，全部功能仍可离线演示'
          : '已清除网页配置，当前回落到 .env / 平台 Secrets 中的模型配置',
      });
      setTestResult(null);
      refresh();
    } catch {
      setNotice({ tone: 'err', text: '清除失败，请稍后重试' });
    } finally { setClearing(false); }
  };

  const cur = payload?.current;
  const busy = testing || saving || clearing;
  const recommended = payload?.recommendedModels?.[form.provider] || [];
  const activeProviderName = payload?.providers.find((p) => p.id === form.provider)?.name || '自定义 OpenAI 兼容端点';
  const textModels = recommended.filter((m) => m.kind === 'text');
  const visionModels = recommended.filter((m) => m.kind === 'vision');
  // 短名端点（百炼 / DeepSeek / 智谱 / OpenAI）不认识「命名空间/仓库名」格式的 ID
  const namespaceMismatch = !['modelscope', 'custom'].includes(form.provider)
    && (form.model.includes('/') || form.visionModel.includes('/'));

  return (
    <div className="space-y-5">
      {/* 当前生效状态 */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Cpu size={18} className="text-brand-600" />
              <h2 className="text-[15px] font-semibold text-ink-900">当前生效的模型</h2>
              {payload?.status.mode === 'llm'
                ? <Badge tone="green">LLM 已接入</Badge>
                : <Badge tone="amber">本地确定性引擎</Badge>}
              {cur?.source === 'runtime' && <Badge tone="blue">网页配置</Badge>}
              {cur?.source === 'env' && <Badge tone="blue">.env / Secrets</Badge>}
              {cur?.source === 'demo' && <Badge tone="red">DEMO_MODE 强制离线</Badge>}
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <div>
                <div className="label text-[10.5px]">模型 ID</div>
                <div className="mono-num mt-0.5 text-[15px] font-semibold text-ink-800">{payload?.status.model || '加载中…'}</div>
              </div>
              <div>
                <div className="label text-[10.5px]">服务商</div>
                <div className="mt-0.5 text-[13px] text-ink-700">{cur?.providerName || '—'}</div>
              </div>
              <div>
                <div className="label text-[10.5px]">密钥</div>
                <div className="mono-num mt-0.5 text-[13px] text-ink-700">{cur?.maskedKey || '未配置'}</div>
              </div>
              {cur?.visionModel && <div><div className="label text-[10.5px]">视觉模型</div><div className="mt-0.5 text-[12px] text-ink-700">{cur.visionModel}</div></div>}
            </div>
            <p className="mt-3 max-w-2xl text-[11.5px] leading-relaxed text-ink-400">{cur?.note || '正在读取配置…'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => void test(true)} disabled={busy || payload?.status.mode !== 'llm'} title="用当前已生效配置测试">
              {testing ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />} 测试当前配置
            </button>
            <button className="btn-ghost" onClick={clear} disabled={busy || cur?.source !== 'runtime'} title="清除网页配置">
              {clearing ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} 恢复本地引擎
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* 服务商预设 */}
        <div className="space-y-5">
          <Card>
            <SectionHeader title="选择服务商" sub="点击卡片自动填入 Base URL 与默认模型 ID" icon={<Server size={16} />} />
            <div className="space-y-2">
              {(payload?.providers || []).map((p) => {
                const active = form.provider === p.id;
                return (
                  <button key={p.id} onClick={() => applyProvider(p)} className={clsx(
                    'w-full rounded-xl border p-3 text-left transition-all',
                    active ? 'border-brand-400 bg-brand-50/60 shadow-sm' : 'border-ink-200/70 bg-surface-2 hover:border-brand-300',
                  )}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={clsx('text-[12.5px] font-semibold', active ? 'text-brand-700' : 'text-ink-800')}>{p.name}</span>
                      {active && <CheckCircle2 size={14} className="text-brand-600" />}
                    </div>
                    <div className="mono-num mt-1 truncate text-[10.5px] text-ink-400">{p.defaultModel}</div>
                    <div className="mt-1.5 text-[10.5px] leading-snug text-ink-500">{p.note}</div>
                  </button>
                );
              })}
              <button onClick={() => setForm((f) => ({ ...f, provider: 'custom' }))} className={clsx(
                'w-full rounded-xl border p-3 text-left transition-all',
                form.provider === 'custom' ? 'border-brand-400 bg-brand-50/60' : 'border-ink-200/70 bg-surface-2 hover:border-brand-300',
              )}>
                <div className="text-[12.5px] font-semibold text-ink-800">自定义 OpenAI 兼容端点</div>
                <div className="mt-1 text-[10.5px] text-ink-500">任意实现 /chat/completions 的网关（含本地 Ollama / vLLM）</div>
              </button>
            </div>
          </Card>

          {payload && (
            <Card>
              <SectionHeader
                title={`可选模型 · ${activeProviderName}`}
                sub="点击填入：文本模型进「模型 ID」，视觉模型进「视觉模型 ID」"
                icon={<Sparkles size={16} />}
                extra={<Badge tone="blue">{recommended.length} 个</Badge>}
              />
              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-500"><Cpu size={12} /> 文本 / 对话模型</div>
                  <div className="space-y-1.5">
                    {textModels.map((m) => (
                      <button key={m.id} onClick={() => setForm((f) => ({ ...f, model: m.id }))}
                        className="flex w-full items-start justify-between gap-2 rounded-lg border border-ink-200/60 bg-surface-2 px-3 py-2 text-left hover:border-brand-300">
                        <span className="mono-num text-[10.5px] text-ink-700">{m.id}</span>
                        <span className="shrink-0 text-right text-[10px] text-ink-400">{m.use}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-500"><Eye size={12} /> 视觉模型（图片 JD 抽取）</div>
                  {visionModels.length ? (
                    <div className="space-y-1.5">
                      {visionModels.map((m) => (
                        <button key={m.id} onClick={() => setForm((f) => ({ ...f, visionModel: m.id }))}
                          className="flex w-full items-start justify-between gap-2 rounded-lg border border-ink-200/60 bg-surface-2 px-3 py-2 text-left hover:border-brand-300">
                          <span className="mono-num text-[10.5px] text-ink-700">{m.id}</span>
                          <span className="shrink-0 text-right text-[10px] text-ink-400">{m.use}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-ink-200 px-3 py-2 text-[10.5px] text-ink-400">
                      该端点没有常用视觉模型，视觉模型 ID 请留空（留空即关闭多模态）
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-[10.5px] leading-relaxed text-amber-800">
                <strong>命名规则别混用</strong>：魔搭 / 自建网关用「命名空间/仓库名」（<code>Qwen/xxx</code>），
                百炼 / DeepSeek / 智谱 / OpenAI 用短名（<code>qwen-plus</code>、<code>deepseek-chat</code>）。
                混用会直接 404。模型会上下线，最终以厂商控制台与「测试连接」为准。
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
                {form.provider === 'modelscope' && (
                  <>
                    <a href={payload.links.modelscopeToken} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                      获取 SDK Token <ExternalLink size={12} />
                    </a>
                    <a href={payload.links.modelscopeDocs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                      API-Inference 文档 <ExternalLink size={12} />
                    </a>
                  </>
                )}
                {form.provider === 'qwen' && (
                  <a href="https://help.aliyun.com/zh/model-studio/getting-started/models" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                    百炼模型列表 <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* 配置表单 */}
        <div className="space-y-5">
          <Card>
            <SectionHeader title="接口配置" sub="填写后立即测试或启用，无需修改 .env、无需重启服务" icon={<KeyRound size={16} />} />
            <div className="space-y-3.5">
              <Field label="API Key / SDK Token" hint={cur?.source === 'runtime' ? '留空表示沿用已保存的密钥；密钥不会再次回显' : '形如 ms-xxxx 或 sk-xxxx'}>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={form.apiKey}
                    onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                    placeholder="粘贴你的 API Key"
                    autoComplete="off"
                    className="input w-full pr-10"
                  />
                  <button onClick={() => setShowKey((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-brand-600" title={showKey ? '隐藏' : '显示'}>
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>
              <Field label="Base URL" hint="OpenAI 兼容端点，末尾不加 /chat/completions">
                <input value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="https://api-inference.modelscope.cn/v1" className="input w-full" />
              </Field>
              <Field label="模型 ID" hint="ModelScope 用命名空间 ID，如 Qwen/Qwen3-Coder-30B-A3B-Instruct">
                <input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="deepseek-chat" className="input w-full" />
              </Field>
              <Field label="视觉模型 ID（可选）" hint="填写后才会启用图片 JD 抽取；留空则关闭多模态">
                <input value={form.visionModel} onChange={(e) => setForm((f) => ({ ...f, visionModel: e.target.value }))}
                  placeholder={visionModels[0]?.id || '留空即关闭多模态'} className="input w-full" />
              </Field>
            </div>

            {namespaceMismatch && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2.5 text-[11px] leading-relaxed text-rose-800">
                <XCircle size={14} className="mt-0.5 shrink-0" />
                <span>
                  模型 ID 含「/」命名空间，与当前端点「{activeProviderName}」不匹配：该端点应使用短名。
                  请从左侧「可选模型」中点选，或清空视觉模型 ID，否则测试连接会返回 404。
                </span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={save} disabled={busy}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />} 保存并启用
              </button>
              <button className="btn-ghost" onClick={() => void test(false)} disabled={busy}>
                {testing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} 测试连接
              </button>
              <Link href="/copilot" className="btn-ghost"><Sparkles size={15} /> 去 Copilot 验证</Link>
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

            {testResult && (
              <div className="mt-3 rounded-xl border border-ink-200/70 bg-surface-2 p-3">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-800">
                  {testResult.ok ? <CheckCircle2 size={14} className="text-emerald-600" /> : <XCircle size={14} className="text-rose-600" />}
                  连通性测试 {testResult.ok ? '通过' : '未通过'}
                  {typeof testResult.latencyMs === 'number' && <span className="mono-num ml-auto text-[10.5px] font-normal text-ink-400">{testResult.latencyMs} ms</span>}
                </div>
                {testResult.reply && <div className="mono-num mt-2 text-[11px] text-ink-600">模型回复：{testResult.reply}</div>}
                {!testResult.ok && testResult.error && <div className="mt-2 text-[11px] text-ink-600">{testResult.error}</div>}
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader title="密钥与合规" sub="对应赛道「密钥不得入库」与 AI 安全评分项" icon={<ShieldCheck size={16} />} />
            <ul className="space-y-1.5">
              {(payload?.security || []).map((s) => (
                <li key={s} className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-600">
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600" />{s}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-ink-200/70 bg-surface-2 px-3 py-2">
              <Terminal size={14} className="shrink-0 text-brand-600" />
              <code className="mono-num flex-1 truncate text-[10.5px] text-ink-600">{payload?.links.checkCommand || 'npm run check:modelscope'}</code>
              <button onClick={() => { void navigator.clipboard?.writeText(payload?.links.checkCommand || 'npm run check:modelscope'); }}
                className="text-ink-400 hover:text-brand-600" title="复制命令"><Copy size={13} /></button>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-ink-500">
          <Info size={14} className="text-brand-600" />
          <span>启用后 AI Copilot、Deep Research、报告生成会走真实大模型；所有诊断数值仍由确定性算法产出，模型不产生数字。</span>
          <Link href="/data" className="ml-auto text-brand-600 hover:underline">知识库与 RAG →</Link>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-semibold text-ink-700">{label}</span>
        {hint && <span className="text-[10px] text-ink-400">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
