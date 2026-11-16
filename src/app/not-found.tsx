import Link from 'next/link';
import { Compass, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[58vh] max-w-xl place-items-center px-4">
      <div className="card w-full p-7 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Compass size={22} /></div>
        <div className="mono-num mt-4 text-[34px] font-bold text-ink-900">404</div>
        <h2 className="text-[15px] font-semibold text-ink-900">没有找到这个页面</h2>
        <p className="mt-2 text-[12px] text-ink-500">可以使用 ⌘K 命令面板搜索专业、课程、岗位，或回到总览驾驶舱。</p>
        <Link href="/" className="btn-primary mx-auto mt-5 !text-xs"><Home size={14} /> 返回总览</Link>
      </div>
    </div>
  );
}
