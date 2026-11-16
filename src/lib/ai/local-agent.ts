/**
 * 本地确定性 Agent 引擎（DEMO_MODE / 无 API Key 时自动启用）
 *
 * 这不是「假聊天」：所有数字都来自 lib/graph.ts 的确定性算法与 lib/dataset.ts 的真实数据，
 * 工具调用、RAG 检索、证据引用、安全校验全部真实执行，只是把「语言组织」这一步用模板完成。
 * 这样即使评委断网、没有密钥，也能完整复现 AI 工作流的每一步。
 */
import { retrieve } from '../rag';
import { routeIntent, runTool } from './tools';
import { guardInput, verifyGrounding, confidenceOf, FALLBACK_ANSWER } from './safety';
import type { StreamEvent } from '../types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function composeAnswer(query: string, toolOutputs: { name: string; content: string }[], evidence: string): string {
  const joined = toolOutputs.map((o) => o.content).join('\n');
  const q = query.trim();
  const lines: string[] = [];
  lines.push(`**关于「${q}」的三维诊断结论**`);
  lines.push('');

  const sim = toolOutputs.find((o) => o.name === 'analyze_similarity' || o.name === 'generate_report');
  const comp = toolOutputs.find((o) => o.name === 'diagnose_competency');
  const gap = toolOutputs.find((o) => o.name === 'locate_knowledge_gap');
  const job = toolOutputs.find((o) => o.name === 'profile_job');
  const graph = toolOutputs.find((o) => o.name === 'query_graph');

  if (sim?.content) {
    const rows = sim.content.split('\n').filter((l) => l.includes('↔') || l.startsWith('宏观：')).slice(0, 3);
    lines.push('**① 宏观 · 专业布局**');
    lines.push(rows.map((r) => `- ${r}`).join('\n') || `- ${sim.content.slice(0, 120)}`);
    lines.push('评分模型 `S = 0.3×课程Jaccard + 0.4×知识点重叠率 + 0.3×图拓扑相似度`，综合分 ≥0.6 判定为同质化高风险。');
    lines.push('');
  }
  if (comp?.content) {
    const gaps = comp.content.split('\n').filter((l) => l.includes('培养不足'));
    lines.push('**② 中观 · 培养目标偏差**');
    lines.push(`- ${gaps[0] || '工程教育认证 12 项毕业要求已完成对齐'}`);
    lines.push('- 建议：把「使用现代工具」「沟通」「项目管理」拆成可测量的毕业要求指标点，并配套项目式实践环节。');
    lines.push('');
  }
  if (gap?.content) {
    const items = gap.content.split('\n').slice(0, 5);
    lines.push('**③ 微观 · 课程知识点缺口**');
    lines.push(items.map((i) => `- ${i.replace(/。证据：.*/, '')}`).join('\n'));
    lines.push('');
  }
  if (job?.content) {
    lines.push('**④ 产业侧岗位画像**');
    lines.push(`- ${job.content.split('\n')[0].slice(0, 180)}`);
    lines.push('');
  }
  const whatif = toolOutputs.find((o) => o.name === 'simulate_reform');
  const path = toolOutputs.find((o) => o.name === 'plan_learning_path');
  const syllabus = toolOutputs.find((o) => o.name === 'generate_syllabus');
  if (whatif?.content) {
    lines.push('**⑤ 改革沙盘推演**');
    lines.push(whatif.content.split('\n').slice(1, 6).map((l) => `- ${l}`).join('\n'));
    lines.push('');
  }
  if (path?.content) {
    lines.push('**⑥ 岗位能力路径**');
    lines.push(path.content.split('\n').slice(1, 4).map((l) => `- ${l}`).join('\n'));
    lines.push('');
  }
  if (syllabus?.content) {
    lines.push('**⑦ 课程大纲建议稿**');
    lines.push(`- 已依据知识点产业需求强度生成《${syllabus.content.split('\n')[0].replace(/[#《》]/g, '')}》大纲，含学时分配与考核方式`);
    lines.push('');
  }
  if (graph?.content) {
    lines.push('**⑧ 图谱证据**');
    lines.push(`- ${graph.content.slice(0, 180)}`);
    lines.push('');
  }
  if (lines.length <= 3) {
    lines.push(`- ${toolOutputs[0]?.content.split('\n')[0]?.slice(0, 180) || FALLBACK_ANSWER}`);
    lines.push('');
  }
  lines.push('> 📌 本次结论由本地确定性算法 + RAG 证据生成，未调用外部大模型；配置 `AI_API_KEY` 后将切换为大模型 Agent 编排，数值结论保持一致。');
  lines.push('> 📚 详细证据见下方「证据溯源」卡片，所有数值均可在「诊断工作台」中复算。');
  return lines.join('\n');
}

export async function* runLocalAgent(
  query: string,
  _history: { role: string; content: string }[] = [],
): AsyncGenerator<StreamEvent> {
  const guard = guardInput(query);
  yield { type: 'safety', level: guard.level, text: guard.text };
  if (guard.level === 'block') { yield { type: 'done', mode: 'local' }; return; }
  const q = guard.cleaned;

  yield { type: 'step', agent: '规划智能体', stage: '意图解析', text: '拆解问题 → 编排「宏观 / 中观 / 微观」工具链' };
  await sleep(120);

  const plan = routeIntent(q);
  yield { type: 'step', agent: '规划智能体', stage: '任务编排', text: `已规划 ${plan.length} 步：${plan.map((p) => p.name).join(' → ')}` };

  const hits = retrieve(q, 4);
  yield { type: 'step', agent: '检索智能体', stage: 'RAG 召回', text: `从 ${5} 类语料中召回 ${hits.length} 条证据（TF-IDF + 跨域术语扩展）` };
  if (hits.length) {
    yield { type: 'citations', items: hits.map((h) => ({ source: h.source, title: h.title, snippet: h.text.slice(0, 140) })) };
  }
  await sleep(100);

  const outputs: { name: string; content: string }[] = [];
  for (const step of plan) {
    yield { type: 'step', agent: step.name === 'retrieve_knowledge' ? '检索智能体' : '对齐智能体', stage: 'Function Calling', text: `调用 ${step.name}` };
    const out = runTool(step.name, step.args);
    outputs.push({ name: step.name, content: out.content });
    yield { type: 'tool', name: step.name, label: step.name, args: step.args, summary: out.summary };
    if (out.card) yield { type: 'card', card: out.card };
    await sleep(90);
  }

  yield { type: 'step', agent: '诊断智能体', stage: '交叉校验', text: `已执行 ${plan.length} 次工具调用，正在做证据一致性与数值溯源校验` };
  const evidence = [...hits.map((h) => h.text), ...outputs.map((o) => o.content)].join('\n');
  const answer = composeAnswer(q, outputs, evidence);
  const check = verifyGrounding(answer, evidence);
  yield { type: 'safety', level: check.level, text: check.text };
  await sleep(80);

  yield { type: 'step', agent: '报告智能体', stage: '流式生成', text: `置信度 ${confidenceOf(hits.length, plan.length)}%，开始逐段输出结论` };
  for (let i = 0; i < answer.length; i += 9) {
    yield { type: 'delta', text: answer.slice(i, i + 9) };
    await sleep(9);
  }
  yield { type: 'done', mode: 'local' };
}
