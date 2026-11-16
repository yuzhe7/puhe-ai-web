import { NextRequest } from 'next/server';
import { EVAL_CASES, runAllEval, runEvalCase } from '@/lib/eval';
import { checkRateLimit, clientIp, rateLimitResponse, safeString, serverError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Agent 评测接口。
 *  ?list=1         → 返回用例清单（不含执行结果）
 *  ?case=<id>      → 执行单条用例（页面按条调用，可显示实时进度）
 *  无参数          → 顺序执行全部用例并返回汇总（供 CI / 验收脚本）
 */
export async function GET(req: NextRequest) {
  const rl = checkRateLimit(`eval:${clientIp(req.headers)}`, 120, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  try {
    const q = req.nextUrl.searchParams;
    if (q.get('list') === '1') {
      return Response.json({
        total: EVAL_CASES.length,
        cases: EVAL_CASES.map((c) => ({
          id: c.id, category: c.category, question: c.question,
          expectAny: c.expectAny ?? [], expectBlocked: Boolean(c.expectBlocked), expectWarn: Boolean(c.expectWarn),
          note: c.note ?? '',
        })),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const id = safeString(q.get('case'), 32);
    if (id) {
      const c = EVAL_CASES.find((x) => x.id === id);
      if (!c) return Response.json({ error: `未找到用例：${id}` }, { status: 404 });
      const result = await runEvalCase(c);
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { results, summary } = await runAllEval();
    return Response.json({ results, summary }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return serverError('eval', e);
  }
}
