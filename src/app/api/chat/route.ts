import { NextRequest } from 'next/server';
import { getLlmConfig, runLLMAgent } from '@/lib/ai/llm';
import { runLocalAgent } from '@/lib/ai/local-agent';
import { guardInput, sanitizeForLog } from '@/lib/ai/safety';
import { LIMITS, safeString, checkRateLimit, clientIp, rateLimitResponse } from '@/lib/validation';
import type { StreamEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // 该端点可能消耗大模型 token，必须限流（公网部署后的成本风险）
  const rl = checkRateLimit(`chat:${clientIp(req.headers)}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  let body: { query?: unknown; history?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: '请求体格式错误' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return Response.json({ error: '请求体格式错误' }, { status: 400 });

  const query = safeString(body.query, LIMITS.QUERY);
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-LIMITS.HISTORY_MAX)
    .filter((h): h is { role: string; content: string } => Boolean(h) && typeof h === 'object' && typeof (h as { content?: unknown }).content === 'string')
    .map((h) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: safeString(h.content, LIMITS.QUERY),
    }))
    .filter((h) => h.content.length > 0);
  if (!query) return Response.json({ error: '问题不能为空' }, { status: 400 });

  const guard = guardInput(query);
  const cfg = getLlmConfig();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 客户端断开（关标签页 / 刷新 / 切页面）后 controller 已关闭，此时任何
      // enqueue / close 都会抛 "Invalid state: Controller is already closed"。
      // 现场演示切页面很常见：这里统一软失败，且不在 catch 里二次 send 造成连环抛错。
      let closed = false;
      const send = (e: StreamEvent): boolean => {
        if (closed || req.signal.aborted) { closed = true; return false; }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
          return true;
        } catch {
          closed = true;
          return false;
        }
      };
      try {
        if (guard.level === 'block') {
          send({ type: 'safety', level: 'block', text: guard.text });
          send({ type: 'delta', text: '该请求已被内容安全策略拦截，请提出与产教融合诊断相关的问题。' });
          send({ type: 'done', mode: 'local' });
        } else if (cfg) {
          // 模型侧失败（401 / 429 重试耗尽 / 网络异常）时真正降级到本地确定性引擎，
          // 而不是只推一条错误事件就结束 —— 保证评审现场任何网络状况都能完整演示。
          let failed = false;
          for await (const e of runLLMAgent(guard.cleaned, history, cfg)) {
            if (e.type === 'error') failed = true;
            if (!send(e)) return;
          }
          if (failed) {
            if (!send({ type: 'step', agent: '容错智能体', stage: '服务降级', text: '模型服务暂不可用，已切换本地确定性引擎；诊断数值与证据不受影响' })) return;
            for await (const e of runLocalAgent(guard.cleaned, history)) if (!send(e)) return;
          }
        } else {
          for await (const e of runLocalAgent(guard.cleaned, history)) if (!send(e)) return;
        }
      } catch (err) {
        console.error('[puhe:chat]', sanitizeForLog((err as Error).message));
        if (send({ type: 'error', message: 'Agent 执行异常，已自动切换本地确定性引擎兜底' })) {
          try { for await (const e of runLocalAgent(guard.cleaned, history)) if (!send(e)) return; } catch { /* ignore */ }
        }
      } finally {
        closed = true;
        try { controller.close(); } catch { /* 客户端已断开，忽略 */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
