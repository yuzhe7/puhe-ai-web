/**
 * 网页端大模型接入配置（GET 查看 / POST 启用 / DELETE 恢复本地引擎）
 * 密钥只存在于服务端进程内存，响应体只含脱敏值。
 */
import { NextRequest } from 'next/server';
import { getLlmConfig, getVisionConfig } from '@/lib/ai/llm';
import { PROVIDERS, MODELSCOPE_MODEL_CANDIDATES, RECOMMENDED_MODELS } from '@/lib/ai/providers';
import {
  getRuntimeSettings, setRuntimeSettings, clearRuntimeSettings,
  validateSettings, publicSettings,
} from '@/lib/ai/runtime-config';
import { checkRateLimit, clientIp, rateLimitResponse, serverError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

function snapshot() {
  const llm = getLlmConfig();
  const vision = getVisionConfig();
  return {
    current: publicSettings(),
    status: {
      mode: llm ? 'llm' : 'local',
      model: llm ? llm.model : 'local-deterministic-engine',
      provider: llm ? { id: llm.provider, name: llm.providerName, baseUrl: llm.baseUrl } : null,
      vision: Boolean(vision),
    },
  };
}

function catalog() {
  return {
    providers: Object.values(PROVIDERS).map((p) => ({
      id: p.id, name: p.name, baseUrl: p.baseUrl, defaultModel: p.defaultModel,
      tokenUrl: p.tokenUrl || null, note: p.note, throttleProne: p.throttleProne,
    })),
    modelscopeCandidates: MODELSCOPE_MODEL_CANDIDATES,
    recommendedModels: RECOMMENDED_MODELS,
    links: {
      modelscopeToken: 'https://modelscope.cn/my/myaccesstoken',
      modelscopeDocs: 'https://www.modelscope.cn/docs/model-service/API-Inference/intro',
      checkCommand: 'npm run check:modelscope',
    },
    security: [
      '密钥仅保存在当前服务端进程内存，不写磁盘、不入库、不进浏览器存储',
      '所有响应只返回脱敏密钥（前 3 后 2），任何接口都不会回传密钥本体',
      '服务重启 / 容器重启后自动清空，回落到 .env 或本地确定性引擎',
      '自定义端点必须 https（仅本机网关允许 http），并拦截账号密码 / 查询参数等 SSRF 风险',
      '生产或创空间部署请改用 .env.local / 平台 Secrets，网页配置仅用于本地演示与现场调试',
    ],
  };
}

export async function GET() {
  return Response.json({ ...snapshot(), ...catalog() }, { headers: NO_STORE });
}

async function parseBody(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  try {
    const text = await req.text();
    if (text.length > 4096) {
      return { ok: false, response: Response.json({ error: '请求体过大' }, { status: 413, headers: NO_STORE }) };
    }
    return { ok: true, value: JSON.parse(text || '{}') };
  } catch {
    return { ok: false, response: Response.json({ error: '请求体不是合法 JSON' }, { status: 400, headers: NO_STORE }) };
  }
}

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(`models:${clientIp(req.headers)}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  try {
    if (process.env.DEMO_MODE === 'true') {
      return Response.json({ error: '当前已开启 DEMO_MODE 强制离线演示，请先关闭后再启用模型' }, { status: 400, headers: NO_STORE });
    }
    const parsed = await parseBody(req);
    if (!parsed.ok) return parsed.response;
    // 只换模型 / Base URL 时允许留空 API Key，沿用同一进程内已保存的密钥
    const raw = (parsed.value && typeof parsed.value === 'object')
      ? { ...(parsed.value as Record<string, unknown>) }
      : {};
    if (typeof raw.apiKey !== 'string' || !raw.apiKey.trim()) {
      const existing = getRuntimeSettings();
      if (existing?.apiKey) raw.apiKey = existing.apiKey;
    }
    const valid = validateSettings(raw);
    if (!valid.ok || !valid.value) {
      return Response.json({ error: valid.error || '配置校验失败' }, { status: 400, headers: NO_STORE });
    }
    setRuntimeSettings(valid.value);
    return Response.json({ ok: true, ...snapshot() }, { headers: NO_STORE });
  } catch (e) {
    return serverError('models-save', e);
  }
}

export async function DELETE(req: NextRequest) {
  const rl = checkRateLimit(`models:${clientIp(req.headers)}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  try {
    clearRuntimeSettings();
    return Response.json({ ok: true, ...snapshot() }, { headers: NO_STORE });
  } catch (e) {
    return serverError('models-clear', e);
  }
}
