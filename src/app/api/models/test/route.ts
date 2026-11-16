/**
 * 模型连通性自检：发一条极短的非流式请求，验证密钥 / 端点 / 模型 ID 是否可用。
 * 只回传分类结果与模型回复片段，绝不回传上游响应体、请求头或异常原文。
 */
import { NextRequest } from 'next/server';
import { getLlmConfig } from '@/lib/ai/llm';
import { validateSettings } from '@/lib/ai/runtime-config';
import { checkRateLimit, clientIp, rateLimitResponse, serverError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

interface Target { apiKey: string; baseUrl: string; model: string }

function assertEndpoint(baseUrl: string): string | null {
  let url: URL;
  try { url = new URL(baseUrl); } catch { return 'Base URL 不是合法 URL'; }
  if (url.username || url.password || url.search || url.hash) return 'Base URL 不允许携带账号密码或查询参数';
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (url.protocol === 'http:' && !loopback) return '自定义端点必须使用 https';
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '仅支持 http / https 协议';
  return null;
}

function classify(status: number): string {
  if (status === 401 || status === 403) return '密钥无效，或该密钥无权访问此模型';
  if (status === 404) return '端点或模型 ID 不存在，请检查 Base URL 与模型 ID';
  if (status === 429) return '触发上游限流（免费额度常见），稍后重试即可';
  if (status === 400) return '请求被拒绝，请检查模型 ID 与接口协议是否 OpenAI 兼容';
  if (status >= 500) return '上游模型服务暂时不可用';
  return `上游返回 HTTP ${status}`;
}

export async function POST(req: NextRequest) {
  // 连通性测试会消耗少量 token，限流比普通配置更严格
  const rl = checkRateLimit(`models-test:${clientIp(req.headers)}`, 5, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  try {
    const text = await req.text();
    if (text.length > 4096) return Response.json({ ok: false, error: '请求体过大' }, { status: 413, headers: NO_STORE });
    const body = JSON.parse(text || '{}') as Record<string, unknown>;

    let target: Target;
    if (body.useCurrent === true) {
      const cfg = getLlmConfig();
      if (!cfg) return Response.json({ ok: false, error: '当前没有已启用的模型配置，请先保存或改用表单测试' }, { status: 400, headers: NO_STORE });
      target = { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model };
    } else {
      const valid = validateSettings(body);
      if (!valid.ok || !valid.value) return Response.json({ ok: false, error: valid.error || '配置校验失败' }, { status: 400, headers: NO_STORE });
      target = { apiKey: valid.value.apiKey, baseUrl: valid.value.baseUrl, model: valid.value.model };
    }

    const endpointError = assertEndpoint(target.baseUrl);
    if (endpointError) return Response.json({ ok: false, error: endpointError }, { status: 400, headers: NO_STORE });

    const started = Date.now();
    let res: globalThis.Response;
    try {
      res = await fetch(`${target.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${target.apiKey}` },
        body: JSON.stringify({
          model: target.model,
          messages: [{ role: 'user', content: '请只回复 OK，不要解释。' }],
          temperature: 0,
          max_tokens: 16,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const timeout = /timeout|abort/i.test(msg);
      return Response.json({
        ok: false,
        error: timeout ? '连接超时（15 秒），请检查网络或端点可达性' : '网络不可达或 DNS 解析失败',
        latencyMs: Date.now() - started,
      }, { headers: NO_STORE });
    }

    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return Response.json({ ok: false, error: classify(res.status), latencyMs }, { headers: NO_STORE });
    }
    let reply = '';
    try {
      const data = await res.json() as { choices?: { message?: { content?: string; reasoning_content?: string } }[] };
      reply = (data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || '').trim().slice(0, 60);
    } catch { /* 端点可达但返回非标准 JSON，仍视为连通 */ }
    return Response.json({ ok: true, latencyMs, model: target.model, reply }, { headers: NO_STORE });
  } catch (e) {
    return serverError('models-test', e);
  }
}
