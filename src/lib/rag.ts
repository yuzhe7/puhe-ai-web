/**
 * 端侧轻量 RAG 引擎（检索增强生成）
 *
 * 设计要点：
 * 1. 纯 TypeScript、零外部依赖，浏览器端即可运行 —— 对应赛道「Transformers.js / 端侧 AI / 端云协同推理」的前瞻方向。
 * 2. 中文按「字二元组」切分 + 英文按词切分，构建稀疏 TF-IDF 向量，余弦相似度检索。
 * 3. 检索结果强制作为 citation 注入 Prompt，模型只能基于证据作答（AI 安全与可解释性）。
 * 4. 用户上传的文档可实时切片入库，演示「数据 → 知识 → 回答」的完整链路。
 */
import { buildRagCorpus, skills, knowledgePoints } from './dataset';
import { hasInjection, sanitizeUntrustedText } from './ai/safety';
import type { RagChunk, RagHit } from './types';

let corpus: RagChunk[] | null = null;
let idf: Map<string, number> | null = null;
let vectors: Map<string, number>[] | null = null;

/** 全局内存语料上限：防止反复上传导致无界内存增长（多实例部署需外置向量库） */
export const CORPUS_LIMIT = 2000;

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const latin = text.toLowerCase().match(/[a-z0-9+#.]{2,}/g) || [];
  latin.forEach((w) => tokens.push(`w:${w}`));
  const clean = text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  for (let i = 0; i < clean.length - 1; i += 1) {
    const bg = clean.slice(i, i + 2);
    if (/[\u4e00-\u9fa5]/.test(bg)) tokens.push(`b:${bg}`);
  }
  return tokens;
}

function buildIndex() {
  corpus = buildRagCorpus();
  const df = new Map<string, number>();
  const tokVectors = corpus.map((c) => {
    const tf = new Map<string, number>();
    tokenize(`${c.title} ${c.text}`).forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1));
    return tf;
  });
  idf = new Map<string, number>();
  df.forEach((n, t) => idf!.set(t, Math.log((corpus!.length + 1) / (n + 1)) + 1));
  vectors = tokVectors.map((tf) => {
    const v = new Map<string, number>();
    tf.forEach((n, t) => v.set(t, (1 + Math.log(n)) * (idf!.get(t) || 1)));
    return v;
  });
}

function vectorize(text: string): Map<string, number> {
  if (!idf) buildIndex();
  const tf = new Map<string, number>();
  tokenize(text).forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
  const v = new Map<string, number>();
  tf.forEach((n, t) => v.set(t, (1 + Math.log(n)) * (idf!.get(t) || 1)));
  return v;
}

function cosineSparse(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  a.forEach((v, k) => { const bv = b.get(k); if (bv) dot += v * bv; });
  const norm = (m: Map<string, number>) => Math.sqrt(Array.from(m.values()).reduce((s, v) => s + v * v, 0));
  const denom = norm(a) * norm(b);
  return denom ? dot / denom : 0;
}

/** 查询扩展：把产业侧口语化表述映射到教育侧术语（跨域语义对齐词典） */
export function expandQuery(query: string): string {
  const extra: string[] = [];
  const aliasPairs: [string, string][] = [
    ...knowledgePoints.flatMap((k) => k.aliases.map((a): [string, string] => [a, k.name])),
    ...skills.flatMap((s) => s.aliases.map((a): [string, string] => [a, s.name])),
  ];
  aliasPairs.forEach(([alias, canonical]) => {
    if (query.includes(alias) || query.toLowerCase().includes(alias.toLowerCase())) extra.push(canonical);
  });
  return extra.length ? `${query} ${extra.join(' ')}` : query;
}

export function retrieve(query: string, topK = 5): RagHit[] {
  if (!corpus || !vectors) buildIndex();
  const q = vectorize(expandQuery(query));
  const scored = corpus!.map((c, i) => {
    let score = cosineSparse(q, vectors![i]);
    // 标题命中加权，提升结构化文档的召回质量
    if (c.title.includes(query) || query.includes(c.title.replace(/\s·.*/, ''))) score += 0.08;
    return { ...c, score: +score.toFixed(4) };
  });
  const hits = scored.sort((a, b) => b.score - a.score).filter((h) => h.score > 0.01).slice(0, topK);
  // 输出侧二次净化：即便历史语料被污染，注入片段也无法进入大模型上下文
  return hits.map((h) => {
    const clean = sanitizeUntrustedText(h.text);
    return clean === h.text ? h : { ...h, text: clean };
  });
}

/** 用户上传文档实时切片入库（多模态采集 → 知识库） */
export function ingestDocument(title: string, text: string, sourceType: RagChunk['sourceType'] = '用户上传'): number {
  if (!corpus || !vectors || !idf) buildIndex();
  // 兜底净化：任何调用方直接传入的原始文本都先清除指令型片段
  const safeText = sanitizeUntrustedText(text);
  const sentences = safeText.split(/(?<=[。；！？\n])|(?<=[.!?])\s+/).filter((s) => s.trim().length > 4 && !hasInjection(s));
  const chunks: RagChunk[] = [];
  let buf = '';
  sentences.forEach((s) => {
    if (buf.length + s.length > 200 && buf) {
      chunks.push({ id: `user-${Date.now()}-${chunks.length}`, source: `用户上传/${title}`, sourceType, title, text: buf.trim() });
      buf = '';
    }
    buf += s;
  });
  if (buf.trim()) chunks.push({ id: `user-${Date.now()}-${chunks.length}`, source: `用户上传/${title}`, sourceType, title, text: buf.trim() });
  if (!chunks.length) return 0;
  const remaining = Math.max(0, CORPUS_LIMIT - corpus!.length);
  if (!remaining) return 0;
  const accepted = chunks.slice(0, remaining);
  // 增量更新 IDF（简化：复用既有 IDF，新词按默认值参与计算）
  accepted.forEach((c) => {
    const v = vectorize(`${c.title} ${c.text}`);
    corpus!.push(c);
    vectors!.push(v);
  });
  return accepted.length;
}

export interface IngestAudit { accepted: number; rejected: number }

/**
 * 带审计的入库入口：按句检测并丢弃「间接提示词注入」内容，返回被拦截的句子数。
 * 供 /api/ingest 使用，前端可展示「已拦截 N 段可疑指令」作为 AI 安全举证。
 */
export function ingestDocumentGuarded(title: string, text: string, sourceType: RagChunk['sourceType'] = '用户上传'): IngestAudit {
  const sentences = text.split(/(?<=[。；！？\n])|(?<=[.!?])\s+/).filter((s) => s.trim().length > 4);
  let rejected = 0;
  const kept = sentences.filter((s) => {
    if (hasInjection(s)) { rejected += 1; return false; }
    return true;
  });
  return { accepted: ingestDocument(title, kept.join(''), sourceType), rejected };
}

export function corpusStats() {
  if (!corpus) buildIndex();
  const byType: Record<string, number> = {};
  corpus!.forEach((c) => { byType[c.sourceType] = (byType[c.sourceType] || 0) + 1; });
  return { total: corpus!.length, byType };
}
