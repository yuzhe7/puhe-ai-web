'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/** 主题切换：写入 localStorage，并广播事件让 ECharts 等 canvas 组件重绘 */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme !== 'light');
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try { localStorage.setItem('puhe-theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('puhe-theme-change', { detail: next ? 'dark' : 'light' }));
  };

  return (
    <button onClick={toggle} title={dark ? '切换到明亮模式' : '切换到深空科技模式'} aria-label="切换主题"
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-200/70 bg-surface-2 px-2.5 text-ink-500 transition-all hover:border-brand-300 hover:text-brand-700">
      {mounted && dark ? <Moon size={15} /> : <Sun size={15} />}
      {!compact && <span className="hidden text-[11px] font-medium xl:inline">{dark ? '深空' : '明亮'}</span>}
    </button>
  );
}
