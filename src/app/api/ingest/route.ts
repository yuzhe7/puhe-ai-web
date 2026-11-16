import { NextRequest } from 'next/server';
import { ingestDocumentGuarded, corpusStats } from '@/lib/rag';
import { getVisionConfig, visionExtract } from '@/lib/ai/llm';
import {
  LIMITS, safeString, checkRateLimit, clientIp, rateLimitResponse, serverError,
} from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 多模态文档接入：TXT/MD/CSV/JSON 直读、DOCX(mammoth)、PDF(unpdf)、图片(视觉大模型) */
async function extractText(file: File): Promise<{ text: string; channel: string; note?: string }> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (/\.(txt|md|csv|json|html?|log)$/.test(name)) {
    const text = new TextDecoder('utf-8').decode(buffer);
    // 二进制文件伪装成 .txt 时会产生大量 U+FFFD，拒绝入库避免污染向量索引
    const bad = (text.match(/\uFFFD/g) || []).length;
    if (text.length && bad / text.length > 0.02) {
      return { text: '', channel: '文本直读失败', note: '检测到二进制内容，请上传纯文本/文档格式' };
    }
    return { text, channel: '文本直读' };
  }
  if (name.endsWith('.docx')) {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      return { text: result.value, channel: 'DOCX 结构化解析 (mammoth)' };
    } catch (e) {
      return { text: '', channel: 'DOCX 解析失败', note: (e as Error).message };
    }
  }
  if (name.endsWith('.pdf')) {
    try {
      const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await pdfText(pdf, { mergePages: true });
      return { text: Array.isArray(result.text) ? result.text.join('\n') : result.text, channel: 'PDF 文本层抽取 (unpdf)' };
    } catch (e) {
      return { text: '', channel: 'PDF 解析失败', note: `${(e as Error).message}；扫描版 PDF 请改用「图片上传」走视觉模型通道` };
    }
  }
  if (/\.(png|jpe?g|webp|gif|bmp)$/.test(name)) {
    const cfg = getVisionConfig();
    const mime = file.type || 'image/png';
    const dataUrl = `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
    if (!cfg) {
      return {
        text: '',
        channel: '视觉模型未配置（演示模式）',
        note: '已接收图片。配置 VISION_API_KEY / VISION_MODEL 后将由多模态模型自动抽取岗位名称与技能要求；当前可切换到「粘贴文本」通道完成入库。',
      };
    }
    try {
      const text = await visionExtract(dataUrl, cfg);
      return { text, channel: `多模态视觉理解 (${cfg.model})` };
    } catch (e) {
      return { text: '', channel: '视觉模型调用失败', note: (e as Error).message };
    }
  }
  return { text: '', channel: '不支持的格式', note: '支持 TXT/MD/CSV/JSON/DOCX/PDF/图片' };
}

export async function POST(req: NextRequest) {
  // 上传会写入全局内存语料库，必须限流 + 限制单请求体积
  const rl = checkRateLimit(`ingest:${clientIp(req.headers)}`, 20);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > LIMITS.FILE_BYTES + 64 * 1024) {
    return Response.json({ error: `请求体超过 ${Math.round(LIMITS.FILE_BYTES / 1024 / 1024)}MB 上限` }, { status: 413 });
  }

  // 非 multipart 请求直接给出明确的 4xx，避免框架异常冒泡成 500
  const contentType = req.headers.get('content-type') || '';
  if (!/multipart\/form-data|application\/x-www-form-urlencoded/i.test(contentType)) {
    return Response.json(
      { error: '请使用 multipart/form-data 上传文件或粘贴文本', code: 'UNSUPPORTED_MEDIA_TYPE' },
      { status: 415 },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    const pasted = safeString(form.get('text'), LIMITS.TEXT);
    const title = safeString(form.get('title'), LIMITS.TITLE, '未命名文档');

    if (pasted.length > 10) {
      const audit = ingestDocumentGuarded(title, pasted);
      return Response.json({
        ok: true, channel: '粘贴文本', chars: pasted.length, chunks: audit.accepted,
        blockedSentences: audit.rejected, stats: corpusStats(),
      });
    }
    if (!(file instanceof File)) return Response.json({ error: '未收到文件或文本' }, { status: 400 });
    if (file.size > LIMITS.FILE_BYTES) {
      return Response.json({ error: `文件超过 ${Math.round(LIMITS.FILE_BYTES / 1024 / 1024)}MB 上限` }, { status: 413 });
    }
    if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name) && file.size > LIMITS.IMAGE_BYTES) {
      return Response.json({ error: `图片超过 ${Math.round(LIMITS.IMAGE_BYTES / 1024 / 1024)}MB 上限` }, { status: 413 });
    }
    if (!/\.(txt|md|csv|json|html?|log|docx|pdf|png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
      return Response.json({ error: '不支持的文件格式', note: '支持 TXT/MD/CSV/JSON/DOCX/PDF/图片' }, { status: 400 });
    }

    const result = await extractText(file);
    if (!result.text.trim()) {
      return Response.json({ ok: false, channel: result.channel, note: result.note || '未抽取到文本', chunks: 0, stats: corpusStats() });
    }
    const clean = result.text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITS.TEXT);
    const audit = ingestDocumentGuarded(safeString(file.name, LIMITS.TITLE, '上传文档'), clean);
    return Response.json({
      ok: true, channel: result.channel, filename: safeString(file.name, LIMITS.TITLE), size: file.size,
      chars: clean.length, chunks: audit.accepted, blockedSentences: audit.rejected,
      preview: clean.slice(0, 320), note: result.note, stats: corpusStats(),
    });
  } catch (e) {
    return serverError('ingest', e);
  }
}
