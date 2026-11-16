import { NextRequest } from 'next/server';
import { planPath, listJobs, listMajors, listKnowledgePoints } from '@/lib/pathway';
import { validMajor, validJob, validKnown, checkRateLimit, clientIp, rateLimitResponse, serverError } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const major = validMajor(req.nextUrl.searchParams.get('major'));
  return Response.json({ jobs: listJobs(), majors: listMajors(), knowledgePoints: listKnowledgePoints(major) });
}

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(`path:${clientIp(req.headers)}`, 60);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  try {
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body !== 'object') return Response.json({ error: '请求体格式错误' }, { status: 400 });
    const job = validJob(body.job);
    const major = validMajor(body.major);
    const known = validKnown(body.known);
    return Response.json(planPath(job, major, known));
  } catch (e) {
    return serverError('path', e);
  }
}
