'use client';

/**
 * Agent 评测页 /eval
 * --------------------------------------------------------------------------
 * 逐条驱动固定用例集，实时显示进度与单项结果，最后给出量化指标。
 * 全部离线、零 token；同一用例集永远得到同一分数。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlaskConical, Play, RotateCcw, CheckCircle2, XCircle, ShieldCheck, ShieldAlert,
  Gauge, Sigma, Search, ArrowRight,
} from 'lucide-react';
import clsx from 'clsx';
import { Card, SectionHeader, Badge, ProgressBar } from '@/components/ui';

interface CaseMeta {
  id: string; category: string; question: string;
  expectAny: string[]; expectBlocked: boolean; expectWarn: boolean; note: string;
}

interface CaseResult {
  id: string; category: string; question: string;
  pass: boolean; blocked: boolean; warned: boolean;
  entityExpected: string[]; entityHits: string[];
  numberTotal: number; numberUntraceable: string[]; numericGrounding: number;
  selfCheck: string; independent: string; agreement: boolean | null;
  falseNegative: boolean; falsePositive: boolean;
  citationCount: number; tools: string[]; answer: string; ms: number; error?: string;
}

const CATEGORY_TONE: Record<string, 'blue' | 'green' | 'amber' | 'red' | 'gray'> = {
  检索: 'blue', 诊断: 'green', 数值: 'amber', 安全: 'red', 边界: 'gray',
};

function pct(n: number) { return `${Math.round(n * 100)}%`; }

export default function EvalPage() {
  const [cases, setCases] = useState<CaseMeta[]>([]);
  const [results, setResults] = useState<CaseResult[]>([]);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const abortRef = useRef(false);

  const runAll = useCallback(async (list: CaseMeta[]) => {
    abortRef.current = false;
    setResults([]); setError(null); setDone(false); setRunning(true);
    for (const c of list) {
      if (abortRef.current) break;
      setCurrent(c.id);
      try {
        const r = await fetch(`/api/eval?case=${encodeURIComponent(c.id)}`, { cache: 'no-store' });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        setResults((prev) => [...prev, data as CaseResult]);
      } catch (e) {
        setError(String((e as Error)?.message || e));
        break;
      }
    }
    setRunning(false); setCurrent(''); setDone(true);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/eval?list=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setCases(d.cases || []);
        void runAll(d.cases || []);
      })
      .catch((e) => { if (alive) { setError(String(e?.message || e)); setRunning(false); } });
    return () => { alive = false; abortRef.current = true; };
  }, [runAll]);

  const stats = useMemo(() => {
    const total = results.length;
    const passed = results.filter((r) => r.pass).length;
    const withEntity = results.filter((r) => r.entityExpected.length > 0 && !r.blocked);
    // 用例级：至少命中 1 个期望实体
    const entityRecall = withEntity.length
      ? withEntity.filter((r) => r.entityHits.length > 0).length / withEntity.length
      : 1;
    // 严格口径：期望关键词的命中比例
    const keywordRecall = withEntity.length
      ? withEntity.reduce((a, r) => a + r.entityHits.length / r.entityExpected.length, 0) / withEntity.length
      : 1;
    const numTotal = results.reduce((a, r) => a + r.numberTotal, 0);
    const numBad = results.reduce((a, r) => a + r.numberUntraceable.length, 0);
    const blockCases = results.filter((r) => cases.find((c) => c.id === r.id)?.expectBlocked);
    const safetyRecall = blockCases.length ? blockCases.filter((r) => r.blocked).length / blockCases.length : 1;
    const normal = results.filter((r) => !cases.find((c) => c.id === r.id)?.expectBlocked);
    const safetyPrecision = normal.length ? normal.filter((r) => !r.blocked).length / normal.length : 1;
    const comparable = results.filter((r) => r.agreement !== null);
    const agreementRate = comparable.length ? comparable.filter((r) => r.agreement).length / comparable.length : 1;
    const falseNeg = results.filter((r) => r.falseNegative).length;
    const falsePos = results.filter((r) => r.falsePositive).length;
    return {
      total, passed, passRate: total ? passed / total : 0,
      entityRecall, keywordRecall, numericGrounding: numTotal ? 1 - numBad / numTotal : 1, numTotal, numBad,
      safetyRecall, safetyPrecision, agreementRate, falseNeg, falsePos,
      totalMs: results.reduce((a, r) => a + r.ms, 0),
    };
  }, [results, cases]);

  const progress = cases.length ? results.length / cases.length : 0;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-float">
              <FlaskConical size={22} />
            </span>
            <div>
              <h2 className="text-[17px] font-semibold text-ink-900">
                Agent 评测{!running && done ? ` · ${stats.passed}/${stats.total} 通过` : ''}
              </h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
                {cases.length} 条固定用例 · 离线可复跑 · 零 token。指标参考 ragas 的
                Answer Relevancy / Faithfulness，额外增加「自检漏报」元评测。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="mono-num text-[26px] font-bold leading-none text-brand-700">
                {stats.passed}<span className="text-[14px] text-ink-400">/{cases.length}</span>
              </div>
              <div className="mono-num mt-1 text-[10px] text-ink-400">
                {running ? `执行中 ${results.length}/${cases.length}` : `总耗时 ${(stats.totalMs / 1000).toFixed(1)}s`}
              </div>
            </div>
            <button
              onClick={() => void runAll(cases)}
              disabled={running || !cases.length}
              className="btn-ghost !px-3 !py-2 !text-xs disabled:opacity-50"
            >
              {running ? <RotateCcw size={13} className="animate-spin" /> : <Play size={13} />}
              {running ? '评测中…' : '重新评测'}
            </button>
          </div>
        </div>

        {(running || progress > 0) && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[10px] text-ink-400">
              <span>{running ? `正在执行 ${current}…` : '已完成'}</span>
              <span className="mono-num">{results.length}/{cases.length}</span>
            </div>
            <ProgressBar value={progress * 100} tone={done && stats.passRate < 0.9 ? 'orange' : 'brand'} />
          </div>
        )}

        {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-700">{error}</div>}
      </Card>

      {stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { l: '实体召回', v: pct(stats.entityRecall), h: `至少命中 1 个实体；严格关键词命中 ${pct(stats.keywordRecall)}`, i: Search, tone: 'text-brand-700' },
            { l: '数值可溯源', v: pct(stats.numericGrounding), h: `${stats.numTotal - stats.numBad}/${stats.numTotal} 个数字命中证据`, i: Sigma, tone: 'text-emerald-700' },
            { l: '安全召回', v: pct(stats.safetyRecall), h: '注入用例被拦截', i: ShieldCheck, tone: 'text-emerald-700' },
            { l: '自检漏报', v: String(stats.falseNeg), h: `一致性 ${pct(stats.agreementRate)} · 误报 ${stats.falsePos}`, i: stats.falseNeg > 0 ? ShieldAlert : ShieldCheck, tone: stats.falseNeg > 0 ? 'text-rose-600' : 'text-emerald-700' },
          ].map((m) => {
            const I = m.i;
            return (
              <div key={m.l} className="card p-4">
                <div className="flex items-center justify-between">
                  <span className="label !text-[10px]">{m.l}</span>
                  <I size={13} className="text-ink-300" />
                </div>
                <div className={clsx('mono-num mt-1.5 text-[24px] font-bold leading-none', m.tone)}>{m.v}</div>
                <div className="mt-1.5 text-[10px] leading-snug text-ink-400">{m.h}</div>
              </div>
            );
          })}
        </div>
      )}

      <Card>
        <SectionHeader
          title="用例明细"
          sub="逐条结果；「未溯源」列出回答中出现但证据里找不到的数字"
          icon={<Gauge size={16} />}
          extra={<Badge tone={stats.passRate === 1 ? 'green' : stats.passRate >= 0.9 ? 'amber' : 'red'}>
            通过率 {pct(stats.passRate)}
          </Badge>}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-[10.5px] text-ink-400">
                <th className="pb-2 font-medium">结果</th>
                <th className="pb-2 font-medium">类别</th>
                <th className="pb-2 font-medium">用例</th>
                <th className="pb-2 font-medium">命中</th>
                <th className="pb-2 font-medium">数值溯源</th>
                <th className="pb-2 text-right font-medium">耗时</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const r = results.find((x) => x.id === c.id);
                return (
                  <tr key={c.id} className="border-b border-ink-50 last:border-0 align-top">
                    <td className="py-2">
                      {!r ? <span className="text-[10px] text-ink-300">{current === c.id ? '…' : '待执行'}</span>
                        : r.pass ? <CheckCircle2 size={14} className="text-emerald-600" /> : <XCircle size={14} className="text-rose-600" />}
                    </td>
                    <td className="py-2"><Badge tone={CATEGORY_TONE[c.category] || 'gray'}>{c.category}</Badge></td>
                    <td className="py-2 text-ink-700">
                      {c.question}
                      {c.note && <span className="ml-1 text-[9.5px] text-ink-400">（{c.note}）</span>}
                      {r?.error && <div className="mt-0.5 text-[9.5px] text-rose-600">错误：{r.error}</div>}
                    </td>
                    <td className="py-2 text-[10.5px] text-ink-500">
                      {!r ? '—'
                        : c.expectBlocked ? (r.blocked ? '已拦截' : <span className="text-rose-600">未拦截</span>)
                        : c.expectWarn ? (r.warned ? '已脱敏' : <span className="text-rose-600">未脱敏</span>)
                        : r.entityHits.length ? r.entityHits.slice(0, 2).join('、') : <span className="text-amber-600">未命中实体</span>}
                    </td>
                    <td className="py-2 text-[10.5px]">
                      {!r ? '—' : r.numberTotal === 0 ? <span className="text-ink-300">无数字</span>
                        : <span className={clsx('mono-num', r.numberUntraceable.length ? 'text-amber-700' : 'text-emerald-700')}>
                            {r.numberTotal - r.numberUntraceable.length}/{r.numberTotal}
                            {r.numberUntraceable.length > 0 && <span className="ml-1 text-[9.5px] text-ink-400">（{r.numberUntraceable.join(' ')}）</span>}
                          </span>}
                    </td>
                    <td className="mono-num py-2 text-right text-[10px] text-ink-400">{r ? `${r.ms} ms` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start gap-2 text-[11px] leading-relaxed text-ink-500">
          <ArrowRight size={13} className="mt-0.5 shrink-0 text-brand-600" />
          <span>
            <b className="text-ink-700">这项评测在测什么：</b>
            实体召回 = 回答有没有说到点子上；数值可溯源 = 回答里的每个数字能否在证据里找到（对应 ragas 的 Faithfulness）；
            安全召回 = 注入用例是否被拦；<b className="text-ink-700">自检漏报</b> = Agent 自己的
            <code className="mx-1 rounded bg-ink-100 px-1">verifyGrounding</code>
            说「通过」、而本页独立复算判为「有未溯源数值」的次数——这是危险方向，理想为 0。
            误报（自检告警但实际可溯源）属于保守方向，只记录不扣分。
          </span>
        </div>
      </Card>
    </div>
  );
}
