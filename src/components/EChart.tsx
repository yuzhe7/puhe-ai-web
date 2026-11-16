'use client';

import { useEffect, useRef, useState } from 'react';
import type { EChartsOption } from 'echarts';

interface Props {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  onEvent?: (params: unknown) => void;
}

/**
 * 亮色图表配置是在 charts.ts 中以固定调色板构造的（纯函数，便于 SSR / 单测）。
 * 这里在渲染层做一次「主题色重映射」，让同一份配置在深空主题下自动可读，
 * 避免业务逻辑与主题耦合；同时监听主题切换事件实时重绘。
 */
const DARK_MAP: Record<string, string> = {
  '#334155': '#cbd5e1',
  '#94a3b8': '#8395b0',
  '#e9eef6': '#26324a',
  '#e6ecf7': '#22304a',
  '#fbfcff': '#111c31',
  '#f5f8ff': '#0f1a2e',
  '#f6f8fc': '#0f1a2e',
  '#f4f8ff': '#0d1729',
  '#e0e7f3': '#22304a',
  '#e2e8f0': '#334155',
  '#fff': '#0b1424',
  '#ffffff': '#0b1424',
  '#cbd8ef': '#3b5378',
  'rgba(255,255,255,.97)': 'rgba(12,20,36,.96)',
};

function remap(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(remap);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      out[k] = typeof v === 'string' && DARK_MAP[v.toLowerCase()] ? DARK_MAP[v.toLowerCase()] : remap(v);
    });
    return out;
  }
  return value;
}

function themed(option: EChartsOption, dark: boolean): EChartsOption {
  if (!dark) return option;
  return remap(option) as EChartsOption;
}

/**
 * ECharts 按需动态加载封装：
 * - 图表库不进入首屏 bundle（代码分割 / 懒加载，对应「前端性能优化」）
 * - 统一 ResizeObserver 自适应，避免路由切换后图表尺寸失真
 * - 主题切换时重绘，保证深色模式下坐标文字 / 网格 / tooltip 可读
 */
export default function EChart({ option, height = 320, className = '', onEvent }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ setOption: (o: EChartsOption, replace?: boolean) => void; resize: () => void; dispose: () => void; on: (e: string, cb: (p: unknown) => void) => void } | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const [dark, setDark] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset.theme !== 'light');
    sync();
    window.addEventListener('puhe-theme-change', sync);
    return () => window.removeEventListener('puhe-theme-change', sync);
  }, []);

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      try {
        const echarts = await import('echarts');
        if (disposed || !ref.current) return;
        const instance = echarts.init(ref.current, undefined, { renderer: 'canvas' });
        chartRef.current = instance as unknown as typeof chartRef.current;
        instance.setOption(themed(option, document.documentElement.dataset.theme !== 'light'), true);
        instance.on('click', (p) => handlerRef.current?.(p));
        ro = new ResizeObserver(() => instance.resize());
        ro.observe(ref.current);
      } catch (err) {
        // 图表库按需加载失败时给出可操作提示，而不是留下一块空白
        console.error('[puhe] ECharts 加载失败：', (err as Error).message);
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(themed(option, dark), true);
  }, [option, dark]);

  return (
    <div className={className} style={{ width: '100%', height, position: 'relative' }}>
      <div ref={ref} style={{ width: '100%', height: '100%' }} />
      {failed && (
        <div className="grid h-full w-full place-items-center rounded-xl border border-dashed border-ink-200 bg-surface-2/60 px-4 text-center text-[11px] leading-relaxed text-ink-500" style={{ position: 'absolute', inset: 0 }}>
          图表组件加载失败，请刷新页面重试；诊断数据与报告功能不受影响。
        </div>
      )}
    </div>
  );
}
