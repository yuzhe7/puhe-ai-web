'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <section className={clsx('card', pad && 'p-5', className)}>{children}</section>;
}

export function SectionHeader({ title, sub, extra, icon }: { title: string; sub?: string; extra?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {icon && <span className="mt-0.5 text-brand-600">{icon}</span>}
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
          {sub && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-400">{sub}</p>}
        </div>
      </div>
      {extra}
    </div>
  );
}

/** 数字滚动：仅在值为数字时执行，尊重 prefers-reduced-motion */
export function CountUp({ value, duration = 900, className }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className={clsx('mono-num', className)}>{Number.isInteger(value) ? Math.round(shown).toLocaleString() : shown.toFixed(1)}</span>;
}

/** 轻量 SVG 迷你趋势线 */
export function Sparkline({ data, color = 'var(--accent-rgb)', height = 30 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const span = Math.max(1, max - min);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 100},${height - ((v - min) / span) * (height - 4) - 2}`).join(' ');
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={`spark-${color.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`rgb(${color})`} stopOpacity=".28" />
          <stop offset="100%" stopColor={`rgb(${color})`} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} 100,${height}`} fill={`url(#spark-${color.replace(/\W/g, '')})`} />
      <polyline points={pts} fill="none" stroke={`rgb(${color})`} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const TONE: Record<string, { line: string; text: string; icon: string; spark: string }> = {
  brand: { line: 'from-transparent via-brand-400 to-transparent', text: 'text-brand-700', icon: 'text-brand-500', spark: '110 154 255' },
  orange: { line: 'from-transparent via-orange-400 to-transparent', text: 'text-orange-700', icon: 'text-orange-500', spark: '251 146 60' },
  green: { line: 'from-transparent via-emerald-400 to-transparent', text: 'text-emerald-700', icon: 'text-emerald-500', spark: '52 211 153' },
  purple: { line: 'from-transparent via-violet-400 to-transparent', text: 'text-violet-700', icon: 'text-violet-500', spark: '167 139 250' },
};

export function StatCard({ label, value, unit, hint, tone = 'brand', icon, spark }: {
  label: string; value: string | number; unit?: string; hint?: string;
  tone?: 'brand' | 'orange' | 'green' | 'purple'; icon?: ReactNode; spark?: number[];
}) {
  const t = TONE[tone];
  return (
    <div className="card card-hover relative overflow-hidden p-4">
      <div className={clsx('absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r opacity-80', t.line)} />
      {icon && <div className={clsx('absolute right-3 top-3 opacity-[.16]', t.icon)}>{icon}</div>}
      <div className="label !text-[10.5px] opacity-70">{label}</div>
      <div className={clsx('mt-1.5 flex items-baseline gap-1', t.text)}>
        {typeof value === 'number'
          ? <span className="text-[26px] font-bold leading-none tracking-tight"><CountUp value={value} /></span>
          : <span className="mono-num text-[26px] font-bold leading-none tracking-tight">{value}</span>}
        {unit && <span className="text-xs font-medium opacity-70">{unit}</span>}
      </div>
      {hint && <div className="mt-2 text-[11px] leading-snug text-ink-400">{hint}</div>}
      {spark && spark.length > 1 && <div className="mt-2 opacity-80"><Sparkline data={spark} color={t.spark} height={22} /></div>}
    </div>
  );
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'orange' }) {
  const tones = {
    gray: 'border-ink-200 bg-ink-50 text-ink-600',
    blue: 'border-brand-200 bg-brand-50 text-brand-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
  }[tone];
  return <span className={clsx('chip', tones)}>{children}</span>;
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-ink-200 bg-surface-2 p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={clsx(
          'rounded-lg font-medium transition-all',
          size === 'sm' ? 'px-2.5 py-1 text-[11.5px]' : 'px-3 py-1.5 text-xs',
          value === o.value ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-500 hover:text-ink-800',
        )}>{o.label}</button>
      ))}
    </div>
  );
}

export function Loading({ text = '正在计算…' }: { text?: string }) {
  return (
    <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 text-ink-400">
      <div className="relative h-8 w-8">
        <div className="absolute inset-0 rounded-full border-2 border-brand-400/25" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-brand-500" />
      </div>
      <span className="mono-num text-[11px] tracking-wide">{text}</span>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="grid min-h-[160px] place-items-center rounded-xl border border-dashed border-ink-200 text-xs text-ink-400">{text}</div>;
}

/** 轻量 Markdown 渲染（粗体 / 代码 / 列表 / 引用 / 标题），避免引入额外解析库 */
export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split('\n');
  const inline = (s: string) => s
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
      return <span key={i}>{part}</span>;
    });
  return (
    <div className="prose-ai text-[13px] text-ink-700">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>;
        if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>;
        if (line.startsWith('> ')) return <blockquote key={i}>{inline(line.slice(2))}</blockquote>;
        if (/^[-*] /.test(line)) return <ul key={i}><li>{inline(line.slice(2))}</li></ul>;
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'orange' | 'green' | 'red' }) {
  const bg = { brand: 'bg-brand-500', orange: 'bg-orange-500', green: 'bg-emerald-500', red: 'bg-rose-500' }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
      <div className={clsx('h-full rounded-full transition-all duration-700', bg)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** 前后对比数值条（What-if 沙盘 / 路径规划复用） */
export function DeltaBar({ label, before, after, unit = '', max = 100, inverse = false }: {
  label: string; before: number; after: number; unit?: string; max?: number; inverse?: boolean;
}) {
  const delta = +(after - before).toFixed(1);
  const good = inverse ? delta < 0 : delta > 0;
  const pct = (v: number) => `${Math.max(2, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="rounded-xl border border-ink-200/70 bg-surface-2 p-3">
      <div className="flex items-center justify-between text-[11.5px]">
        <span className="font-medium text-ink-700">{label}</span>
        <span className={clsx('mono-num text-[11px] font-semibold', delta === 0 ? 'text-ink-400' : good ? 'text-emerald-600' : 'text-rose-600')}>
          {delta > 0 ? '+' : ''}{delta}{unit}
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-ink-400/60 transition-all duration-500" style={{ width: pct(before) }} /></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-100"><div className={clsx('h-full rounded-full transition-all duration-500', good ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: pct(after) }} /></div>
      </div>
      <div className="mono-num mt-1.5 flex justify-between text-[10px] text-ink-400"><span>现行 {before}{unit}</span><span>模拟 {after}{unit}</span></div>
    </div>
  );
}

export interface InsightEvent { time: string; tag: string; text: string; tone?: 'brand' | 'green' | 'orange' | 'rose' }

/** 实时洞察流：逐条渐入的 Agent 运行事件，用于首页态势面板 */
export function InsightFeed({ events, onRefresh, scanning = false }: { events: InsightEvent[]; onRefresh?: () => void; scanning?: boolean }) {
  const dot: Record<string, string> = { brand: 'bg-brand-500', green: 'bg-emerald-500', orange: 'bg-orange-500', rose: 'bg-rose-500' };
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [events]);
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11.5px] font-medium text-ink-600"><span className="live-dot" /> 实时洞察流</span>
        {onRefresh && (
          <button onClick={onRefresh} disabled={scanning} className="chip border-ink-200 bg-surface-2 text-[10px] text-ink-500 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50">
            {scanning ? '扫描中…' : '重新扫描'}
          </button>
        )}
      </div>
      <div ref={listRef} className="max-h-[248px] flex-1 space-y-1.5 overflow-y-auto pr-1">
        {events.map((e, i) => (
          <div key={`${e.time}-${i}`} className="flex animate-fade-up items-start gap-2 rounded-lg border border-ink-100 bg-surface-2/70 px-2.5 py-2"
            style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
            <span className={clsx('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', dot[e.tone || 'brand'])} />
            <span className="mono-num shrink-0 text-[9.5px] text-ink-400">{e.time}</span>
            <span className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-ink-600"><b className="mr-1 font-semibold text-ink-800">{e.tag}</b>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
