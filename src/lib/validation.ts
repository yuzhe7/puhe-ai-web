/**
 * 统一输入校验 / 资源上限 / 轻量限流 / 数据完整性自检
 * --------------------------------------------------------------------------
 * 修复 v3 审计中发现的边界问题：
 *  - 所有外部可控字符串、数值、枚举、数组均先收敛到白名单与有限区间
 *  - 阻止 NaN / Infinity / 超大数组 / 未登记实体进入确定性算法（否则会产生 NaN 指标或崩溃）
 *  - 对会消耗大模型 token 的端点做单实例内存滑动窗口限流
 *  - 启动时可自检「专业→课程→知识点」「岗位→技能」引用完整性
 */
import { majors, courses, jobs, skills, knowledgePoints } from './dataset';
import type { Layer, Side } from './types';

export const LIMITS = {
  QUERY: 1200,
  RESEARCH_QUERY: 300,
  TITLE: 120,
  NAME: 60,
  TEXT: 200_000,
  FILE_BYTES: 5 * 1024 * 1024,
  IMAGE_BYTES: 4 * 1024 * 1024,
  KNOWN: 40,
  HOURS_MIN: 24,
  HOURS_MAX: 96,
  MODULES_MAX: 6,
  REMOVED_MAX: 4,
  BUDGET_MAX: 96,
  TOPK_MAX: 8,
  HISTORY_MAX: 8,
} as const;

const COURSE_NAMES = new Set(courses.map((c) => c.name));
const MAJOR_NAMES = new Set(majors.map((m) => m.name));
const JOB_NAMES = new Set(jobs.map((j) => j.title));
const SKILL_NAMES = new Set(skills.map((s) => s.name));
const KP_NAMES = new Set(knowledgePoints.map((k) => k.name));

export function safeString(v: unknown, max: number, fallback = ''): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim().slice(0, max);
  return s || fallback;
}

/** 拒绝 NaN / Infinity / 非有限数，避免污染下游计算产生 NaN 指标 */
export function safeNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v as T : fallback;
}

export function validMajor(v: unknown, fallback = '计算机科学与技术'): string {
  const s = safeString(v, LIMITS.NAME, fallback);
  return MAJOR_NAMES.has(s) ? s : fallback;
}
export function validJob(v: unknown, fallback = 'AI应用开发工程师'): string {
  const s = safeString(v, LIMITS.NAME, fallback);
  return JOB_NAMES.has(s) ? s : fallback;
}
export function validCourse(v: unknown, fallback = '数据结构'): string {
  const s = safeString(v, LIMITS.NAME, fallback);
  return COURSE_NAMES.has(s) ? s : fallback;
}
export function validLayer(v: unknown, fallback: Layer = 'macro'): Layer {
  return oneOf<Layer>(v, ['macro', 'meso', 'micro'], fallback);
}
export function validSides(v: unknown): Side[] {
  if (!Array.isArray(v)) return ['supply', 'demand'];
  const out = v.filter((x): x is Side => x === 'supply' || x === 'demand').slice(0, 2);
  return Array.from(new Set(out)).length ? Array.from(new Set(out)) : ['supply', 'demand'];
}

/** 只保留该专业实际开设的课程，并把学时收敛到合法区间 */
export function validHours(v: unknown, majorName: string): Record<string, number> {
  const scope = new Set(majors.find((m) => m.name === majorName)?.courses || []);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  Object.entries(v as Record<string, unknown>).slice(0, 100).forEach(([name, raw]) => {
    if (!scope.has(name) || !COURSE_NAMES.has(name)) return;
    out[name] = Math.round(safeNumber(raw, LIMITS.HOURS_MIN, LIMITS.HOURS_MAX, courses.find((c) => c.name === name)?.hours ?? 48));
  });
  return out;
}

/** 新增产业模块必须在技能表中登记，去重且限量 */
export function validModules(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && SKILL_NAMES.has(x)))).slice(0, LIMITS.MODULES_MAX);
}

/** 移除课程必须属于该专业，且不能把所有课程都删掉 */
export function validRemoved(v: unknown, majorName: string): string[] {
  const scope = new Set(majors.find((m) => m.name === majorName)?.courses || []);
  if (!Array.isArray(v)) return [];
  const picked = Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && scope.has(x)))).slice(0, LIMITS.REMOVED_MAX);
  return picked.length >= scope.size ? picked.slice(0, Math.max(0, scope.size - 1)) : picked;
}

/** 学生已掌握知识点必须是已登记实体 */
export function validKnown(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && KP_NAMES.has(x)))).slice(0, LIMITS.KNOWN);
}

/* --------------------------------------------------------------- 限流 */
interface Bucket { hits: number[] }
const buckets = new Map<string, Bucket>();
let lastPrune = Date.now();

export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : headers.get('x-real-ip') || 'local').trim().slice(0, 64);
}

/**
 * 单实例内存滑动窗口限流。说明：多实例 / Serverless 部署需换成 Redis 等共享存储，
 * 此实现用于本地评审环境与单机部署，避免公网部署后被无限刷 LLM token。
 */
export function checkRateLimit(key: string, limit = 30, windowMs = 60_000): { ok: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  if (now - lastPrune > windowMs) {
    lastPrune = now;
    buckets.forEach((b, k) => { if (!b.hits.length || now - b.hits[b.hits.length - 1] > windowMs) buckets.delete(k); });
    if (buckets.size > 5000) Array.from(buckets.keys()).slice(0, 2500).forEach((k) => buckets.delete(k));
  }
  const bucket = buckets.get(key) || { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((windowMs - (now - bucket.hits[0])) / 1000)) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, remaining: limit - bucket.hits.length, retryAfter: 0 };
}

export function rateLimitResponse(retryAfter: number) {
  return Response.json(
    { error: `请求过于频繁，请 ${retryAfter} 秒后重试`, code: 'RATE_LIMITED' },
    { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
  );
}

/**
 * 统一 500 响应（v3 审计修复：错误信息外泄）
 * 原始异常可能包含磁盘路径、依赖版本、内部配置与堆栈片段，不应回传给浏览器。
 * 服务端保留脱敏日志供排查，客户端只得到稳定的泛化文案与错误码。
 */
export function serverError(scope: string, err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  console.error(`[puhe:${scope}]`, raw.replace(/[\r\n]+/g, ' ').slice(0, 300));
  return Response.json(
    { error: '服务处理失败，请稍后重试', code: 'INTERNAL_ERROR' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

/* ------------------------------------------------- 数据完整性自检 */
export interface IntegrityIssue { level: 'error' | 'warn'; target: string; message: string }
export interface IntegrityReport {
  ok: boolean;
  checked: { majors: number; courses: number; knowledgePoints: number; jobs: number; skills: number };
  issues: IntegrityIssue[];
}

export function dataIntegrityReport(): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  const seenMajorIds = new Set<string>();
  majors.forEach((m) => {
    if (seenMajorIds.has(m.id)) issues.push({ level: 'error', target: m.name, message: `专业 id 重复：${m.id}` });
    seenMajorIds.add(m.id);
    if (!m.courses.length) issues.push({ level: 'error', target: m.name, message: '专业没有任何课程' });
    m.courses.forEach((cn) => {
      if (!COURSE_NAMES.has(cn)) issues.push({ level: 'error', target: m.name, message: `引用了不存在的课程「${cn}」` });
    });
  });
  courses.forEach((c) => {
    if (!c.knowledgePoints.length) issues.push({ level: 'warn', target: c.name, message: '课程没有知识点' });
    c.knowledgePoints.forEach((kn) => {
      if (!KP_NAMES.has(kn)) issues.push({ level: 'error', target: c.name, message: `引用了未登记的知识点「${kn}」` });
    });
  });
  jobs.forEach((j) => j.skills.forEach((sn) => {
    if (!SKILL_NAMES.has(sn)) issues.push({ level: 'error', target: j.title, message: `引用了不存在的技能「${sn}」` });
  }));
  const dupSkills = skills.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i);
  if (dupSkills.length) issues.push({ level: 'warn', target: '技能表', message: `存在重复技能名：${Array.from(new Set(dupSkills)).join('、')}` });
  return {
    ok: !issues.some((i) => i.level === 'error'),
    checked: { majors: majors.length, courses: courses.length, knowledgePoints: knowledgePoints.length, jobs: jobs.length, skills: skills.length },
    issues,
  };
}
