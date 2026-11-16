import { NextRequest } from 'next/server';
import { runSelfCheck } from '@/lib/selfcheck';
import { checkRateLimit, clientIp, rateLimitResponse, serverError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 系统自检：返回逐项断言结果，供 /health 页与外部验收脚本调用。
 * 全部通过返回 200，存在失败项返回 503（便于 CI / 验收脚本用状态码判定）。
 */
export async function GET(req: NextRequest) {
  const rl = checkRateLimit(`selfcheck:${clientIp(req.headers)}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  try {
    const report = runSelfCheck();
    return Response.json(report, {
      status: report.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return serverError('selfcheck', e);
  }
}
