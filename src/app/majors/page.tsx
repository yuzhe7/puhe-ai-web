'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { buildMajorLinks } from '@/lib/major-context';
import dynamic from 'next/dynamic';
import type { EChartsOption } from 'echarts';
import {
  GraduationCap, Search, Layers3, BookOpen, BriefcaseBusiness, ShieldCheck,
  AlertTriangle, ArrowRight, SlidersHorizontal, Route, ScanSearch, Sparkles, X, Filter,
} from 'lucide-react';
import { Card, SectionHeader, Badge, Loading, ProgressBar, Empty } from '@/components/ui';
import { TraceButton } from '@/components/TraceDrawer';

const EChart = dynamic(() => import('@/components/EChart'), { ssr: false, loading: () => <Loading /> });

interface MajorRow {
  name: string; code: string; college: string; category: string; students: number;
  group: string; sourceId: string; tag: string; heat: number; scope: string;
  discipline: string; disciplineName: string; disciplineKind: 'specified' | 'auto';
  disciplineBy: string; disciplineEvidence: string;
  courseCount: number; kpCount: number; objectives: string[]; courses: string[];
  matchedJobs: { title: string; industry: string; score: number }[];
  topRisk: { other: string; score: number } | null;
}
interface TaxonomyCategory {
  id: string; name: string; kind: 'specified' | 'auto'; description: string;
  count: number; share: number; summary: string;
  majors: { name: string; code: string; college: string; students: number; heat: number; matchedBy: string; evidence: string }[];
}
interface Taxonomy {
  total: number; classified: number; unclassified: number; coverage: number;
  specifiedCount: number; autoCount: number; specifiedCategories: number; autoCategories: number;
  categories: TaxonomyCategory[]; highlights: string[]; method: string;
}
interface DisciplineOption {
  id: string; name: string; kind: 'specified' | 'auto'; description: string; count: number;
}
interface Catalog {
  rows: MajorRow[]; total: number; matched: number;
  groupStats: { name: string; count: number }[];
  /** 分面计数：已按当前搜索 / 标签 / 学科条件重算（排除来源分类自身），供分类 chips 使用 */
  groupFacets: { name: string; count: number }[];
  tagStats: { name: string; count: number }[];
  /** 标签下拉由服务端数据驱动，避免与 MajorMeta.tag 手工同步漂移 */
  tags: string[];
  /** 非法枚举值 / 超长输入被规范化后的说明 */
  filterWarnings: string[];
  normalizedFilters: { group: string; tag: string; discipline: string };
  taxonomy: Taxonomy;
  disciplineOptions: DisciplineOption[];
  sources: { id: string; name: string; date: string; url: string; authority: string }[];
  integrity: { ok: boolean; checked: Record<string, number>; issues: { level: string; target: string; message: string }[] };
  stats: { majors: number; courses: number; knowledgePoints: number; jobs: number; skills: number; jdTotal: number; catalogMajorCount: number };
  disclaimer: string;
}

const TAG_TONE: Record<string, 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'orange'> = {
  '2025新增': 'blue', '绿牌': 'green', '热度TOP': 'orange', '布点增长': 'blue',
  '十大热门': 'amber', '就业预警': 'red', '试点基础': 'gray', '目录补录': 'blue',
};

type SortKey = 'heat' | 'name' | 'risk';
interface FilterState { q: string; group: string; tag: string; discipline: string; sort?: SortKey }

/** 地址栏与 API 共用同一套参数构造，避免两处逻辑漂移；sort 仅用于地址栏 */
function buildFilterParams(s: FilterState, includeSort: boolean): URLSearchParams {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.group) p.set('group', s.group);
  if (s.tag) p.set('tag', s.tag);
  if (s.discipline) p.set('discipline', s.discipline);
  if (includeSort && s.sort && s.sort !== 'heat') p.set('sort', s.sort);
  return p;
}

export default function MajorsPage() {
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [tag, setTag] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [sort, setSort] = useState<SortKey>('heat');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // 从 URL 恢复完整筛选状态（含 tag / group / sort），使刷新与分享可复现
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const preset = p.get('q') || p.get('major') || '';
    if (preset) setQ(preset);
    if (p.get('discipline')) setDiscipline(p.get('discipline') || '');
    if (p.get('tag')) setTag(p.get('tag') || '');
    if (p.get('group')) setGroup(p.get('group') || '');
    const s = p.get('sort');
    if (s === 'heat' || s === 'name' || s === 'risk') setSort(s);
    setHydrated(true);
  }, []);

  // 筛选状态写回地址栏（replaceState 不触发路由跳转）；排序变化只更新 URL，不触发重新请求。
  // 等 URL 水合完成后再写，避免首次挂载时用空状态覆盖已有深链接参数。
  useEffect(() => {
    if (!hydrated) return;
    const p = buildFilterParams({ q, group, tag, discipline, sort }, true);
    window.history.replaceState(null, '', `/majors${p.toString() ? `?${p}` : ''}`);
  }, [q, group, tag, discipline, sort, hydrated]);

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      const params = buildFilterParams({ q, group, tag, discipline }, false);
      fetch(`/api/majors?${params.toString()}`, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => null);
            const retry = r.headers.get('Retry-After');
            throw new Error(`${body?.error || `请求失败（HTTP ${r.status}）`}${retry ? ` · 请 ${retry} 秒后重试` : ''}`);
          }
          return r.json();
        })
        .then((d: Catalog) => {
          // 集中校验响应形状：429/5xx/非目录响应或字段缺失都不会进入渲染，避免整页抛错
          const shapeOk =
            [d.rows, d.groupFacets, d.groupStats, d.tagStats, d.tags, d.disciplineOptions, d.sources].every(Array.isArray) &&
            Array.isArray(d.taxonomy?.categories) && Array.isArray(d.taxonomy?.highlights) &&
            Array.isArray(d.integrity?.issues) && d.integrity?.checked != null &&
            Array.isArray(d.filterWarnings) && d.normalizedFilters != null &&
            d.stats != null && typeof d.stats.jdTotal === 'number' &&
            typeof d.total === 'number' && typeof d.matched === 'number';
          if (!shapeOk) throw new Error('返回数据格式异常');
          setData(d);
          setError('');
          setLoading(false);
          // 服务端已把非法枚举值规范化，同步回 state 与 URL，避免下拉留空 / 非法参数残留
          if (d.normalizedFilters) {
            if (d.normalizedFilters.group !== group) setGroup(d.normalizedFilters.group);
            if (d.normalizedFilters.tag !== tag) setTag(d.normalizedFilters.tag);
            if (d.normalizedFilters.discipline !== discipline) setDiscipline(d.normalizedFilters.discipline);
          }
        })
        .catch((e: unknown) => {
          if (e instanceof Error && e.name === 'AbortError') return;
          setError(e instanceof Error ? e.message : '专业目录加载失败');
          setLoading(false);
        });
    }, 220);
    // 取消未完成的旧请求，避免快速输入时旧响应覆盖新结果
    return () => { clearTimeout(t); controller.abort(); };
  }, [q, group, tag, discipline, retryKey]);

  const rows = useMemo(() => {
    if (!data) return [];
    const out = [...data.rows];
    if (sort === 'heat') out.sort((a, b) => b.heat - a.heat || a.name.localeCompare(b.name));
    if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    if (sort === 'risk') out.sort((a, b) => (b.topRisk?.score ?? 0) - (a.topRisk?.score ?? 0));
    return out;
  }, [data, sort]);

  const hasFilter = Boolean(q || tag || group || discipline);
  const clearFilters = () => { setQ(''); setTag(''); setGroup(''); setDiscipline(''); };
  const activeConditions = [
    q && `搜索「${q}」`,
    tag && `标签「${tag}」`,
    group && `来源分类「${group}」`,
    discipline && `学科「${data?.disciplineOptions.find((o) => o.id === discipline)?.name || discipline}」`,
  ].filter(Boolean).join(' · ');

  const groupChart = useMemo<EChartsOption | null>(() => {
    if (!data) return null;
    const items = data.groupStats.filter((g) => g.count > 0).sort((a, b) => a.count - b.count);
    // 空数据时 Math.max(...[]) 会得到 -Infinity，使 ECharts 坐标轴失效
    const maxCount = items.reduce((m, i) => Math.max(m, i.count), 0);
    return {
      textStyle: { fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif' },
      grid: { left: 8, right: 28, top: 10, bottom: 8, containLabel: true },
      xAxis: { type: 'value', max: maxCount + 2, splitLine: { lineStyle: { color: '#e9eef6' } }, axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: { type: 'category', data: items.map((i) => i.name), axisLabel: { color: '#334155', fontSize: 10 }, axisTick: { show: false } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      series: [{
        type: 'bar', barMaxWidth: 14,
        data: items.map((i) => i.count),
        itemStyle: { color: '#3461f4', borderRadius: [0, 5, 5, 0] },
        label: { show: true, position: 'right', color: '#94a3b8', fontSize: 10 },
      }],
    };
  }, [data]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="tech-panel glow-border animate-fade-up rounded-2xl p-5 sm:p-6">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue"><GraduationCap size={11} /> 热门专业目录</Badge>
              <Badge tone="green">权威口径可追溯</Badge>
              <Badge tone="orange">数据完整性自检</Badge>
            </div>
            <h2 className="mt-3 text-[21px] font-bold tracking-tight text-ink-900 sm:text-[25px]">从 12 个试点专业，扩展到覆盖国家战略与就业热度的专业全景</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-500">
              目录按教育部《本科专业目录（2025 年）》新增专业、麦可思绿牌/红黄牌、高考热度榜与近五年布点增长 TOP4 整理，
              每个专业都配套课程、知识点、产业岗位与技能标签，可直接进入三维诊断、改革沙盘与能力路径。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { l: '收录专业', v: data?.stats.majors ?? '—' }, { l: '课程', v: data?.stats.courses ?? '—' },
              { l: '知识点', v: data?.stats.knowledgePoints ?? '—' }, { l: '岗位', v: data?.stats.jobs ?? '—' },
              { l: '技能', v: data?.stats.skills ?? '—' }, { l: 'JD 样本', v: data?.stats.jdTotal.toLocaleString() ?? '—' },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-ink-200/70 bg-surface-2/70 px-3 py-2">
                <div className="text-[10px] text-ink-400">{s.l}</div>
                <div className="mono-num mt-0.5 text-[17px] font-bold text-ink-900">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[10.5px] leading-relaxed text-amber-800">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>{data?.disclaimer || '专业目录取自公开权威资料口径，课程/学时/在招数/薪资为教学演示抽样数据。'} 全国本科专业共 {data?.stats.catalogMajorCount ?? 845} 种，本系统按「可与产业岗位 JD 语义对齐」原则选样，未穷尽全部专业。</span>
        </div>
      </div>

      {data && (
        <div className={`animate-fade-up rounded-2xl border p-3.5 ${data.integrity.ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60'}`}>
          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            {data.integrity.ok ? <ShieldCheck size={15} className="text-emerald-600" /> : <AlertTriangle size={15} className="text-rose-600" />}
            <span className="font-semibold text-ink-800">数据完整性自检：{data.integrity.ok ? '通过' : `${data.integrity.issues.filter((i) => i.level === 'error').length} 项错误`}</span>
            <span className="mono-num text-[10px] text-ink-500">
              {Object.entries(data.integrity.checked).map(([k, v]) => `${k}=${v}`).join(' · ')}
            </span>
            {data.integrity.issues.slice(0, 3).map((i, k) => <span key={k} className="chip border-rose-200 bg-surface text-[9.5px] text-rose-700">{i.target}：{i.message}</span>)}
          </div>
        </div>
      )}

      {/* 筛选 */}
      <Card className="animate-fade-up">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索专业名称 / 代码 / 学院 / 课程…" className="input !py-2 !pl-9 !text-xs" />
            {q && <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-rose-600"><X size={13} /></button>}
          </div>
          <select value={tag} onChange={(e) => setTag(e.target.value)} className="input !w-auto !py-2 !text-xs">
            <option value="">全部标签</option>
            {(data?.tags ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} className="input !w-auto !py-2 !text-xs">
            <option value="">全部学科大类</option>
            {data?.disciplineOptions.map((o) => <option key={o.id} value={o.id}>{o.name}（{o.count}）</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="input !w-auto !py-2 !text-xs">
            <option value="heat">按热度排序</option>
            <option value="risk">按同质化风险</option>
            <option value="name">按名称排序</option>
          </select>
          <span className="chip border-ink-200 bg-surface-2 text-[10px] text-ink-500"><Filter size={11} /> {data?.matched ?? 0} / {data?.total ?? 0}</span>
          {hasFilter && (
            <button onClick={clearFilters} className="btn-ghost !py-2 !text-xs"><X size={12} /> 清空筛选</button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button onClick={() => setGroup('')} className={`chip text-[10.5px] ${!group ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 bg-surface-2 text-ink-500'}`}>全部分类</button>
          {data?.groupFacets.map((g) => (
            <button key={g.name} onClick={() => g.count > 0 && setGroup(group === g.name ? '' : g.name)} disabled={g.count === 0}
              className={`chip text-[10.5px] ${g.count === 0 ? 'cursor-not-allowed border-ink-200 bg-surface-2 text-ink-300 opacity-60' : group === g.name ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 bg-surface-2 text-ink-500 hover:border-brand-300'}`}>
              {g.name} <span className="mono-num opacity-60">{g.count}</span>
            </button>
          ))}
        </div>
        {data && data.matched === 0 && hasFilter && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-[10.5px] leading-relaxed text-amber-800">
            <AlertTriangle size={12} className="shrink-0" />
            <span>当前条件无匹配（{activeConditions}）。上方分类数字已按其余条件重算，可逐个清除或</span>
            <button onClick={clearFilters} className="font-semibold underline hover:text-amber-900">一键清空筛选</button>
          </div>
        )}
        {error && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-[10.5px] text-rose-700">
            <AlertTriangle size={12} className="shrink-0" /> 专业目录加载失败：{error}（下方统计可能仍为上一次成功结果）
            <button onClick={() => setRetryKey((k) => k + 1)} className="ml-auto font-semibold underline hover:text-rose-900">重试</button>
          </div>
        )}
        {!error && !!data?.filterWarnings?.length && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-[10.5px] text-amber-800">
            <AlertTriangle size={12} className="shrink-0" /> {data.filterWarnings?.join('；')}
          </div>
        )}
        {hasFilter && !error && (
          <div className="mt-2 text-[9.5px] leading-relaxed text-ink-400">分类与学科下拉中的数字按其余筛选条件重算；下方「学科大类自动归类」「分类分布」为全量统计口径。</div>
        )}
      </Card>

      {data?.taxonomy && (
        <Card className="animate-fade-up">
          <SectionHeader
            title="学科大类自动归类"
            sub="7 个指定类 + 其余专业按语义自动归类，全量覆盖、依据可审计（卡片数量为全量统计，不受筛选影响）"
            icon={<Layers3 size={16} />}
            extra={<Badge tone="blue">NEW</Badge>}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { l: '收录专业', v: data.taxonomy.total },
              { l: '指定类', v: `${data.taxonomy.specifiedCategories} 类 / ${data.taxonomy.specifiedCount} 个` },
              { l: '自动归类', v: `${data.taxonomy.autoCategories} 类 / ${data.taxonomy.autoCount} 个` },
              { l: '覆盖率', v: `${data.taxonomy.coverage}%` },
              { l: '待补充口径', v: data.taxonomy.unclassified },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-ink-200/70 bg-surface-2/70 px-3 py-2">
                <div className="text-[10px] text-ink-400">{s.l}</div>
                <div className="mono-num mt-0.5 text-[15px] font-bold text-ink-900">{s.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-700"><Sparkles size={13} /> 自动归类总结</div>
            <ul className="mt-1.5 space-y-1">
              {data.taxonomy.highlights.map((h, i) => (
                <li key={i} className="text-[10.5px] leading-relaxed text-ink-600">· {h}</li>
              ))}
            </ul>
            <div className="mt-2 text-[9.5px] leading-relaxed text-ink-400">归类方法：{data.taxonomy.method}</div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.taxonomy.categories.filter((c) => c.count > 0).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setDiscipline(discipline === cat.id ? '' : cat.id)}
                className={`w-full rounded-xl border p-3 text-left transition-all ${discipline === cat.id ? 'border-brand-400 bg-brand-50/70 shadow-sm' : 'border-ink-200/70 bg-surface-2 hover:border-brand-300'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-ink-800">{cat.name}</span>
                  <span className="flex items-center gap-1.5">
                    <Badge tone={cat.kind === 'specified' ? 'blue' : 'gray'}>{cat.kind === 'specified' ? '指定' : '自动'}</Badge>
                    <span className="mono-num text-[13px] font-bold text-brand-600">{cat.count}</span>
                  </span>
                </div>
                <div className="mt-1 text-[10px] leading-relaxed text-ink-400">{cat.description}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {cat.majors.slice(0, 5).map((m) => <span key={m.name} className="chip border-ink-200 bg-surface px-1.5 py-0.5 text-[9.5px] text-ink-600">{m.name}</span>)}
                  {cat.majors.length > 5 && <span className="chip border-ink-200 bg-surface px-1.5 py-0.5 text-[9.5px] text-ink-400">+{cat.majors.length - 5}</span>}
                </div>
                <div className="mono-num mt-2 text-[9.5px] text-ink-500">{cat.summary}</div>
              </button>
            ))}
          </div>
          {discipline && (
            <div className="mt-3 flex items-center gap-2 text-[10.5px] text-ink-500">
              <Filter size={12} /> 已按「{data.disciplineOptions.find((o) => o.id === discipline)?.name || discipline}」筛选专业清单
              <button onClick={() => setDiscipline('')} className="ml-auto text-brand-600 hover:underline">清除筛选</button>
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <SectionHeader title="分类分布" sub="按来源归类后的专业数量（全量口径）" icon={<Layers3 size={16} />} />
          {groupChart ? <EChart option={groupChart} height={280} /> : <Loading />}
        </Card>
        <Card className="lg:col-span-2">
          <SectionHeader title="数据来源与口径" sub="所有外部资料均标注出处，演示数据不冒充真实统计" icon={<BookOpen size={16} />} />
          <div className="grid gap-2 sm:grid-cols-2">
            {data?.sources.map((s) => (
              <div key={s.id} className="rounded-xl border border-ink-200/70 bg-surface-2/60 p-3">
                <div className="flex items-center gap-2">
                  <span className="chip border-brand-100 bg-brand-50 text-[9px] text-brand-700">{s.authority}</span>
                  <span className="mono-num text-[9.5px] text-ink-400">{s.date}</span>
                </div>
                <div className="mt-1.5 text-[11px] leading-relaxed text-ink-700">{s.name}</div>
                {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[9.5px] text-brand-600 hover:underline">查看来源 <ArrowRight size={10} /></a>}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data?.tagStats.map((t) => <span key={t.name} className="chip border-ink-200 bg-surface-2 text-[10px] text-ink-500">{t.name} · {t.count}</span>)}
          </div>
        </Card>
      </div>

      {/* 专业卡片 */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-ink-900">专业清单</span>
          <Badge tone="blue">{rows.length} 个</Badge>
          {loading && <span className="text-[10.5px] text-ink-400">检索中…</span>}
        </div>
        {error ? <Empty text={`数据获取失败：${error}（请点击上方「重试」）`} /> : !data ? <Loading /> : !rows.length ? <Empty text="没有匹配的专业，试试清空筛选条件" /> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((m) => {
              const open = expanded === m.name;
              const links = buildMajorLinks(m);
              return (
                <div key={m.name} className="card card-hover animate-fade-up p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="truncate text-[13.5px] font-semibold text-ink-900">{m.name}</h3>
                        <Badge tone={TAG_TONE[m.tag] || 'gray'}>{m.tag}</Badge>
                        <Badge tone={m.disciplineKind === 'specified' ? 'blue' : 'gray'}>{m.disciplineName}</Badge>
                        <Badge tone={m.scope === '试点校' ? 'green' : 'gray'}>{m.scope}</Badge>
                      </div>
                      <div className="mono-num mt-1 text-[10px] text-ink-400">{m.code} · {m.college} · {m.scope === '试点校' ? '试点抽样专业' : '学科目录观察池（非试点校开设）'}</div>
                    </div>
                    <div className="mono-num shrink-0 text-right text-[17px] font-bold text-brand-600">{m.heat}<span className="text-[9px] font-normal text-ink-400">热度</span></div>
                  </div>
                  <div className="mt-2"><ProgressBar value={m.heat} tone={m.tag === '就业预警' ? 'orange' : 'brand'} /></div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[
                      { l: '课程', v: m.courseCount, i: BookOpen },
                      { l: '知识点', v: m.kpCount, i: Layers3 },
                      { l: '匹配岗位', v: m.matchedJobs.length, i: BriefcaseBusiness },
                    ].map((x) => {
                      const I = x.i;
                      return (
                        <div key={x.l} className="rounded-lg bg-surface-2 py-1.5">
                          <div className="flex items-center justify-center gap-1 text-[9.5px] text-ink-400"><I size={10} /> {x.l}</div>
                          <div className="mono-num mt-0.5 text-[13px] font-semibold text-ink-800">{x.v}</div>
                        </div>
                      );
                    })}
                  </div>
                  {m.matchedJobs.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {m.matchedJobs.slice(0, 2).map((j) => (
                        <TraceButton key={j.title} target={{ kind: 'match', a: m.name, b: j.title }} className="chip border-ink-200 bg-surface-2 text-[9.5px] text-ink-500">
                          {j.title} <span className="mono-num text-brand-600">{j.score}</span>
                        </TraceButton>
                      ))}
                    </div>
                  )}
                  {m.topRisk && (
                    <div className="mt-2 flex items-center gap-1.5 text-[9.5px] text-ink-400">
                      <AlertTriangle size={10} className="text-amber-600" /> 同质化最高：{m.topRisk.other}{' '}
                      <TraceButton target={{ kind: 'similarity', a: m.name, b: m.topRisk.other }} className="mono-num text-amber-700">S={m.topRisk.score}</TraceButton>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-ink-100 pt-3">
                    <Link href={links.simulate} title={`自动匹配目标岗位：${m.matchedJobs[0]?.title || '契合度最高岗位'}`} className="btn-ghost !px-2 !py-1.5 !text-[10px]"><SlidersHorizontal size={11} /> 沙盘</Link>
                    <Link href={links.diagnosis} title={`自动匹配对比专业：${m.topRisk?.other || '同质化最高专业'}`} className="btn-ghost !px-2 !py-1.5 !text-[10px]"><ScanSearch size={11} /> 诊断</Link>
                    <Link href={links.path} title={`自动匹配目标岗位：${m.matchedJobs[0]?.title || '契合度最高岗位'}`} className="btn-ghost !px-2 !py-1.5 !text-[10px]"><Route size={11} /> 路径</Link>
                    <button onClick={() => setExpanded(open ? null : m.name)} className="btn-ghost ml-auto !px-2 !py-1.5 !text-[10px]">{open ? '收起' : '详情'}</button>
                  </div>
                  {open && (
                    <div className="mt-3 animate-fade-up rounded-xl border border-brand-100 bg-brand-50/50 p-3">
                      <div className="text-[10.5px] font-semibold text-brand-700">培养目标</div>
                      <ul className="mt-1 space-y-1 text-[10px] leading-relaxed text-ink-600">
                        {m.objectives.map((o, i) => <li key={i}>· {o}</li>)}
                      </ul>
                      <div className="mt-2 text-[10.5px] font-semibold text-brand-700">课程体系（{m.courses.length}）</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.courses.map((c) => <span key={c} className="rounded bg-surface px-1.5 py-0.5 text-[9.5px] text-ink-600">{c}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <Sparkles size={16} className="text-brand-600" />
        <span className="text-[11.5px] text-ink-600">想看某个专业改课后会发生什么？进入改革沙盘拖动学时，或让 AI 在预算内自动寻优。</span>
        <Link href="/simulate" className="btn-primary ml-auto !py-1.5 !text-xs">打开改革沙盘 <ArrowRight size={12} /></Link>
      </div>
    </div>
  );
}
