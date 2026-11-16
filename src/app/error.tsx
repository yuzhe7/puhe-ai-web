'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

/** 路由级错误边界：避免任一页面组件异常导致整站白屏（v3 审计修复） */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 不输出完整堆栈到控制台，避免把内部路径/参数暴露给终端用户
    console.error('[puhe] 页面渲染失败：', error.message, error.digest || '');
  }, [error]);

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-4">
      <div className="card w-full p-7 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><AlertTriangle size={22} /></div>
        <h2 className="mt-4 text-[17px] font-semibold text-ink-900">页面遇到了一点问题</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-500">
          已捕获异常并保留其他功能可用。可以重试当前页面；若反复出现，请回到总览驾驶舱重新进入。
        </p>
        {error.digest && <p className="mono-num mt-2 text-[10px] text-ink-400">错误标识：{error.digest}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button onClick={reset} className="btn-primary !text-xs"><RotateCcw size={14} /> 重试</button>
          <Link href="/" className="btn-ghost !text-xs"><Home size={14} /> 返回总览</Link>
        </div>
      </div>
    </div>
  );
}
