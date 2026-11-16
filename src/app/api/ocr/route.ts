/**
 * Xiaomi-OCR-0 文档解析接口
 * --------------------------------------------------------------------------
 * GET                 查看当前配置、三类任务模板、官方部署预设与安全说明
 * POST action=save    校验并启用本地 OCR 端点（密钥只存服务端内存）
 * POST action=test    连通性自检（探测 /models，回落极短 chat 请求）
 * POST action=parse   单张图片 → Markdown / KIE JSON / VQA 文本
 * POST action=ingest  复核后的文本 → 注入防护 → RAG 语料
 * POST/DELETE clear   清除网页配置，回落到 .env 或未启用状态
 *
 * 与 /api/ingest 的分工：/api/ingest 负责「文件直传」；这里负责「OCR 结果人工复核后入库」，
 * 两者最终都走 ingestDocumentGuarded，保证间接提示词注入拦截一致。
 */
import { NextRequest } from 'next/server';
import {
  publicOcrSettings, validateOcrSettings, setRuntimeOcrSettings, clearRuntimeOcrSettings,
  getOcrConfig, ocrHealthCheck, ocrParse, ocrCatalog,
} from '@/lib/ai/ocr';
import type { OcrSettings } from '@/lib/ai/ocr';
import { ingestDocumentGuarded, corpusStats } from '@/lib/rag';
import {
  LIMITS, safeString, checkRateLimit, clientIp, rateLimitResponse, serverError,
} from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
/** 4MB 图片的 base64 约 5.6MB，留一点 JSON 结构体余量 */
const MAX_BODY = 8 * 1024 * 1024;
const ACTIONS = ['save', 'test', 'parse', 'ingest', 'clear'] as const;
type Action = typeof ACTIONS[number];

export async function GET() {
  return Response.json({
    current: publicOcrSettings(),
    ...ocrCatalog(),
    corpus: corpusStats(),
  }, { headers: NO_STORE });
}

async function readBody(req: NextRequest): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    return { ok: false, response: Response.json({ error: '请求体超过 8MB 上限，请压缩图片后重试' }, { status: 413, headers: NO_STORE }) };
  }
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) {
      return { ok: false, response: Response.json({ error: '请求体超过 8MB 上限，请压缩图片后重试' }, { status: 413, headers: NO_STORE }) };
    }
    const value = JSON.parse(text || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, response: Response.json({ error: '请求体必须是 JSON 对象' }, { status: 400, headers: NO_STORE }) };
    }
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, response: Response.json({ error: '请求体不是合法 JSON' }, { status: 400, headers: NO_STORE }) };
  }
}

function demoBlocked(): Response | null {
  if (process.env.DEMO_MODE !== 'true') return null;
  return Response.json(
    { error: '已开启 DEMO_MODE 强制离线演示，OCR 通道不可用；关闭后即可启用本地推理端点' },
    { status: 400, headers: NO_STORE },
  );
}

function actionTarget(action: Action): string {
  if (action === 'parse') return 'ocr-parse';
  if (action === 'ingest') return 'ocr-ingest';
  if (action === 'test') return 'ocr-test';
  return 'ocr-config';
}

function actionLimit(action: Action): number {
  if (action === 'parse' || action === 'ingest') return 20;
  if (action === 'test') return 8;
  return 10;
}

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  if (!body.ok) return body.response;
  const rawAction = safeString(body.value.action, 20, 'parse');
  const action: Action = (ACTIONS as readonly string[]).includes(rawAction) ? rawAction as Action : 'parse';

  const rl = checkRateLimit(`${actionTarget(action)}:${clientIp(req.headers)}`, actionLimit(action), 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    if (action === 'clear') {
      clearRuntimeOcrSettings();
      return Response.json({ ok: true, current: publicOcrSettings(), corpus: corpusStats() }, { headers: NO_STORE });
    }
    const blocked = demoBlocked();
    if (blocked) return blocked;

    if (action === 'save') {
      const valid = validateOcrSettings(body.value);
      if (!valid.ok || !valid.value) {
        return Response.json({ ok: false, error: valid.error || '配置校验失败' }, { status: 400, headers: NO_STORE });
      }
      setRuntimeOcrSettings(valid.value);
      return Response.json({ ok: true, current: publicOcrSettings() }, { headers: NO_STORE });
    }

    if (action === 'test') {
      let target: Omit<OcrSettings, 'updatedAt'>;
      if (body.value.useCurrent === true) {
        const cfg = getOcrConfig();
        if (!cfg) {
          return Response.json({ ok: false, error: '当前没有已启用的 OCR 配置，请先保存表单或改用表单测试' }, { status: 400, headers: NO_STORE });
        }
        target = cfg;
      } else {
        const valid = validateOcrSettings(body.value);
        if (!valid.ok || !valid.value) {
          return Response.json({ ok: false, error: valid.error || '配置校验失败' }, { status: 400, headers: NO_STORE });
        }
        target = valid.value;
      }
      const result = await ocrHealthCheck(target);
      return Response.json(result, { headers: NO_STORE });
    }

    if (action === 'parse') {
      const image = typeof body.value.image === 'string' ? body.value.image : '';
      if (!image) return Response.json({ error: '未收到图片数据' }, { status: 400, headers: NO_STORE });
      if (!getOcrConfig()) {
        return Response.json({ error: '尚未启用 Xiaomi-OCR-0，请先在右侧配置并保存推理端点' }, { status: 400, headers: NO_STORE });
      }
      const taskRaw = safeString(body.value.task, 12, 'parse');
      const task = (['parse', 'kie', 'vqa'] as const).includes(taskRaw as 'parse' | 'kie' | 'vqa')
        ? taskRaw as 'parse' | 'kie' | 'vqa' : 'parse';
      try {
        const result = await ocrParse(image, {
          task,
          fields: safeString(body.value.fields, 500),
          question: safeString(body.value.question, 500),
          customPrompt: safeString(body.value.customPrompt, 2000),
        });
        return Response.json({ ok: true, ...result }, { headers: NO_STORE });
      } catch (e) {
        // ocrParse 抛出的都是经过分类的中文提示，不含上游响应体 / 密钥 / 内网路径
        const msg = e instanceof Error ? e.message : 'OCR 解析失败';
        return Response.json({ ok: false, error: msg.slice(0, 300) }, { status: 400, headers: NO_STORE });
      }
    }

    // action === 'ingest'：OCR 文本是不可信输入，交给 rag.ts 逐句拦截注入
    const text = safeString(body.value.text, LIMITS.TEXT);
    if (text.length < 10) {
      return Response.json({ ok: false, error: '可入库文本至少需要 10 个字符' }, { status: 400, headers: NO_STORE });
    }
    const title = safeString(body.value.title, LIMITS.TITLE, 'Xiaomi-OCR-0 解析文档');
    const audit = ingestDocumentGuarded(title, text);
    return Response.json({
      ok: true, title, chars: text.length,
      chunks: audit.accepted, blockedSentences: audit.rejected, stats: corpusStats(),
    }, { headers: NO_STORE });
  } catch (e) {
    return serverError('ocr', e);
  }
}

export async function DELETE(req: NextRequest) {
  const rl = checkRateLimit(`ocr-config:${clientIp(req.headers)}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  try {
    clearRuntimeOcrSettings();
    return Response.json({ ok: true, current: publicOcrSettings(), corpus: corpusStats() }, { headers: NO_STORE });
  } catch (e) {
    return serverError('ocr-clear', e);
  }
}
