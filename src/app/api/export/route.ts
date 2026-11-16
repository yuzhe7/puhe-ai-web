import { NextRequest } from 'next/server';
import { buildCourseMatrixCsv, buildMatchCsv } from '@/lib/export';
import { majors } from '@/lib/dataset';
import { checkRateLimit, clientIp, rateLimitResponse, safeString, serverError } from '@/lib/validation';
import type { SimPlan } from '@/lib/simulator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ExportType = 'course' | 'match';

function resolve(name: string | null | undefined, fallback: string): string {
  const v = safeString(name, 60);
  return majors.some((m) => m.name === v) ? v : fallback;
}

function respond(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // 中文文件名走 RFC 5987，另加 ASCII 兜底名兼容老客户端
      'Content-Disposition': `attachment; filename="puhe-export.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}

/** GET：基线导出（不带改革方案），便于直接分享链接与 curl 校验 */
export async function GET(req: NextRequest) {
  const rl = checkRateLimit(`export:${clientIp(req.headers)}`, 60, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  try {
    const q = req.nextUrl.searchParams;
    const type: ExportType = q.get('type') === 'match' ? 'match' : 'course';
    const major = resolve(q.get('major'), '计算机科学与技术');
    const job = safeString(q.get('job'), 60) || undefined;
    const out = type === 'match' ? buildMatchCsv(major, job) : buildCourseMatrixCsv(major, job);
    if (!out) return Response.json({ error: '导出内容为空，请检查专业名称' }, { status: 404 });
    return respond(out.csv, out.filename);
  } catch (e) {
    return serverError('export', e);
  }
}

/**
 * POST：带沙盘方案导出（改革后学时）。
 * body: { type?: 'course'|'match', major: string, job?: string, plan?: Partial<SimPlan> }
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(`export:${clientIp(req.headers)}`, 60, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const type: ExportType = body.type === 'match' ? 'match' : 'course';
    const major = resolve(typeof body.major === 'string' ? body.major : null, '计算机科学与技术');
    const job = typeof body.job === 'string' ? safeString(body.job, 60) : undefined;

    // plan 只接受白名单字段，学时限制在 0–400，防止构造异常数据
    const rawPlan = body.plan && typeof body.plan === 'object' ? (body.plan as Record<string, unknown>) : null;
    const plan: Partial<SimPlan> | undefined = rawPlan ? {
      hours: rawPlan.hours && typeof rawPlan.hours === 'object'
        ? Object.fromEntries(Object.entries(rawPlan.hours as Record<string, unknown>)
          .filter(([k, v]) => typeof k === 'string' && typeof v === 'number' && Number.isFinite(v))
          .map(([k, v]) => [k, Math.max(0, Math.min(400, Math.round(v as number)))])
          .slice(0, 64))
        : undefined,
      modules: Array.isArray(rawPlan.modules)
        ? rawPlan.modules.filter((m): m is string => typeof m === 'string').slice(0, 24)
        : undefined,
      removed: Array.isArray(rawPlan.removed)
        ? rawPlan.removed.filter((m): m is string => typeof m === 'string').slice(0, 24)
        : undefined,
    } : undefined;

    const out = type === 'match' ? buildMatchCsv(major, job) : buildCourseMatrixCsv(major, job, plan);
    if (!out) return Response.json({ error: '导出内容为空，请检查专业名称' }, { status: 404 });
    return respond(out.csv, out.filename);
  } catch (e) {
    return serverError('export', e);
  }
}
