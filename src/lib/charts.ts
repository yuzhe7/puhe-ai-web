/**
 * ECharts 配置构造器（纯函数，便于单测与服务端预渲染）
 * 对应项目书 5.5「智能可视化技术」：相似度热力图 / 能力偏差雷达图 / 知识点—技能桑基图 / 交互式知识图谱
 */
import type { EChartsOption } from 'echarts';
import type { SimilarityCell, GraphPayload } from './types';
import type { CompetencyRow } from './graph';

const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
const TEXT = '#334155', MUTED = '#94a3b8', GRID = '#e9eef6';
const tooltip = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  backgroundColor: 'rgba(255,255,255,.97)', borderColor: '#e2e8f0', borderWidth: 1,
  textStyle: { color: TEXT, fontSize: 12, fontFamily: FONT },
  extraCssText: 'box-shadow:0 8px 28px rgba(15,23,42,.14);border-radius:10px;',
  ...extra,
});

export function heatmapOption(rows: SimilarityCell[], names: string[]): EChartsOption {
  const idx = new Map(names.map((n, i) => [n, i]));
  const data = rows.filter((r) => idx.has(r.a) && idx.has(r.b)).flatMap((r) => {
    const a = idx.get(r.a)!, b = idx.get(r.b)!;
    return [[a, b, r.score], ...(a !== b ? [[b, a, r.score]] : [])];
  });
  return {
    textStyle: { fontFamily: FONT },
    tooltip: tooltip({ formatter: (p: { data: number[] }) => `${names[p.data[0]]} ↔ ${names[p.data[1]]}<br/><b>综合同质化评分 ${p.data[2]}</b>` }),
    grid: { left: 108, right: 24, top: 10, bottom: 68 },
    xAxis: {
      type: 'category', data: names, splitArea: { show: true, areaStyle: { color: ['#fbfcff', '#f6f8fc'] } },
      axisLabel: { color: MUTED, fontSize: 9, rotate: 42, interval: 0 }, axisLine: { lineStyle: { color: GRID } }, axisTick: { show: false },
    },
    yAxis: {
      type: 'category', data: names, splitArea: { show: true, areaStyle: { color: ['#fbfcff', '#f6f8fc'] } },
      axisLabel: { color: MUTED, fontSize: 9, interval: 0 }, axisLine: { lineStyle: { color: GRID } }, axisTick: { show: false },
    },
    visualMap: {
      min: 0, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 100,
      textStyle: { color: MUTED, fontSize: 10 },
      inRange: { color: ['#f4f8ff', '#bcd0ff', '#6b93fb', '#3461f4', '#1d37c4'] },
    },
    series: [{
      type: 'heatmap', data, progressive: 1000,
      itemStyle: { borderColor: '#fff', borderWidth: 1.5, borderRadius: 3 },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(35,70,227,.4)' } },
    }],
  };
}

export function radarOption(rows: CompetencyRow[]): EChartsOption {
  return {
    textStyle: { fontFamily: FONT },
    tooltip: tooltip({ trigger: 'item' }),
    legend: { bottom: 0, textStyle: { color: MUTED, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
    radar: {
      center: ['50%', '46%'], radius: '66%', splitNumber: 5,
      indicator: rows.map((r) => ({ name: r.name.length > 7 ? `${r.name.slice(0, 6)}…` : r.name, max: 100 })),
      axisName: { color: TEXT, fontSize: 10.5 },
      splitLine: { lineStyle: { color: '#e6ecf7' } },
      splitArea: { areaStyle: { color: ['#fbfcff', '#f5f8ff'] } },
      axisLine: { lineStyle: { color: '#e0e7f3' } },
    },
    series: [{
      type: 'radar', symbolSize: 4,
      data: [
        {
          name: '高校培养目标覆盖度', value: rows.map((r) => r.schoolWeight),
          lineStyle: { color: '#3461f4', width: 2 }, itemStyle: { color: '#3461f4' },
          areaStyle: { color: 'rgba(52,97,244,.16)' },
        },
        {
          name: '产业岗位能力需求度', value: rows.map((r) => r.industryWeight),
          lineStyle: { color: '#e8843c', width: 2, type: 'dashed' }, itemStyle: { color: '#e8843c' },
          areaStyle: { color: 'rgba(232,132,60,.14)' },
        },
      ],
    }],
  };
}

export function gapBarOption(items: { name: string; demand: number; hours: number; label: string }[]): EChartsOption {
  const colors: Record<string, string> = { 应加强: '#e8843c', 应新增: '#e11d48', 可精简: '#16a34a', 保持: '#94a3b8' };
  return {
    textStyle: { fontFamily: FONT },
    tooltip: tooltip({ trigger: 'axis', axisPointer: { type: 'shadow' } }),
    legend: { bottom: 0, textStyle: { color: MUTED, fontSize: 11 } },
    grid: { left: 8, right: 20, top: 16, bottom: 60, containLabel: true },
    xAxis: { type: 'category', data: items.map((i) => i.name), axisLabel: { color: MUTED, fontSize: 9, rotate: 38, interval: 0 }, axisTick: { show: false }, axisLine: { lineStyle: { color: GRID } } },
    yAxis: { type: 'value', max: 100, axisLabel: { color: MUTED, fontSize: 10 }, splitLine: { lineStyle: { color: GRID } } },
    series: [
      {
        name: '产业需求强度', type: 'bar', barMaxWidth: 20,
        data: items.map((i) => ({ value: i.demand, itemStyle: { color: colors[i.label] || '#94a3b8', borderRadius: [4, 4, 0, 0] } })),
      },
      {
        name: '当前教学覆盖（学时×10）', type: 'bar', barMaxWidth: 20,
        data: items.map((i) => ({ value: Math.min(100, i.hours * 10), itemStyle: { color: '#cbd8ef', borderRadius: [4, 4, 0, 0] } })),
      },
    ],
  };
}

/** 知识点 → 产业技能 流向图（桑基图的双向映射表达） */
export function sankeyOption(
  items: { name: string; label: string; demand: number }[],
  skillNames: string[],
): EChartsOption {
  const labelColor: Record<string, string> = { 应加强: '#e8843c', 应新增: '#e11d48', 可精简: '#16a34a', 保持: '#3461f4' };
  const nodes = [
    ...items.map((i) => ({ name: `K:${i.name}`, itemStyle: { color: labelColor[i.label] || '#3461f4' } })),
    ...['应加强', '应新增', '可精简', '保持'].map((l) => ({ name: `A:${l}`, itemStyle: { color: labelColor[l] } })),
    ...skillNames.slice(0, 5).map((s) => ({ name: `S:${s}`, itemStyle: { color: '#e8843c' } })),
  ];
  const links = [
    ...items.map((i) => ({ source: `K:${i.name}`, target: `A:${i.label}`, value: Math.max(1, Math.round(i.demand / 12)) })),
    ...skillNames.slice(0, 5).map((s, k) => ({ source: `A:${['应加强', '应新增', '可精简', '保持'][k % 4]}`, target: `S:${s}`, value: 6 - k })),
  ];
  return {
    textStyle: { fontFamily: FONT },
    tooltip: tooltip({ trigger: 'item', formatter: (p: { dataType: string; name: string; value?: number }) => p.dataType === 'edge' ? `${p.name} · 关联强度 ${p.value}` : p.name.replace(/^[KAS]:/, '') }),
    series: [{
      type: 'sankey', left: 8, right: 108, top: 12, bottom: 12,
      data: nodes, links, emphasis: { focus: 'adjacency' },
      label: { color: TEXT, fontSize: 10, formatter: (p: { name: string }) => p.name.replace(/^[KAS]:/, '') },
      lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.32 },
      nodeAlign: 'justify',
    }],
  };
}

export function graphOption(payload: GraphPayload, curLayer: string): EChartsOption {
  return {
    textStyle: { fontFamily: FONT },
    tooltip: tooltip({
      formatter: (p: { dataType: string; data: Record<string, unknown> }) => {
        if (p.dataType !== 'node') return `关系：${String(p.data.relation || '')}`;
        const meta = (p.data.meta as Record<string, string | number>) || {};
        const rows = Object.entries(meta).map(([k, v]) => `${k}：${v}`).join('<br/>');
        return `<b>${String(p.data.name || '')}</b><br/>${rows}`;
      },
    }),
    legend: [{ bottom: 0, data: payload.categories.map((c) => c.name), textStyle: { color: MUTED, fontSize: 10 }, itemWidth: 12, itemHeight: 8 }],
    animationDuration: 800, animationEasingUpdate: 'quinticInOut',
    series: [{
      type: 'graph', layout: 'force', roam: true, draggable: true,
      categories: payload.categories.map((c) => ({ name: c.name, itemStyle: { color: c.color } })),
      data: payload.nodes.map((n) => ({
        id: n.id, name: n.name, category: n.category, value: n.value,
        symbolSize: n.symbolSize, meta: n.meta,
        itemStyle: {
          color: payload.categories[n.category]?.color || '#94a3b8',
          borderColor: '#fff', borderWidth: 1.5,
          shadowBlur: n.side === 'demand' ? 8 : 4,
          shadowColor: n.side === 'demand' ? 'rgba(232,132,60,.32)' : 'rgba(52,97,244,.28)',
        },
        label: { show: n.symbolSize >= 18, position: 'right', fontSize: 9.5, color: TEXT, formatter: (p: { name: string }) => p.name.length > 12 ? `${p.name.slice(0, 11)}…` : p.name },
      })),
      links: payload.links.map((l) => ({
        source: l.source, target: l.target, value: l.weight, relation: l.relation,
        lineStyle: {
          color: l.relation.includes('对齐') || l.relation.includes('匹配') || l.relation.includes('缺失') ? '#e8843c' : 'source',
          width: Math.max(0.6, l.weight * 1.8),
          opacity: l.layer === 'micro' ? 0.28 : 0.42,
          curveness: l.relation.includes('对齐') || l.relation.includes('匹配') ? 0.16 : 0.04,
        },
      })),
      force: { repulsion: curLayer === 'macro' ? 130 : 90, gravity: 0.08, edgeLength: [45, 130], friction: 0.12, layoutAnimation: true },
      emphasis: { focus: 'adjacency', lineStyle: { width: 3, opacity: 0.9 } },
      lineStyle: { color: 'source', opacity: 0.3 },
    }],
  };
}

/** What-if 沙盘：现行方案 vs 改革方案 五维对比雷达 */
export function compareRadarOption(dims: string[], before: number[], after: number[]): EChartsOption {
  return {
    textStyle: { fontFamily: FONT },
    tooltip: tooltip({ trigger: 'item' }),
    legend: { bottom: 0, textStyle: { color: MUTED, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
    radar: {
      center: ['50%', '46%'], radius: '66%', splitNumber: 5,
      indicator: dims.map((d) => ({ name: d, max: 100 })),
      axisName: { color: TEXT, fontSize: 10.5 },
      splitLine: { lineStyle: { color: '#e6ecf7' } },
      splitArea: { areaStyle: { color: ['#fbfcff', '#f5f8ff'] } },
      axisLine: { lineStyle: { color: '#e0e7f3' } },
    },
    series: [{
      type: 'radar', symbolSize: 4,
      data: [
        { name: '现行方案', value: before, lineStyle: { color: '#94a3b8', width: 2, type: 'dashed' }, itemStyle: { color: '#94a3b8' }, areaStyle: { color: 'rgba(148,163,184,.12)' } },
        { name: '改革方案', value: after, lineStyle: { color: '#3461f4', width: 2 }, itemStyle: { color: '#3461f4' }, areaStyle: { color: 'rgba(52,97,244,.20)' } },
      ],
    }],
  };
}

/** 岗位能力路径：已掌握 → 待补强知识点 → 目标技能 的补强子图 */
export function pathGraphOption(g: {
  nodes: { id: string; name: string; category: number; value: number; symbolSize: number }[];
  links: { source: string; target: string; relation: string; weight: number }[];
  categories: { name: string; color: string }[];
}): EChartsOption {
  return {
    textStyle: { fontFamily: FONT },
    tooltip: tooltip({ formatter: (p: { dataType: string; data: Record<string, unknown> }) => p.dataType === 'edge' ? `关系：${String(p.data.relation || '')}` : `<b>${String(p.data.name || '')}</b><br/>类别：${g.categories[(p.data.category as number) || 0]?.name || ''}` }),
    legend: [{ bottom: 0, data: g.categories.map((c) => c.name), textStyle: { color: MUTED, fontSize: 10 }, itemWidth: 12, itemHeight: 8 }],
    animationDuration: 700,
    series: [{
      type: 'graph', layout: 'force', roam: true, draggable: true,
      categories: g.categories.map((c) => ({ name: c.name, itemStyle: { color: c.color } })),
      data: g.nodes.map((n) => ({
        id: n.id, name: n.name, category: n.category, value: n.value, symbolSize: n.symbolSize,
        itemStyle: { color: g.categories[n.category]?.color || '#94a3b8', borderColor: '#fff', borderWidth: 1.5, shadowBlur: 8, shadowColor: 'rgba(52,97,244,.28)' },
        label: { show: true, position: 'right', fontSize: 9.5, color: TEXT, formatter: (p: { name: string }) => p.name.length > 10 ? `${p.name.slice(0, 9)}…` : p.name },
      })),
      links: g.links.map((l) => ({ source: l.source, target: l.target, relation: l.relation, lineStyle: { color: l.relation === '技能对齐' ? '#e8843c' : 'source', width: 1.2, opacity: .5, curveness: .1 } })),
      force: { repulsion: 120, gravity: .1, edgeLength: [60, 150], friction: .14 },
      emphasis: { focus: 'adjacency', lineStyle: { width: 3, opacity: .9 } },
    }],
  };
}

export function skillTrendOption(skills: { name: string; demand: number; trend: string }[]): EChartsOption {
  const color: Record<string, string> = { up: '#e8843c', flat: '#3461f4', down: '#94a3b8' };
  return {
    textStyle: { fontFamily: FONT },
    tooltip: tooltip({ trigger: 'axis' }),
    grid: { left: 8, right: 24, top: 16, bottom: 24, containLabel: true },
    xAxis: { type: 'value', max: 100, axisLabel: { color: MUTED, fontSize: 10 }, splitLine: { lineStyle: { color: GRID } } },
    yAxis: { type: 'category', data: skills.map((s) => s.name), axisLabel: { color: MUTED, fontSize: 10 }, axisTick: { show: false } },
    series: [{
      type: 'bar', barMaxWidth: 12,
      data: skills.map((s) => ({ value: s.demand, itemStyle: { color: color[s.trend], borderRadius: [0, 5, 5, 0] } })),
      label: { show: true, position: 'right', color: MUTED, fontSize: 10 },
    }],
  };
}
