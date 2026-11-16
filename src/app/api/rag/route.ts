import { NextRequest } from 'next/server';
import { retrieve, corpusStats, expandQuery } from '@/lib/rag';
import { LIMITS, safeString, safeNumber, checkRateLimit, clientIp, rateLimitResponse, serverError } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(`rag:${clientIp(req.headers)}`, 120);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  try {
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body !== 'object') return Response.json({ error: '请求体格式错误' }, { status: 400 });
    const query = safeString(body.query, LIMITS.QUERY);
    if (!query) return Response.json({ error: 'query 不能为空' }, { status: 400 });
    const topK = Math.round(safeNumber(body.topK, 1, LIMITS.TOPK_MAX, 5));
    const expanded = expandQuery(query);
    const hits = retrieve(query, topK);
    return Response.json({ query, expanded: expanded !== query ? expanded : null, stats: corpusStats(), hits });
  } catch (e) {
    return serverError('rag', e);
  }
}
