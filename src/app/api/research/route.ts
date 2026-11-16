import { NextRequest } from 'next/server';
import { runResearch } from '@/lib/ai/research';
import type { ResearchEvent } from '@/lib/ai/research';
import { LIMITS, safeString, checkRateLimit, clientIp, rateLimitResponse } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // 深度研究会触发多次检索与（可选）大模型综合，同样需要限流
  const rl = checkRateLimit(`research:${clientIp(req.headers)}`, 12, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  let body: { query?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: '请求体格式错误' }, { status: 400 }); }
  const query = safeString(body?.query, LIMITS.RESEARCH_QUERY);
  if (!query) return Response.json({ error: '研究问题不能为空' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ResearchEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        for await (const e of runResearch(query)) send(e);
      } catch (err) {
        // 异常详情只写服务端日志，SSE 回传稳定文案，避免泄漏内部路径与上游错误
        console.error('[puhe:research]', String((err as Error).message).replace(/[\r\n]+/g, ' ').slice(0, 300));
        send({ type: 'error', message: '研究流程异常，已安全终止并保留已获取的证据' });
        send({ type: 'done', confidence: 0, sources: 0, toolCalls: 0, durationMs: 0, mode: 'local' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
