'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Network, Search, Layers3, GraduationCap, Factory, Info, RefreshCw, GitBranch } from 'lucide-react';
import { Card, SectionHeader, Badge, Segmented, Loading, Empty } from '@/components/ui';
import { graphOption } from '@/lib/charts';
import { majors } from '@/lib/dataset';
import { layerNames, sideNames } from '@/lib/graph';
import type { GraphPayload, Layer, Side, GraphNode } from '@/lib/types';

const EChart = dynamic(() => import('@/components/EChart'), { ssr: false, loading: () => <Loading /> });

export default function GraphPage() {
  const [layer, setLayer] = useState<Layer>('macro');
  const [sides, setSides] = useState<Side[]>(['supply', 'demand']);
  const [focus, setFocus] = useState('计算机科学与技术');
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'graph', layer, sides, focusMajor: focus }),
      });
      const d = await r.json();
      setPayload(d.graph);
    } finally { setLoading(false); }
  }, [layer, sides, focus]);

  useEffect(() => { load(); setSelected(null); }, [load]);

  const option = useMemo(() => {
    if (!payload) return null;
    const filtered = keyword.trim()
      ? {
        ...payload,
        nodes: payload.nodes.filter((n) => n.name.includes(keyword.trim()) || Object.values(n.meta).some((v) => String(v).includes(keyword.trim()))),
      }
      : payload;
    return graphOption(filtered, layer);
  }, [payload, keyword, layer]);

  const relationStats = useMemo(() => {
    if (!payload) return [];
    const m = new Map<string, number>();
    payload.links.forEach((l) => m.set(l.relation, (m.get(l.relation) || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [payload]);

  const onChartEvent = (p: unknown) => {
    const params = p as { dataType?: string; data?: { id?: string } };
    if (params.dataType === 'node' && params.data?.id && payload) {
      setSelected(payload.nodes.find((n) => n.id === params.data!.id) || null);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* 双侧三层说明 */}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { icon: GraduationCap, n: '高校供给侧', d: '专业 · 课程 · 培养目标 · 知识点', c: 'text-brand-600 bg-brand-50' },
          { icon: GitBranch, n: '跨域语义对齐', d: '同义词典 + 语义相似度 + 上下文消歧', c: 'text-violet-600 bg-violet-50' },
          { icon: Factory, n: '产业需求侧', d: '岗位类别 · 岗位 · 能力要求 · 技能', c: 'text-orange-600 bg-orange-50' },
        ].map((x) => {
          const Icon = x.icon;
          return (
            <div key={x.n} className={`card tri-panel flex items-center gap-3 border p-4 ${x.c}`}>
              <Icon size={20} />
              <div><div className="text-[13px] font-semibold">{x.n}</div><div className="mt-0.5 text-[11px] opacity-80">{x.d}</div></div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card pad={false} className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4">
            <div>
              <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-900"><Network size={16} className="text-brand-600" />{layerNames[layer]}</div>
              <p className="mt-0.5 text-[11px] text-ink-400">拖拽节点 / 滚轮缩放 / 点击节点查看属性；橙色连线表示跨侧语义对齐关系</p>
            </div>
            <button onClick={load} className="btn-ghost !px-2.5 !py-1.5 !text-xs"><RefreshCw size={13} /> 重新布局</button>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 bg-ink-50/40 px-4 py-3">
            <Segmented value={layer} onChange={setLayer} options={[
              { value: 'macro', label: '宏观 · 专业—课程' },
              { value: 'meso', label: '中观 · 目标—能力' },
              { value: 'micro', label: '微观 · 知识点—技能' },
            ]} />
            <div className="flex flex-wrap items-center gap-1.5">
              {(['supply', 'demand'] as Side[]).map((s) => {
                const checked = sides.includes(s);
                return (
                  <button key={s} onClick={() => setSides(checked ? sides.filter((x) => x !== s) : [...sides, s])} className={`chip transition-all ${checked ? (s === 'supply' ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-orange-200 bg-orange-50 text-orange-700') : 'border-ink-200 bg-white text-ink-400'}`}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: checked ? (s === 'supply' ? '#3461f4' : '#e8843c') : '#cbd5e1' }} />{sideNames[s]}
                  </button>
                );
              })}
            </div>
            <select className="input !w-auto !py-1.5 !text-xs" value={focus} onChange={(e) => setFocus(e.target.value)}>
              {majors.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>

          <div className="relative">
            {loading ? <Loading text="正在构建图谱…" /> : option && payload?.nodes.length ? (
              <EChart option={option} height={520} onEvent={onChartEvent} />
            ) : <Empty text="当前筛选条件下没有节点，请切换侧别或层级" />}
            <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-1.5">
              <Badge tone="blue">{payload?.nodes.length ?? 0} 节点</Badge>
              <Badge tone="orange">{payload?.links.length ?? 0} 关系</Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-ink-100 px-4 py-3">
            <Search size={14} className="shrink-0 text-ink-400" />
            <input className="input !border-0 !bg-transparent !px-1 !py-1 !text-xs !shadow-none focus:!ring-0" placeholder="搜索节点名称或属性（如：数据结构、Transformer、在招）" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            {keyword && <button className="text-[11px] text-brand-600" onClick={() => setKeyword('')}>清除</button>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader title="节点详情" sub="点击图谱节点查看本体属性" icon={<Info size={15} />} />
            {selected ? (
              <div className="space-y-2">
                <div className="rounded-xl bg-brand-50 px-3 py-2.5">
                  <div className="text-[13px] font-semibold text-brand-800">{selected.name}</div>
                  <div className="mt-0.5 text-[10.5px] text-brand-700/70">{payload?.categories[selected.category]?.name} · {sideNames[selected.side]} · {layerNames[selected.layer].split(' · ')[0]}</div>
                </div>
                {Object.entries(selected.meta).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-ink-100 py-1.5 text-[11.5px] last:border-0">
                    <span className="text-ink-400">{k}</span><span className="font-medium text-ink-800">{String(v)}</span>
                  </div>
                ))}
                <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-2.5 text-[10.5px] leading-relaxed text-ink-500">
                  关联关系 {payload?.links.filter((l) => l.source === selected.id || l.target === selected.id).length ?? 0} 条；
                  该节点参与{selected.layer === 'macro' ? '专业同质化' : selected.layer === 'meso' ? '能力偏差诊断' : '知识点缺口定位'}计算。
                </div>
              </div>
            ) : <Empty text="尚未选择节点" />}
          </Card>

          <Card>
            <SectionHeader title="关系类型分布" icon={<Layers3 size={15} />} />
            <div className="space-y-2">
              {relationStats.map(([name, count]) => (
                <div key={name} className="flex items-center gap-2 text-[11.5px]">
                  <span className="w-24 shrink-0 truncate text-ink-600">{name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (count / (payload?.links.length || 1)) * 100 * 2.5)}%` }} />
                  </div>
                  <span className="w-8 text-right font-mono text-ink-500">{count}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-brand-100 bg-brand-50/40">
            <div className="flex items-start gap-2">
              <Info size={15} className="mt-0.5 shrink-0 text-brand-600" />
              <p className="text-[11px] leading-relaxed text-brand-800/80">
                图谱本体按项目书 5.3 节自顶向下设计，定义专业 / 课程 / 培养目标 / 知识点 / 岗位 / 技能 / 能力要求七类核心概念。
                演示版数据由本地数据集确定性构建；生产版可将同一接口切换为 Neo4j Cypher 查询结果。
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
