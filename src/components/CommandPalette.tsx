'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, CornerDownLeft, Sparkles, LayoutDashboard, Network, ScanSearch, Bot,
  Database, FileText, SlidersHorizontal, Route, Microscope, GraduationCap,
  BookOpen, BriefcaseBusiness, ArrowUp, ArrowDown, X, Command, PlugZap, ShieldCheck,
} from 'lucide-react';
import clsx from 'clsx';

interface Cmd { id: string; label: string; hint: string; group: '导航' | 'AI 指令' | '数据实体'; href: string; icon: React.ReactNode; keywords: string }
interface Entities {
  majors: { name: string; code: string; college: string; category: string }[];
  courses: { name: string; credits: number; hours: number; category: string; keywords: string }[];
  jobs: { title: string; industry: string; count: number; keywords: string }[];
}

const NAV_CMDS: Cmd[] = [
  { id: 'n1', label: '总览驾驶舱', hint: '平台全景与核心指标', group: '导航', href: '/', icon: <LayoutDashboard size={15} />, keywords: 'home overview 首页 总览' },
  { id: 'n0', label: '热门专业目录', hint: '62 个专业 · 分类 / 来源 / 热度', group: '导航', href: '/majors', icon: <BookOpen size={15} />, keywords: 'majors 专业 目录 绿牌 新增 热度' },
  { id: 'n2', label: '双侧三层图谱', hint: '交互式知识图谱浏览器', group: '导航', href: '/graph', icon: <Network size={15} />, keywords: 'graph 图谱 节点 关系' },
  { id: 'n3', label: '三维诊断工作台', hint: '宏观 / 中观 / 微观', group: '导航', href: '/diagnosis', icon: <ScanSearch size={15} />, keywords: 'diagnosis 诊断 同质化 偏差 缺口' },
  { id: 'n4', label: 'AI 诊断 Copilot', hint: '多 Agent 流式对话', group: '导航', href: '/copilot', icon: <Bot size={15} />, keywords: 'chat agent copilot 问答' },
  { id: 'n5', label: '培养方案改革沙盘', hint: 'What-if 决策模拟', group: '导航', href: '/simulate', icon: <SlidersHorizontal size={15} />, keywords: 'simulate what-if 沙盘 模拟 学时 改革' },
  { id: 'n6', label: '岗位能力路径', hint: '个性化补强学习路线', group: '导航', href: '/path', icon: <Route size={15} />, keywords: 'path 路径 学习 学生 就业' },
  { id: 'n7', label: 'Deep Research', hint: '多智能体深度研究', group: '导航', href: '/research', icon: <Microscope size={15} />, keywords: 'research 研究 深度 报告 证据' },
  { id: 'n8', label: '数据与知识库', hint: '多模态接入与 RAG', group: '导航', href: '/data', icon: <Database size={15} />, keywords: 'rag 数据 知识库 上传 pdf' },
  { id: 'n9', label: '报告中心', hint: '可追溯诊断报告', group: '导航', href: '/report', icon: <FileText size={15} />, keywords: 'report 报告 导出 pdf' },
  { id: 'n12', label: '系统自检', hint: '数据闭合 · 算法自洽 · 一键体检', group: '导航', href: '/health', icon: <ShieldCheck size={15} />, keywords: 'health selfcheck 自检 体检 断言 回归 质量' },
  { id: 'n10', label: '模型接入配置', hint: '网页直连大模型 API · 测试连通性', group: '导航', href: '/models', icon: <PlugZap size={15} />, keywords: 'model llm api key token 模型 密钥 魔搭 modelscope 接入 配置' },
  { id: 'n11', label: 'OCR 文档解析', hint: 'Xiaomi-OCR-0 · 图片转 RAG 语料', group: '导航', href: '/ocr', icon: <FileText size={15} />, keywords: 'ocr xiaomi 小米 图片 扫描件 文档 解析 kie vqa rag 语料 培养方案 jd' },
];

const AI_CMDS: Cmd[] = [
  { id: 'a1', label: '计算机科学与技术和软件工程是不是太像了？', hint: 'AI 快捷提问', group: 'AI 指令', href: '/copilot?q=' + encodeURIComponent('计算机科学与技术和软件工程是不是太像了？'), icon: <Sparkles size={15} />, keywords: '同质化 相似 专业' },
  { id: 'a2', label: '《数据结构》这门课应该怎么改？', hint: 'AI 快捷提问', group: 'AI 指令', href: '/copilot?q=' + encodeURIComponent('《数据结构》这门课应该怎么改？'), icon: <Sparkles size={15} />, keywords: '课程 知识点 改革' },
  { id: 'a3', label: '生成一份面向院系负责人的三维诊断报告', hint: 'AI 快捷提问', group: 'AI 指令', href: '/copilot?q=' + encodeURIComponent('生成一份面向院系负责人的三维诊断报告'), icon: <Sparkles size={15} />, keywords: '报告 院系' },
];

/**
 * 实体命令按需从 /api/majors?brief=1 拉取，而不是把 51 个专业 / 100+ 门课程 /
 * 30+ 个岗位的静态数据集打进首屏 bundle（v3 性能优化）。
 */
function buildEntityCommands(d: Entities | null): Cmd[] {
  if (!d) return [];
  return [
    ...d.majors.map((m) => ({ id: `m:${m.code}:${m.name}`, label: m.name, hint: `${m.college} · ${m.code}`, group: '数据实体' as const, href: `/majors?q=${encodeURIComponent(m.name)}`, icon: <GraduationCap size={15} />, keywords: `${m.name} ${m.college} ${m.category}` })),
    ...d.courses.map((c) => ({ id: `c:${c.name}`, label: c.name, hint: `${c.credits} 学分 · ${c.hours} 学时 · ${c.category}`, group: '数据实体' as const, href: `/diagnosis?tab=micro&course=${encodeURIComponent(c.name)}`, icon: <BookOpen size={15} />, keywords: c.keywords })),
    ...d.jobs.map((j) => ({ id: `j:${j.title}`, label: j.title, hint: `${j.industry} · 在招 ${j.count}`, group: '数据实体' as const, href: `/path?job=${encodeURIComponent(j.title)}`, icon: <BriefcaseBusiness size={15} />, keywords: j.keywords })),
  ];
}

const GROUPS = ['导航', 'AI 指令', '数据实体'] as const;

export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [entities, setEntities] = useState<Entities | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || entities) return;
    let alive = true;
    fetch('/api/majors?brief=1').then((r) => r.json()).then((d: Entities) => {
      if (alive && Array.isArray(d.majors)) setEntities(d);
    }).catch(() => null);
    return () => { alive = false; };
  }, [open, entities]);

  const ALL = useMemo(() => [...NAV_CMDS, ...AI_CMDS, ...buildEntityCommands(entities)], [entities]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); onOpenChange(!open); return; }
      if (e.key === '/' && !typing && !open) { e.preventDefault(); onOpenChange(true); return; }
      if (e.key === 'Escape' && open) { e.preventDefault(); onOpenChange(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  const results = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return NAV_CMDS.concat(AI_CMDS.slice(0, 2));
    return ALL.filter((c) => `${c.label} ${c.hint} ${c.keywords}`.toLowerCase().includes(key)).slice(0, 24);
  }, [q, ALL]);

  const go = (cmd: Cmd) => { onOpenChange(false); router.push(cmd.href); };

  if (!open) return null;

  let flatIndex = -1;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-ink-900/60 px-4 pt-[12vh] backdrop-blur-md" onMouseDown={() => onOpenChange(false)}>
      <div className="glow-border card w-full max-w-2xl overflow-hidden !rounded-2xl shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-ink-200/70 px-4 py-3.5">
          <Search size={17} className="shrink-0 text-brand-600" />
          <input
            ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
              if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]); }
            }}
            placeholder="搜索页面、专业、课程、岗位，或直接向 AI 提问…"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink-800 outline-none placeholder:text-ink-400"
          />
          <button onClick={() => onOpenChange(false)} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100" aria-label="关闭"><X size={15} /></button>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {!results.length && <div className="grid h-28 place-items-center text-xs text-ink-400">没有匹配项，试试「数据结构」或「AI应用开发工程师」</div>}
          {GROUPS.map((group) => {
            const items = results.filter((r) => r.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="mb-1">
                <div className="label px-3 py-2 !text-[10px]">{group}</div>
                {items.map((cmd) => {
                  flatIndex += 1;
                  const idx = flatIndex;
                  return (
                    <button key={cmd.id} onMouseEnter={() => setActive(idx)} onClick={() => go(cmd)}
                      className={clsx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', active === idx ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-50')}>
                      <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-lg', active === idx ? 'bg-brand-100' : 'bg-ink-100')}>{cmd.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium">{cmd.label}</span>
                        <span className="block truncate text-[10.5px] text-ink-400">{cmd.hint}</span>
                      </span>
                      {active === idx && <CornerDownLeft size={13} className="shrink-0 opacity-70" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-ink-200/70 px-4 py-2.5 text-[10.5px] text-ink-400">
          <span className="flex items-center gap-1"><ArrowUp size={11} /><ArrowDown size={11} /> 选择</span>
          <span className="flex items-center gap-1"><CornerDownLeft size={11} /> 打开</span>
          <span className="flex items-center gap-1"><kbd className="rounded bg-ink-100 px-1.5 py-0.5 font-mono">Esc</kbd> 关闭</span>
          <span className="ml-auto flex items-center gap-1"><Command size={11} /> K 唤起 · / 快捷</span>
        </div>
      </div>
    </div>
  );
}
