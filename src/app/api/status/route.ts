import { getLlmConfig, getVisionConfig } from '@/lib/ai/llm';
import { PROVIDERS, MODELSCOPE_MODEL_CANDIDATES } from '@/lib/ai/providers';
import { corpusStats, CORPUS_LIMIT } from '@/lib/rag';
import { toolOverview } from '@/lib/ai/tools';
import { demoStats } from '@/lib/dataset';
import { dataIntegrityReport, LIMITS } from '@/lib/validation';
import { configSource, getRuntimeSettings } from '@/lib/ai/runtime-config';
import { publicOcrSettings } from '@/lib/ai/ocr';
import { MAJOR_SOURCES, MAJOR_GROUPS } from '@/lib/hot-majors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const llm = getLlmConfig();
  const vision = getVisionConfig();
  const tokenConfigured = Boolean(
    getRuntimeSettings()?.apiKey || process.env.MODELSCOPE_SDK_TOKEN?.trim() || process.env.AI_API_KEY?.trim(),
  );
  return Response.json({
    mode: llm ? 'llm' : 'local',
    configSource: configSource(),
    model: llm ? llm.model : 'local-deterministic-engine',
    // 只暴露服务商元信息，任何情况下都不返回密钥本体
    provider: llm ? {
      id: llm.provider, name: llm.providerName, baseUrl: llm.baseUrl,
      throttleProne: llm.throttleProne, configured: true,
    } : { id: 'local', name: '本地确定性引擎', configured: false },
    vision: Boolean(vision),
    // Xiaomi-OCR-0 文档解析通道（与 Copilot 文本模型相互独立）
    ocr: publicOcrSettings(),
    modelscope: {
      tokenConfigured,
      baseUrl: PROVIDERS.modelscope.baseUrl,
      tokenUrl: PROVIDERS.modelscope.tokenUrl,
      candidates: MODELSCOPE_MODEL_CANDIDATES,
      docs: 'https://www.modelscope.cn/docs/model-service/API-Inference/intro',
    },
    providers: Object.values(PROVIDERS).map((p) => ({ id: p.id, name: p.name, baseUrl: p.baseUrl, defaultModel: p.defaultModel })),
    tools: toolOverview,
    corpus: corpusStats(),
    dataset: demoStats,
    capabilities: [
      'multi-agent', 'rag', 'function-calling', 'mcp', 'multimodal', 'sse-stream', 'content-safety',
      'what-if-simulation', 'graph-shortest-path', 'deep-research', 'syllabus-generation', 'dual-theme',
      'hot-major-catalog', 'input-validation', 'rate-limiting', 'data-integrity-audit',
      'provider-preset', 'modelscope-api-inference', 'throttle-retry', 'reasoning-trace',
      'runtime-model-config', 'model-connectivity-test', 'xiaomi-ocr-0', 'ocr-to-rag',
      'discipline-taxonomy', 'auto-major-classification', 'law-discipline-expansion', 'major-scope-layer',
      'deep-link-auto-match', 'context-aware-analysis', 'score-trace', 'self-check', 'deliverable-export',
    ],
    endpoints: ['/api/chat', '/api/analyze', '/api/rag', '/api/ingest', '/api/mcp', '/api/simulate', '/api/path', '/api/research', '/api/syllabus', '/api/majors', '/api/status', '/api/models', '/api/models/test', '/api/ocr', '/api/trace', '/api/selfcheck', '/api/export'],
    integrity: dataIntegrityReport(),
    majorSources: MAJOR_SOURCES,
    majorGroups: MAJOR_GROUPS,
    limits: { query: LIMITS.QUERY, fileBytes: LIMITS.FILE_BYTES, textChars: LIMITS.TEXT, corpusLimit: CORPUS_LIMIT },
    note: llm
      ? `已接入 ${llm.providerName}：${llm.model}，Function Calling + RAG 全链路启用${llm.throttleProne ? '（429 自动退避）' : ''}${configSource() === 'runtime' ? '；配置来自「模型接入」页面' : ''}`
      : (process.env.DEMO_MODE === 'true' ? '已开启 DEMO_MODE，强制离线演示' : '未配置 SDK Token / AI_API_KEY，自动运行本地确定性引擎（功能完整，零 token 消耗）；可在「模型接入」页直接启用'),
  });
}
