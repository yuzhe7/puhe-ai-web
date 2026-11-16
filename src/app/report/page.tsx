'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Printer, Copy, Check, Sparkles, ShieldCheck, BookOpen, Download } from 'lucide-react';
import { Card, SectionHeader, Badge, Loading, Empty } from '@/components/ui';
import ExportButton from '@/components/ExportButton';
import { majors, courses, demoStats } from '@/lib/dataset';
import type { SimilarityCell, GapItem } from '@/lib/types';
import type { CompetencyRow } from '@/lib/graph';

type Role = '教育管理者' | '院系负责人' | '课程负责人' | '学生';

const ROLE_HINT: Record<Role, string> = {
  教育管理者: '决策简报 · 3-5 页 · 关键指标 + 核心结论 + 行动建议',
  院系负责人: '专业诊断报告 · 15-20 页 · 问题诊断 + 改革建议',
  课程负责人: '课程优化报告 · 8-12 页 · 知识点缺口与调整方案',
  学生: '学生发展报告 · 个性化技能画像 + 学习路径建议',
};

export default function ReportPage() {
  const [role, setRole] = useState<Role>('院系负责人');
  const [major, setMajor] = useState('计算机科学与技术');
  const [course, setCourse] = useState('数据结构');
  const [sim, setSim] = useState<SimilarityCell[]>([]);
  const [comp, setComp] = useState<CompetencyRow[]>([]);
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'similarity' }) }).then((r) => r.json()),
      fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'competency' }) }).then((r) => r.json()),
      fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'gap', course }) }).then((r) => r.json()),
    ]).then(([a, b, c]) => { setSim(a.rows || []); setComp(b.rows || []); setGaps(c.rows || []); setLoading(false); }).catch(() => setLoading(false));
  }, [course]);

  const topSim = useMemo(() => sim.filter((r) => (r.a === major || r.b === major) && r.a !== r.b).sort((a, b) => b.score - a.score).slice(0, 3), [sim, major]);
  const weakComp = useMemo(() => comp.filter((c) => c.state === '培养不足'), [comp]);
  const overComp = useMemo(() => comp.filter((c) => c.state === '过度培养'), [comp]);
  const needChange = useMemo(() => gaps.filter((g) => g.label !== '保持'), [gaps]);

  const markdown = useMemo(() => [
    `# ${major} · 产教融合诊断报告（${role}）`,
    `> 生成时间：${new Date().toLocaleString('zh-CN')}｜数据范围：${demoStats.sampledMajors} 个抽样专业 / ${demoStats.courseCount} 门课程 / ${demoStats.knowledgePointCount} 个知识点 / ${demoStats.jdTotal.toLocaleString()} 条岗位需求`,
    '',
    `## 一、宏观：专业布局同质化`,
    `评分模型 S = 0.3×课程Jaccard + 0.4×知识点重叠率 + 0.3×图拓扑相似度。`,
    ...topSim.map((r) => `- ${r.a} ↔ ${r.b}：综合 ${r.score}（J ${r.jaccard} / K ${r.knowledgeOverlap} / G ${r.topology}）${r.score >= 0.6 ? '⚠️ 高风险' : ''}`),
    '',
    `## 二、中观：培养目标与岗位能力偏差`,
    `- 培养不足：${weakComp.map((c) => c.name).join('、') || '无'}`,
    `- 过度培养：${overComp.map((c) => c.name).join('、') || '无'}`,
    ...weakComp.slice(0, 3).map((c) => `- ${c.name}（偏差 +${c.gap}）：${c.suggestion}`),
    '',
    `## 三、微观：${course} 知识点缺口`,
    `- 需调整 ${needChange.length} 项：应新增 ${needChange.filter((g) => g.label === '应新增').length} / 应加强 ${needChange.filter((g) => g.label === '应加强').length} / 可精简 ${needChange.filter((g) => g.label === '可精简').length}`,
    ...needChange.slice(0, 8).map((g) => `- **${g.label}｜${g.name}**：${g.reason}（证据：${g.evidence.join('、') || '领域词频统计'}）`),
    '',
    `## 四、行动建议（按紧急程度 × 影响范围排序）`,
    `1. 立即：将「使用现代工具」「沟通」「项目管理」拆为可测量毕业要求指标点，配套项目式实践环节。`,
    `2. 本学期：${course} 新增 ${needChange.filter((g) => g.label === '应新增').map((g) => g.name).join('、') || '大模型应用相关'} 模块，强化哈希、并发、CI/CD 等工程化知识点。`,
    `3. 下学期：对高同质化专业对合并实训课程、重构差异化方向，并启动 PDCA 效果追踪。`,
    '',
    `## 五、证据溯源`,
    `- 培养方案/${major}、课程大纲/${course}、招聘 JD（${demoStats.jobCount} 类岗位）、《教育强国建设规划纲要（2024—2035年）》、工程教育认证 12 项毕业要求、教育—产业跨域术语对齐词典。`,
    `- 所有数值由 lib/graph.ts 确定性算法计算，可在「三维诊断工作台」中复算；AI 仅负责语言组织。`,
  ].join('\n'), [major, course, role, topSim, weakComp, overComp, needChange]);

  const copy = async () => {
    await navigator.clipboard.writeText(markdown).catch(() => null);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        {/* 配置侧栏 */}
        <div className="space-y-4">
          <Card>
            <SectionHeader title="报告配置" icon={<FileText size={15} />} />
            <div className="space-y-3">
              <div><div className="label mb-1.5">目标受众</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(ROLE_HINT) as Role[]).map((r) => (
                    <button key={r} onClick={() => setRole(r)} className={`rounded-lg border px-2 py-2 text-[11px] font-medium transition-all ${role === r ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500 hover:border-brand-300'}`}>{r}</button>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-ink-400">{ROLE_HINT[role]}</p>
              </div>
              <div><div className="label mb-1.5">目标专业</div>
                <select className="input !text-xs" value={major} onChange={(e) => setMajor(e.target.value)}>{majors.map((m) => <option key={m.id}>{m.name}</option>)}</select></div>
              <div><div className="label mb-1.5">目标课程</div>
                <select className="input !text-xs" value={course} onChange={(e) => setCourse(e.target.value)}>{courses.map((c) => <option key={c.id}>{c.name}</option>)}</select></div>
            </div>
          </Card>
          <Card>
            <SectionHeader title="交付动作" icon={<Download size={15} />} />
            <div className="space-y-2">
              <button onClick={() => window.print()} className="btn-primary w-full !text-xs"><Printer size={14} /> 打印 / 导出 PDF</button>
              <ExportButton major={major} className="btn-ghost w-full !text-xs" label="导出课程矩阵 CSV（教务可导入）" />
              <button onClick={copy} className="btn-ghost w-full !text-xs">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制 Markdown' : '复制 Markdown'}</button>
              <a href={`/copilot?q=${encodeURIComponent(`请生成${major}面向${role}的三维诊断报告`)}`} className="btn-soft w-full !text-xs"><Sparkles size={14} /> 交给 AI 扩写</a>
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-ink-400">CSV 含「课程 × 知识点 × 学时 × 缺口判定 × 对齐产业技能」，UTF-8 BOM 编码，Excel / WPS 直开、可导入教务系统；打印时浏览器可直接「另存为 PDF」。</p>
          </Card>
          <Card className="border-emerald-100 bg-emerald-50/40">
            <div className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" />
              <p className="text-[10.5px] leading-relaxed text-ink-600">报告内所有数值均由确定性算法输出并附带证据来源，AI 不生成任何数字，满足「可解释、可复算、可追溯」的评审要求。</p></div>
          </Card>
        </div>

        {/* 报告正文 */}
        <Card className="print:shadow-none" pad={false}>
          <div className="border-b border-ink-100 bg-gradient-to-r from-brand-50 to-white px-7 py-6">
            <div className="flex flex-wrap items-center gap-2"><Badge tone="blue">谱合产教 · 诊断报告</Badge><Badge tone="green">证据可追溯</Badge></div>
            <h2 className="mt-3 text-[22px] font-bold tracking-tight text-ink-900">{major} · 产教融合诊断报告</h2>
            <p className="mt-1.5 text-[11.5px] text-ink-500">面向 {role} ｜ 基于双侧三层知识图谱与三维递进式分析引擎 ｜ {new Date().toLocaleDateString('zh-CN')}</p>
          </div>

          {loading ? <div className="p-7"><Loading text="正在汇总三维诊断结果…" /></div> : (
            <div className="space-y-7 px-7 py-6 text-[12.5px] leading-relaxed text-ink-700">
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-ink-900"><span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-100 text-[11px] text-brand-700">1</span>执行摘要</h3>
                <p>本报告以 {major} 为对象，贯通「专业布局 → 培养目标 → 课程知识点」三个粒度，共检出 <strong className="text-brand-700">{topSim.filter((r) => r.score >= 0.6).length}</strong> 组高同质化专业对、<strong className="text-brand-700">{weakComp.length}</strong> 项能力缺口、<strong className="text-brand-700">{needChange.length}</strong> 项待调整知识点。数据覆盖 {demoStats.sampledMajors} 个抽样专业、{demoStats.knowledgePointCount} 个知识点与 {demoStats.jdTotal.toLocaleString()} 条产业岗位需求。</p>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-ink-900"><span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-100 text-[11px] text-brand-700">2</span>宏观诊断 · 专业同质化</h3>
                <p className="mb-3 text-[11.5px] text-ink-500">评分模型 <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px]">S = 0.3×J + 0.4×K + 0.3×G</code>，综合分 ≥ 0.6 判定为低水平重复建设高风险。</p>
                {topSim.length ? <table className="w-full text-left text-[11.5px]"><thead><tr className="border-b border-ink-200 text-[10.5px] text-ink-400"><th className="pb-2 font-medium">对比专业</th><th className="pb-2 font-medium">J</th><th className="pb-2 font-medium">K</th><th className="pb-2 font-medium">G</th><th className="pb-2 font-medium">S</th><th className="pb-2 font-medium">判定</th></tr></thead>
                  <tbody>{topSim.map((r, i) => <tr key={i} className="border-b border-ink-50"><td className="py-2">{r.a === major ? r.b : r.a}</td><td className="py-2 font-mono">{r.jaccard}</td><td className="py-2 font-mono">{r.knowledgeOverlap}</td><td className="py-2 font-mono">{r.topology}</td><td className="py-2 font-mono font-semibold text-brand-700">{r.score}</td><td className="py-2">{r.score >= 0.6 ? <Badge tone="red">高风险</Badge> : <Badge tone="green">可接受</Badge>}</td></tr>)}</tbody></table> : <Empty text="暂无对比数据" />}
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-ink-900"><span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-100 text-[11px] text-brand-700">3</span>中观诊断 · 培养目标偏差</h3>
                <p>依据工程教育认证 12 项毕业要求构建统一能力词表，对比校内覆盖度与产业需求强度：<strong className="text-rose-600">培养不足</strong> {weakComp.map((c) => c.name).join('、') || '无'}；<strong className="text-brand-700">过度培养</strong> {overComp.map((c) => c.name).join('、') || '无'}。</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">{weakComp.slice(0, 4).map((c) => (
                  <div key={c.id} className="rounded-xl border border-rose-100 bg-rose-50/50 p-3"><div className="text-[11.5px] font-semibold text-ink-800">{c.name} <span className="font-mono text-rose-600">+{c.gap}</span></div><p className="mt-1 text-[10.5px] leading-relaxed text-ink-600">{c.suggestion}</p></div>
                ))}</div>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-ink-900"><span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-100 text-[11px] text-brand-700">4</span>微观诊断 · {course} 课程改革指令</h3>
                <p className="mb-3">共 {gaps.length} 个知识点参与跨域语义对齐，其中 {needChange.length} 项需调整。</p>
                <div className="space-y-2">{needChange.slice(0, 8).map((g) => (
                  <div key={g.name} className="flex flex-wrap items-start gap-2 rounded-xl border border-ink-100 p-3">
                    <span className={`chip ${g.label === '应新增' ? 'border-rose-200 bg-rose-50 text-rose-700' : g.label === '应加强' ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{g.label}</span>
                    <div className="min-w-0 flex-1"><div className="text-[11.5px] font-semibold text-ink-800">{g.name} <span className="font-mono text-[10px] font-normal text-ink-400">需求 {g.demand} / {g.hours} 学时</span></div>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-ink-600">{g.reason}</p>
                      <p className="mt-1 text-[10px] text-brand-700">证据：{g.evidence.join('、') || '领域词频统计'}</p></div>
                  </div>
                ))}</div>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-ink-900"><span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-100 text-[11px] text-brand-700">5</span>行动建议与 PDCA 闭环</h3>
                <div className="space-y-2">
                  {[
                    ['立即', '将「使用现代工具」「沟通」「项目管理」拆为可测量毕业要求指标点，配套项目式实践环节。'],
                    ['本学期', `${course} 新增「${needChange.find((g) => g.label === '应新增')?.name || '大模型应用'}」模块，强化高需求知识点的工程化用法。`],
                    ['下学期', '对高同质化专业对合并实训课程、重构差异化方向；启动 Collect → Analyze → Suggest → Track 月度监测。'],
                  ].map(([k, v]) => <div key={k} className="flex gap-3 rounded-xl bg-ink-50 p-3"><span className="chip h-fit border-brand-100 bg-white text-[10px] text-brand-700">{k}</span><span className="text-[11.5px] leading-relaxed text-ink-600">{v}</span></div>)}
                </div>
              </section>

              <section className="border-t border-ink-100 pt-5">
                <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink-800"><BookOpen size={14} className="text-brand-600" />证据溯源</h3>
                <p className="text-[11px] leading-relaxed text-ink-500">培养方案/{major} · 课程大纲/{course} · 招聘 JD（{demoStats.jobCount} 类岗位）·《教育强国建设规划纲要（2024—2035年）》· 工程教育认证 12 项毕业要求 · 教育—产业跨域术语对齐词典 · 河北水利电力学院试点验证结论。所有数值由确定性算法计算，可在「三维诊断工作台」中复算。</p>
              </section>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
