'use client';

/**
 * 系统自检页：一键体检数据引用闭合、算法确定性与运行时保护。
 * 对应命令行 `npm run verify:majors / verify:links / audit:data` 的运行时版本。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, RefreshCw, CheckCircle2, XCircle, Gauge, Database, Sigma, Cpu,
} from 'lucide-react';
import clsx from 'clsx';
import { Card, SectionHeader, Badge, Loading } from '@/components/ui';

interface CheckItem { id: string; group: string; name: string; pass: boolean; detail: string; ms: number }
interface Report {
  ok: boolean; passed: number; total: number; durationMs: number; generatedAt: string;
  items: CheckItem[];
  stats: { majors: number; courses: number; knowledgePoints: number; jobs: number; skills: number; similarityPairs: number; corpusChunks: number };
}

const GROUP_ICON: Record<string, typeof Database> = { 数据: Database, 算法: Sigma, 运行时: Cpu };

export default function HealthPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/selfcheck', { cache: 'no-store' });
      const data = await r.json();
      if (!data || typeof data.passed !== 'number') throw new Error(data?.error || `HTTP ${r.status}`);
      setReport(data as Report);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    if (!report) return [] as { name: string; items: CheckItem[] }[];
    const order = ['数据', '算法', '运行时'];
    return order
      .map((name) => ({ name, items: report.items.filter((i) => i.group === name) }))
      .filter((g) => g.items.length > 0);
  }, [report]);

  const failed = report?.items.filter((i) => !i.pass) ?? [];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className={clsx('grid h-11 w-11 place-items-center rounded-xl text-white shadow-float',
              report?.ok ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-gradient-to-br from-orange-400 to-rose-500')}>
              {report?.ok ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
            </span>
            <div>
              <h2 className="text-[17px] font-semibold text-ink-900">
                {loading ? '正在体检…' : report?.ok ? '系统自检全部通过' : report ? `${report.total - report.passed} 项未通过` : '自检不可用'}
              </h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
                数据引用闭合 · 算法确定性 · 运行时保护。全部为本地确定性断言，不依赖网络与大模型。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {report && (
              <div className="text-right">
                <div className="mono-num text-[26px] font-bold leading-none text-brand-700">{report.passed}<span className="text-[14px] text-ink-400">/{report.total}</span></div>
                <div className="mono-num mt-1 text-[10px] text-ink-400">{report.durationMs} ms · {new Date(report.generatedAt).toLocaleTimeString('zh-CN')}</div>
              </div>
            )}
            <button onClick={() => void load()} disabled={loading} className="btn-ghost !px-3 !py-2 !text-xs disabled:opacity-50">
              <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} /> 重新体检
            </button>
          </div>
        </div>

        {report && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { l: '专业', v: report.stats.majors },
              { l: '课程', v: report.stats.courses },
              { l: '知识点', v: report.stats.knowledgePoints },
              { l: '岗位', v: report.stats.jobs },
              { l: '技能', v: report.stats.skills },
              { l: '相似度组合', v: report.stats.similarityPairs },
              { l: 'RAG 语料', v: report.stats.corpusChunks },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-ink-200/70 bg-surface-2 px-2.5 py-2 text-center">
                <div className="mono-num text-[15px] font-semibold text-ink-800">{s.v.toLocaleString()}</div>
                <div className="mt-0.5 text-[9.5px] text-ink-400">{s.l}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {error && (
        <Card><div className="text-[12px] text-rose-700">自检接口异常：{error}</div></Card>
      )}

      {loading && !report && <Card><Loading text="正在运行断言…" /></Card>}

      {failed.length > 0 && (
        <Card className="!border-rose-200 !bg-rose-50/60">
          <SectionHeader title="未通过项" sub="这些断言失败通常意味着数据引用断裂或算法回归，需优先修复" icon={<ShieldAlert size={17} />} />
          <ul className="space-y-1.5">
            {failed.map((f) => (
              <li key={f.id} className="flex items-start gap-2 text-[11.5px] text-rose-800">
                <XCircle size={13} className="mt-0.5 shrink-0" />
                <span><b className="font-semibold">{f.name}</b> — {f.detail}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {groups.map((g) => {
        const Icon = GROUP_ICON[g.name] ?? Gauge;
        const passCount = g.items.filter((i) => i.pass).length;
        return (
          <Card key={g.name}>
            <SectionHeader
              title={`${g.name}类断言`}
              sub={`${passCount}/${g.items.length} 通过`}
              icon={<Icon size={16} />}
              extra={<Badge tone={passCount === g.items.length ? 'green' : 'red'}>{passCount === g.items.length ? '全绿' : `${g.items.length - passCount} 项失败`}</Badge>}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-ink-100 text-[10.5px] text-ink-400">
                    <th className="pb-2 font-medium">结论</th>
                    <th className="pb-2 font-medium">断言</th>
                    <th className="pb-2 font-medium">实际结果</th>
                    <th className="pb-2 text-right font-medium">耗时</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it) => (
                    <tr key={it.id} className="border-b border-ink-50 last:border-0">
                      <td className="py-1.5">
                        {it.pass
                          ? <CheckCircle2 size={14} className="text-emerald-600" />
                          : <XCircle size={14} className="text-rose-600" />}
                      </td>
                      <td className="py-1.5 font-medium text-ink-800">{it.name}</td>
                      <td className="py-1.5 text-ink-500">{it.detail}</td>
                      <td className="mono-num py-1.5 text-right text-ink-400">{it.ms} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      <Card>
        <div className="flex flex-wrap items-center gap-2 text-[11px] leading-relaxed text-ink-500">
          <Gauge size={13} className="text-brand-600" />
          本页断言与 <code className="rounded bg-ink-100 px-1">npm run verify:majors</code>（44 项）、
          <code className="rounded bg-ink-100 px-1">npm run verify:links</code>（68 项）、
          <code className="rounded bg-ink-100 px-1">npm run audit:data</code> 互补：命令行版本校验接口契约与页面可达性，
          本页校验数据闭合与算法自洽，可在答辩现场随时重跑。
        </div>
      </Card>
    </div>
  );
}
