import { NextRequest } from 'next/server';
import { buildTrace } from '@/lib/trace';
import { checkRateLimit, clientIp, rateLimitResponse, safeString, serverError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 数值溯源接口：?kind=match&a=专业&b=岗位 | ?kind=similarity&a=专业A&b=专业B | ?kind=gap&a=课程
 * 只读、无副作用，可用于答辩现场逐层拆解任意分数的计算过程。
 */
export async function GET(req: NextRequest) {
  const rl = checkRateLimit(`trace:${clientIp(req.headers)}`, 240);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  try {
    const kindParam = req.nextUrl.searchParams.get('kind') || 'match';
    const kind = kindParam === 'similarity' || kindParam === 'gap' ? kindParam : 'match';
    const a = safeString(req.nextUrl.searchParams.get('a'), 80);
    const b = safeString(req.nextUrl.searchParams.get('b'), 80, '');
    if (!a) return Response.json({ error: '缺少参数 a（专业 / 课程名）' }, { status: 400 });

    const payload = buildTrace(kind, a, b);
    if (!payload) {
      return Response.json({ error: `未找到可溯源的实体：${kind} / ${a}${b ? ` / ${b}` : ''}` }, { status: 404 });
    }
    return Response.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return serverError('trace', e);
  }
}
