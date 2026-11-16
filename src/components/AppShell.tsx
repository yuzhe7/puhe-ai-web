'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Network, ScanSearch, Bot, Database, FileText,
  GraduationCap, ChevronRight, Sparkles, Menu, X, Cpu, CircleHelp, ExternalLink,
  SlidersHorizontal, Route, Microscope, Search, Command, Activity, BookOpen, PlugZap,
} from 'lucide-react';
import clsx from 'clsx';
import TechBackdrop from './TechBackdrop';
import ThemeToggle from './ThemeToggle';
import CommandPalette from './CommandPalette';

const NAV = [
  { href: '/', label: '总览驾驶舱', icon: LayoutDashboard, desc: '平台全景与核心指标' },
  { href: '/majors', label: '热门专业目录', icon: BookOpen, desc: '62 个专业 · 来源可追溯', tag: 'NEW' },
  { href: '/models', label: '模型接入配置', icon: PlugZap, desc: '网页直连大模型 API · 免重启', tag: 'NEW' },
  { href: '/ocr', label: 'OCR 文档解析', icon: ScanSearch, desc: 'Xiaomi-OCR-0 · 图片转 RAG 语料', tag: 'NEW' },
  { href: '/graph', label: '双侧三层图谱', icon: Network, desc: '交互式知识图谱浏览器' },
  { href: '/diagnosis', label: '三维诊断工作台', icon: ScanSearch, desc: '宏观 / 中观 / 微观' },
  { href: '/copilot', label: 'AI 诊断 Copilot', icon: Bot, desc: '多 Agent 流式对话' },
  { href: '/simulate', label: '培养方案改革沙盘', icon: SlidersHorizontal, desc: 'What-if 决策模拟', tag: 'NEW' },
  { href: '/path', label: '岗位能力路径', icon: Route, desc: '个性化补强学习路线', tag: 'NEW' },
  { href: '/research', label: 'Deep Research', icon: Microscope, desc: '多智能体深度研究', tag: 'NEW' },
  { href: '/data', label: '数据与知识库', icon: Database, desc: '多模态接入与 RAG' },
  { href: '/report', label: '报告中心', icon: FileText, desc: '可追溯诊断报告' },
];

const TITLES: Record<string, { title: string; sub: string }> = {
  '/': { title: '总览驾驶舱', sub: '高校人才培养 × 产业需求 · AI 驱动的精准匹配' },
  '/majors': { title: '热门专业目录', sub: '教育部 2025 新增 · 麦可思绿牌 · 高考热度 · 布点增长，来源可追溯' },
  '/models': { title: '大模型接入配置', sub: '选择服务商 → 填写密钥 → 测试连通性 → 一键启用，配置即时生效' },
  '/ocr': { title: 'Xiaomi-OCR-0 文档解析', sub: '本地 0.8B 文档理解模型 · 图片 → 结构化文本 → 复核入库 RAG' },
  '/graph': { title: '双侧三层知识图谱', sub: '高校供给侧 ↔ 产业需求侧，宏观 / 中观 / 微观纵向贯通' },
  '/diagnosis': { title: '三维递进式诊断', sub: '专业同质化 → 培养目标偏差 → 知识点缺口' },
  '/copilot': { title: 'AI 诊断 Copilot', sub: '多 Agent 编排 · RAG 证据 · Function Calling · 流式生成' },
  '/simulate': { title: '培养方案改革沙盘', sub: '调整课程学时与产业模块，实时预演改革成效（What-if Simulation）' },
  '/path': { title: '岗位能力路径规划', sub: '从目标岗位 JD 反推知识点补强路径与分学期学习计划' },
  '/research': { title: 'Deep Research 工作台', sub: '问题拆解 → 多路检索 → 交叉验证 → 带引用的研究简报' },
  '/data': { title: '数据与知识库', sub: '多模态文档接入 · 端侧向量检索 · 质量看板' },
  '/report': { title: '诊断报告中心', sub: '结构化结论 + 证据溯源 + 可导出交付' },
};

interface Status {
  mode: 'llm' | 'local';
  configSource?: 'demo' | 'runtime' | 'env' | 'none';
  model: string;
  vision: boolean;
  tools: { total: number };
  corpus: { total: number };
  provider?: { id: string; name: string; configured: boolean };
}

/** ModelScope 的 Model-Id 带命名空间（Qwen/xxx），侧栏只展示短名，完整值放 title */
function shortModel(model: string): string {
  const name = model.includes('/') ? model.split('/').slice(1).join('/') : model;
  return name.length > 22 ? `${name.slice(0, 21)}…` : name;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [palette, setPalette] = useState(false);
  const meta = TITLES[pathname] || TITLES['/'];

  useEffect(() => {
    const refresh = () => fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()).then(setStatus).catch(() => null);
    void refresh();
    // 「模型接入」页保存 / 清除配置后触发，侧栏引擎状态即时更新
    window.addEventListener('puhe:status-refresh', refresh);
    setOpen(false);
    return () => window.removeEventListener('puhe:status-refresh', refresh);
  }, [pathname]);

  return (
    <div className="relative flex min-h-screen">
      <TechBackdrop />

      {/* 侧边栏 */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-ink-200/70 bg-surface/95 backdrop-blur-xl transition-transform lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-float">
            <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/25" />
            <GraduationCap size={21} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold tracking-tight text-ink-900">谱合产教 <span className="text-brand-600">AI</span></div>
            <div className="mono-num truncate text-[10px] tracking-wide text-ink-400">Puhe EduGraph · AI Native</div>
          </div>
          <button className="ml-auto text-ink-400 lg:hidden" onClick={() => setOpen(false)} aria-label="关闭菜单"><X size={18} /></button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={clsx(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all',
                active ? 'bg-brand-600 text-white shadow-float' : 'text-ink-600 hover:bg-ink-100',
              )}>
                {active && <span className="absolute -left-3 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-neon shadow-[0_0_12px_#22d3ee]" />}
                <Icon size={17} className={active ? 'text-white' : 'text-ink-400 group-hover:text-brand-600'} />
                <div className="min-w-0 flex-1">
                  <div className={clsx('flex items-center gap-1.5 text-[13px] font-medium', active ? 'text-white' : 'text-ink-800')}>
                    <span className="truncate">{item.label}</span>
                    {item.tag && <span className={clsx('mono-num shrink-0 rounded px-1 py-[1px] text-[8px] font-bold', active ? 'bg-white/20 text-white' : 'bg-neon/15 text-brand-600')}>{item.tag}</span>}
                  </div>
                  <div className={clsx('truncate text-[10.5px]', active ? 'text-white/70' : 'text-ink-400')}>{item.desc}</div>
                </div>
                {active && <ChevronRight size={14} className="text-white/70" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-ink-100 px-4 py-3.5">
          <div className="flex items-center justify-between text-[11px] text-ink-500">
            <span className="flex items-center gap-1.5"><Cpu size={12} /> AI 引擎</span>
            <span
              title={status?.provider?.name ? `${status.provider.name} · ${status.model}` : undefined}
              className={clsx('chip border-0 px-2 py-0.5', status?.mode === 'llm' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-soft" />
              {status ? (status.mode === 'llm'
                ? `${status.provider?.id === 'modelscope' ? '魔搭' : 'LLM'} · ${shortModel(status.model)}${status.configSource === 'runtime' ? ' · 网页配置' : ''}`
                : '本地确定性引擎') : '检测中…'}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-ink-400">
            <span className="mono-num">{status?.tools.total ?? 10} tools · {status?.corpus.total ?? '—'} chunks</span>
            <button onClick={() => setHelp(true)} className="hover:text-brand-600" aria-label="帮助"><CircleHelp size={13} /></button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-ink-900/40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* 主区 */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-ink-200/70 bg-surface/85 backdrop-blur-xl">
          <div className="flex h-[68px] items-center gap-3 px-4 sm:px-7">
            <button className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 lg:hidden" onClick={() => setOpen(true)} aria-label="打开菜单"><Menu size={19} /></button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[16px] font-semibold text-ink-900">{meta.title}</h1>
              <p className="truncate text-[11.5px] text-ink-400">{meta.sub}</p>
            </div>

            <button onClick={() => setPalette(true)}
              className="hidden h-9 items-center gap-2 rounded-xl border border-ink-200/70 bg-surface-2 px-3 text-[11.5px] text-ink-400 transition-all hover:border-brand-300 hover:text-brand-700 md:flex">
              <Search size={14} /> <span>搜索页面 / 实体 / 提问</span>
              <kbd className="mono-num ml-2 rounded border border-ink-200 bg-surface px-1.5 py-0.5 text-[10px]">⌘K</kbd>
            </button>
            <button onClick={() => setPalette(true)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 md:hidden" aria-label="搜索"><Command size={17} /></button>

            <div className="hidden items-center gap-2 xl:flex">
              <span className="chip border-emerald-200 bg-emerald-50 text-emerald-700">
                <span className="live-dot" /> 服务在线
              </span>
              {status?.vision && <span className="chip border-brand-200 bg-brand-50 text-brand-700">多模态已启用</span>}
            </div>
            <ThemeToggle />
            <Link href="/copilot" className="btn-primary !px-3 !py-2 !text-xs">
              <Sparkles size={14} /> 问问 AI
            </Link>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-brand-400/50 to-transparent opacity-60" />
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-7 sm:py-7">{children}</main>

        <footer className="border-t border-ink-200/70 bg-surface/70 px-7 py-4 text-[11px] text-ink-400 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2"><Activity size={12} className="text-brand-600" /> 谱合产教 · 基于多层知识图谱的高校人才培养与产业需求精准分析平台（AI Native Web 版）</span>
            <span className="flex items-center gap-3">
              <span className="mono-num">Next.js 14 · TypeScript · RAG · Multi-Agent · MCP · What-if</span>
              <a href="/api/mcp" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand-600">MCP <ExternalLink size={10} /></a>
            </span>
          </div>
        </footer>
      </div>

      <CommandPalette open={palette} onOpenChange={setPalette} />

      {help && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-900/60 p-4 backdrop-blur-sm" onClick={() => setHelp(false)}>
          <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-ink-900">运行模式与快捷键</h3>
            <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-ink-600">
              <p><strong className="text-ink-800">本地确定性引擎</strong>：未配置密钥时自动启用。RAG 检索、多 Agent 编排、Function Calling、三维算法、What-if 模拟、证据溯源全部真实执行，仅「语言组织」用模板完成，零 token 消耗，适合评审离线演示。</p>
              <p><strong className="text-ink-800">大模型 Agent</strong>：在 <code className="rounded bg-ink-100 px-1">.env.local</code> 配置 <code className="rounded bg-ink-100 px-1">AI_API_KEY</code> 后启用，走服务端 OpenAI 兼容协议，支持 SSE 逐 token 流式输出与多轮工具调用。</p>
              <p><strong className="text-ink-800">多模态</strong>：<code className="rounded bg-ink-100 px-1">VISION_API_KEY</code> 启用图片视觉理解；Web Speech API 提供语音提问与结论朗读。</p>
              <p><strong className="text-ink-800">快捷键</strong>：<kbd className="rounded bg-ink-100 px-1 font-mono">⌘K / Ctrl+K</kbd> 或 <kbd className="rounded bg-ink-100 px-1 font-mono">/</kbd> 唤起全局命令面板，可直接搜索专业、课程、岗位或向 AI 提问；右上角切换深空 / 明亮主题。</p>
            </div>
            <button className="btn-primary mt-5 w-full" onClick={() => setHelp(false)}>知道了</button>
          </div>
        </div>
      )}
    </div>
  );
}
