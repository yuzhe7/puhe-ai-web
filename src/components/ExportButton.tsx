'use client';

/**
 * 导出按钮：POST /api/export 取回 CSV 并触发浏览器下载。
 * 带上沙盘当前方案（plan）时导出的是「改革后」的课程矩阵。
 */
import { useState } from 'react';
import { Download, Loader2, Check } from 'lucide-react';
import clsx from 'clsx';

export interface ExportPlanInput {
  hours?: Record<string, number>;
  modules?: string[];
  removed?: string[];
}

export default function ExportButton({ major, job, plan, type = 'course', label, className, block = true }: {
  major: string;
  job?: string;
  plan?: ExportPlanInput;
  type?: 'course' | 'match';
  label?: string;
  className?: string;
  /** false 时按行内按钮布局（放进 flex 工具条） */
  block?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (state === 'busy') return;
    setState('busy');
    setError(null);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ major, job, type, plan }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `导出失败（HTTP ${res.status}）`);
      }
      const blob = await res.blob();
      // 优先使用服务端给出的中文文件名（RFC 5987），取不到再本地兜底
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      const filename = m ? decodeURIComponent(m[1]) : `${major}_课程知识点矩阵.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setState('done');
      setTimeout(() => setState('idle'), 2200);
    } catch (e) {
      setError(String((e as Error)?.message || e));
      setState('idle');
    }
  };

  return (
    <div className={block ? 'w-full' : 'inline-block'}>
      <button onClick={run} disabled={state === 'busy'} className={clsx(className || 'btn-ghost w-full !text-xs', state === 'busy' && 'opacity-60')}>
        {state === 'busy' ? <Loader2 size={14} className="animate-spin" /> : state === 'done' ? <Check size={14} /> : <Download size={14} />}
        {state === 'busy' ? '正在生成…' : state === 'done' ? '已下载' : label || (type === 'match' ? '导出岗位技能明细 CSV' : '导出课程矩阵 CSV')}
      </button>
      {error && <p className="mt-1 text-[10px] leading-relaxed text-rose-600">{error}</p>}
    </div>
  );
}
