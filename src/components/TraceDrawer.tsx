'use client';

/**
 * 数值溯源抽屉：点击任意分数 → 右侧滑出「公式 → 中间量 → 结果 → 复算校验」。
 * 数据来自 GET /api/trace，纯只读，不影响任何正式计算结果。
 */
import { useCallback, useEffect, useState } from 'react';
import { X, Copy, Check, Sigma, AlertTriangle, ChevronDown, ChevronRight, Braces } from 'lucide-react';
import clsx from 'clsx';
import type { TracePayload, TraceKind } from '@/lib/trace';

export interface TraceTarget {
  kind: TraceKind;
  a: string;
  b?: string;
}

const KIND_LABEL: Record<TraceKind, string> = {
  match: '岗位契合度',
  similarity: '同质化评分',
  gap: '知识点缺口',
};

export function TraceButton({ target, className, children }: {
  target: TraceTarget;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('puhe:trace', { detail: target }));
      }}
      title="查看该分数的完整计算过程"
      className={clsx('inline-flex items-center gap-1 rounded transition-colors hover:text-brand-600', className)}
    >
      {children}
      <Sigma size={10} />
    </button>
  );
}

export default function TraceDrawer() {
  const [target, setTarget] = useState<TraceTarget | null>(null);
  const [payload, setPayload] = useState<TracePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const close = useCallback(() => {
    setTarget(null);
    setPayload(null);
    setError(null);
    setShowRaw(false);
  }, []);

  // 任意位置的 <TraceButton> 通过自定义事件唤起抽屉，避免逐页透传状态
  useEffect(() => {
    const onTrace = (e: Event) => {
      const detail = (e as CustomEvent<TraceTarget>).detail;
      if (detail?.kind && detail.a) {
        setTarget(detail);
        setPayload(null);
        setError(null);
      }
    };
    window.addEventListener('puhe:trace', onTrace as EventListener);
    return () => window.removeEventListener('puhe:trace', onTrace as EventListener);
  }, []);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    setLoading(true);
    const qs = new URLSearchParams({ kind: target.kind, a: target.a });
    if (target.b) qs.set('b', target.b);
    fetch(`/api/trace?${qs.toString()}`, { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        setPayload(data as TracePayload);
      })
      .catch((e) => { if (alive) setError(String(e?.message || e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, close]);

  if (!target) return null;

  const copy = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload.raw, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* 剪贴板不可用时静默 */ }
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-ink-900/45 backdrop-blur-sm" onClick={close} aria-hidden />

      <aside
        role="dialog"
        aria-label="数值溯源"
        className="relative z-10 flex h-full w-full max-w-[600px] flex-col border-l border-ink-200/70 bg-surface shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-ink-200/70 px-5 py-4">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Sigma size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="chip border-brand-200 bg-brand-50 text-[9.5px] text-brand-700">{KIND_LABEL[target.kind]}</span>
              <span className="mono-num text-[10px] text-ink-400">/api/trace</span>
            </div>
            <h2 className="mt-1 truncate text-[14.5px] font-semibold text-ink-900">{payload?.title || `${target.a}${target.b ? ` × ${target.b}` : ''}`}</h2>
            {payload && <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-400">{payload.subtitle}</p>}
          </div>
          <button onClick={close} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="关闭"><X size={17} /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2 py-10 text-[12px] text-ink-400">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-400/30 border-t-brand-500" /> 正在重算…
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-700">
              <AlertTriangle size={13} className="mr-1 inline" /> {error}
            </div>
          )}

          {payload && !loading && (
            <div className="space-y-5">
              {/* 公式 */}
              <section>
                <div className="label !text-[10px]">计算公式</div>
                <pre className="mt-1.5 overflow-x-auto rounded-xl border border-ink-200/70 bg-surface-2 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-ink-700">{payload.formula}</pre>
              </section>

              {/* 分步 */}
              <section>
                <div className="label !text-[10px]">计算链路</div>
                <ol className="mt-1.5 space-y-1.5">
                  {payload.steps.map((s) => (
                    <li key={s.label} className="rounded-xl border border-ink-100 bg-surface-2/60 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11.5px] font-medium text-ink-800">{s.label}</span>
                        <span className="mono-num shrink-0 text-[11.5px] font-semibold text-brand-700">{s.value}</span>
                      </div>
                      <div className="mono-num mt-0.5 break-all text-[10.5px] text-ink-500">{s.expr}</div>
                      {s.note && <div className="mt-1 text-[10px] leading-relaxed text-ink-400">{s.note}</div>}
                    </li>
                  ))}
                </ol>
              </section>

              {/* 明细表 */}
              {payload.table && payload.table.body.length > 0 && (
                <section>
                  <div className="label !text-[10px]">逐项明细（{payload.table.body.length}）</div>
                  <div className="mt-1.5 overflow-hidden rounded-xl border border-ink-200/70">
                    <table className="w-full text-left text-[10.5px]">
                      <thead className="bg-surface-2 text-[9.5px] uppercase tracking-wide text-ink-400">
                        <tr>
                          {payload.table.head.map((h) => <th key={h} className="px-2.5 py-1.5 font-medium">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {payload.table.body.map((r, i) => (
                          <tr key={`${r.name}-${i}`} className="border-t border-ink-100">
                            <td className="px-2.5 py-1.5 font-medium text-ink-800">{r.name}</td>
                            <td className="px-2.5 py-1.5 text-ink-500">{r.detail}</td>
                            <td className={clsx('mono-num px-2.5 py-1.5',
                              r.tone === 'good' ? 'text-emerald-600' : r.tone === 'warn' ? 'text-orange-600' : 'text-ink-600')}>{r.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* 结果 + 复算校验 */}
              <section className="rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-medium text-ink-700">{payload.result.label}</span>
                  <span className="mono-num text-[20px] font-bold leading-none text-brand-700">{payload.result.value}</span>
                </div>
                {payload.recompute && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className={clsx('chip border-0 px-1.5 py-0.5',
                      payload.recompute.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                      {payload.recompute.ok ? '✓ 复算一致' : '✗ 复算偏差'}
                    </span>
                    <span className="mono-num text-ink-500">页面值 {payload.recompute.expected} · 复算值 {payload.recompute.got}</span>
                  </div>
                )}
                {payload.recompute?.note && <div className="mt-1 text-[9.5px] leading-relaxed text-ink-400">{payload.recompute.note}</div>}
              </section>

              {/* 原始 JSON */}
              <section>
                <button onClick={() => setShowRaw((v) => !v)} className="flex items-center gap-1 text-[11px] font-medium text-ink-600 hover:text-brand-700">
                  {showRaw ? <ChevronDown size={12} /> : <ChevronRight size={12} />} <Braces size={12} /> 原始中间量 JSON
                </button>
                {showRaw && (
                  <pre className="mt-1.5 max-h-[260px] overflow-auto rounded-xl border border-ink-200/70 bg-surface-2 px-3 py-2 font-mono text-[10px] leading-relaxed text-ink-600">
                    {JSON.stringify(payload.raw, null, 2)}
                  </pre>
                )}
              </section>
            </div>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-ink-200/70 px-5 py-3">
          <span className="text-[10px] text-ink-400">同一输入永远得到同一输出 · 数值不来自大模型</span>
          <button onClick={copy} disabled={!payload} className="btn-ghost ml-auto !px-2.5 !py-1.5 !text-[10.5px] disabled:opacity-40">
            {copied ? <><Check size={11} /> 已复制</> : <><Copy size={11} /> 复制计算链</>}
          </button>
        </footer>
      </aside>
    </div>
  );
}
