/**
 * 谱合产教 · 领域类型定义
 * 对应项目书「双侧三层知识图谱」本体模型：专业 / 课程 / 培养目标 / 知识点 / 岗位 / 技能 / 能力要求
 */

export type Side = 'supply' | 'demand'; // 高校供给侧 / 产业需求侧
export type Layer = 'macro' | 'meso' | 'micro'; // 宏观 / 中观 / 微观

export interface Major {
  id: string;
  name: string;
  college: string;
  category: string;
  code: string;
  students: number;
  courses: string[]; // course name[]
  objectives: string[]; // 培养目标原文片段
}

export interface Course {
  id: string;
  name: string;
  credits: number;
  hours: number;
  majorIds: string[];
  knowledgePoints: string[]; // knowledge point name[]
  category: '通识' | '学科基础' | '专业核心' | '专业拓展' | '实践';
}

export interface KnowledgePoint {
  id: string;
  name: string;
  courseNames: string[];
  hours: number;
  bloom: '记忆' | '理解' | '应用' | '分析' | '评价' | '创造';
  aliases: string[]; // 产业侧同义表述，用于跨域语义对齐
  industryDemand: number; // 0-100，来自岗位 JD 中技能词频
  trend: 'up' | 'flat' | 'down';
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  demand: number; // 0-100
  trend: 'up' | 'flat' | 'down';
  aliases: string[];
}

export interface Job {
  id: string;
  title: string;
  industry: string;
  region: string;
  count: number;
  salary: string;
  education: string;
  jd: string; // 岗位描述原文（RAG 语料）
  skills: string[]; // skill name[]
}

export interface Competency {
  id: string;
  name: string;
  code: string; // 工程教育认证毕业要求 1-12
  schoolWeight: number; // 培养目标覆盖度 0-100
  industryWeight: number; // 岗位需求强度 0-100
  evidence: string;
}

export interface GraphNode {
  id: string;
  name: string;
  category: number;
  side: Side;
  layer: Layer;
  value: number;
  symbolSize: number;
  meta: Record<string, string | number>;
}

export interface GraphLink {
  source: string;
  target: string;
  relation: string;
  weight: number;
  layer: Layer;
}

export interface GraphPayload {
  nodes: GraphNode[];
  links: GraphLink[];
  categories: { name: string; color: string }[];
}

export interface SimilarityCell {
  a: string;
  b: string;
  jaccard: number;
  knowledgeOverlap: number;
  topology: number;
  score: number;
}

export interface GapItem {
  name: string;
  course: string;
  hours: number;
  demand: number;
  coverage: number;
  label: '应加强' | '应新增' | '可精简' | '保持';
  reason: string;
  evidence: string[];
}

export interface RagChunk {
  id: string;
  source: string;
  sourceType: '培养方案' | '课程大纲' | '招聘JD' | '政策文件' | '术语词典' | '用户上传';
  title: string;
  text: string;
}

export interface RagHit extends RagChunk {
  score: number;
}

/** Agent 流式事件协议（SSE） */
export type StreamEvent =
  | { type: 'step'; agent: string; stage: string; text: string }
  | { type: 'tool'; name: string; label: string; args: Record<string, unknown>; summary: string }
  | { type: 'delta'; text: string }
  | { type: 'card'; card: AgentCard }
  | { type: 'citations'; items: { source: string; title: string; snippet: string }[] }
  | { type: 'safety'; level: 'pass' | 'warn' | 'block'; text: string }
  | { type: 'done'; mode: 'llm' | 'local'; usage?: { prompt: number; completion: number } }
  | { type: 'error'; message: string };

export interface AgentCard {
  kind: 'similarity' | 'competency' | 'gap' | 'report' | 'graph';
  title: string;
  payload: unknown;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  events?: StreamEvent[];
  createdAt: number;
}
