/**
 * Xiaomi-OCR-0 轻量直连通道（服务端专用）
 * --------------------------------------------------------------------------
 * 定位：把本地部署的 Xiaomi-OCR-0（0.8B 文档理解模型）接成平台的「文档采集通道」，
 * 而不是 Copilot 的文本对话模型。项目里的典型用法是：
 *
 *   培养方案 / 课程大纲 / 招聘 JD 截图或扫描件
 *     → /api/ocr 图片解析（整页 Markdown / KIE JSON / VQA）
 *     → 人工复核修正
 *     → ingestDocumentGuarded 净化后入 RAG 语料
 *     → Copilot、Deep Research、诊断工作台检索到新证据
 *
 * 官方部署事实（2026-11 核实，见 docs/10）：
 *  - 原始权重 SeerRay-Lab/Xiaomi-OCR-0，经 SGLang / vLLM 暴露 OpenAI 兼容端点
 *    http://127.0.0.1:8000/v1；Ollama 为实验性社区 BF16 包
 *    longwayxu/xiaomi-ocr-0:bf16，端点 http://127.0.0.1:11434/v1。
 *  - 统一 image–instruction–response 接口，三类任务共用同一模型：
 *    文档解析（Markdown / OTSL 表格 / LaTeX 公式）、KIE（JSON 字段）、VQA（简洁回答）。
 *
 * 与官方 MCP 管线的边界（必须在 UI 与文档如实说明）：
 *  官方 MCP 还负责 PP-DocLayoutV3 区域切分、多 PDF 页预处理、OTSL→HTML 表格转换
 *  与组装；本通道是「单张图片 → 一次 /chat/completions」的轻量直连，不实现这些后处理。
 *  因此输出结果保留模型原始 OTSL 标记，页面会给出提示，适合评审演示与小批量采集。
 *
 * 安全约定与 runtime-config.ts 一致：密钥只存当前进程内存、响应只回传脱敏值、
 * 外部端点强制 https、仅 loopback 允许 http；OCR 文本属于不可信输入，入库必须走
 * ingestDocumentGuarded 的间接提示词注入拦截。
 */
import { maskToken } from './providers';
import { LIMITS } from '../validation';

export type OcrTask = 'parse' | 'kie' | 'vqa';
export type OcrPresetId = 'vllm' | 'ollama' | 'custom';

export interface OcrPreset {
  id: OcrPresetId;
  name: string;
  baseUrl: string;
  model: string;
  note: string;
  command: string;
  experimental: boolean;
}

/** 与官方仓库 README / skills/xiaomi-ocr/SKILL.md 对齐的三条部署路线 */
export const OCR_PRESETS: readonly OcrPreset[] = [
  {
    id: 'vllm',
    name: 'SGLang / vLLM · 官方权重',
    baseUrl: 'http://127.0.0.1:8000/v1',
    model: 'SeerRay-Lab/Xiaomi-OCR-0',
    note: '精度优先。需要兼容 Qwen3_5ForConditionalGeneration 的运行时与 GPU，首启会下载约 0.8B 权重。',
    command: 'vllm serve SeerRay-Lab/Xiaomi-OCR-0 --host 127.0.0.1 --port 8000 --trust-remote-code --max-model-len 16384\n# 或：python -m sglang.launch_server --model-path SeerRay-Lab/Xiaomi-OCR-0 --host 127.0.0.1 --port 8000 --context-length 16384',
    experimental: false,
  },
  {
    id: 'ollama',
    name: 'Ollama · 社区 BF16（实验性）',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'longwayxu/xiaomi-ocr-0:bf16',
    note: '约 1.8GB，CPU / 桌面机可跑。社区转换版与官方 HF 权重不是数值等价，官方标注为实验性。',
    command: 'ollama pull longwayxu/xiaomi-ocr-0:bf16',
    experimental: true,
  },
  {
    id: 'custom',
    name: '自定义 OpenAI 兼容端点',
    baseUrl: '',
    model: '',
    note: '任意实现 /chat/completions + image_url 的网关；外部地址必须 https，本机网关可用 http。',
    command: '',
    experimental: false,
  },
];

export interface OcrTaskSpec {
  id: OcrTask;
  name: string;
  desc: string;
  output: string;
  prompt: string;
}

/** 官方 Transformers 示例中的整页解析指令，逐字保留以保证与官方输出格式一致 */
export const OFFICIAL_PARSE_PROMPT = 'Extract all information from the main body of the document image and represent it in markdown format, ignoring headers and footers. Tables should be expressed in OTSL format, formulas in the document should be represented using LATEX format, and the parsing should be organized according to the reading order.';

const KIE_WITH_FIELDS = 'Extract the following key information from this document image and return ONE valid JSON object only. Keys: {FIELDS}. Use null for values not visible in the image, never invent content, and do not wrap the JSON in markdown fences.';
const KIE_GENERAL = 'Extract all key-value information from this document image and return ONE valid JSON object only. Do not invent content and do not wrap the JSON in markdown fences.';
const VQA_TEMPLATE = 'Answer the question about this document image concisely, using only information visible in the image. Do not add unsupported detail; if the answer is not visible, say it is not visible. Question: {QUESTION}';

export const OCR_TASKS: readonly OcrTaskSpec[] = [
  {
    id: 'parse',
    name: '整页文档解析',
    desc: '按阅读顺序输出 Markdown；表格为 OTSL、公式为 LaTeX，适合培养方案 / 课程大纲扫描件。',
    output: 'Markdown 文本',
    prompt: OFFICIAL_PARSE_PROMPT,
  },
  {
    id: 'kie',
    name: '关键信息抽取 KIE',
    desc: '指定字段名，返回单个 JSON 对象；适合批量抽取岗位名称、技能要求、学分学时。',
    output: 'JSON 对象',
    prompt: KIE_GENERAL,
  },
  {
    id: 'vqa',
    name: '文档视觉问答 VQA',
    desc: '针对图片内容提问，仅依据图中可见信息作答，不补充推测。',
    output: '简洁文本答案',
    prompt: VQA_TEMPLATE.replace('{QUESTION}', 'What is the main content of this document?'),
  },
];

export const OCR_LINKS = {
  repo: 'https://github.com/SeerRay-Lab/Xiaomi-OCR-0',
  modelCard: 'https://huggingface.co/xiaomi-research/Xiaomi-OCR-0',
  modelscope: 'https://www.modelscope.cn/models/xiaomi-research/Xiaomi-OCR-0',
  ollama: 'https://ollama.com/library/longwayxu/xiaomi-ocr-0',
} as const;

export const OCR_LIMITATIONS = [
  '轻量直连通道只处理单张图片；官方 MCP 的 PDF 多页预处理与 PP-DocLayoutV3 区域切分不在此实现。',
  '解析结果保留官方模型输出的 OTSL 表格标记与 LaTeX 公式，未做 OTSL→HTML 后处理；页面会检测并提示。',
  'Ollama 社区 BF16 转换版为实验性路线，与官方 HF 权重不保证数值等价；精度敏感场景请用 SGLang / vLLM。',
  'OCR 输出是不可信文本，入库前会经 ingestDocumentGuarded 逐句拦截间接提示词注入，请人工复核后再入库。',
  '创空间 Docker 容器内 127.0.0.1 指向容器自身；需把推理服务与容器打通（host.docker.internal 或同机网关）后填写可达地址。',
];

export const OCR_SECURITY = [
  'API Key 只保存在当前服务端进程内存，不写磁盘、不进浏览器存储、不进日志；响应只返回脱敏值',
  '本地网关可留空密钥；外部端点必须使用 https，仅 localhost / 127.0.0.1 允许 http（SSRF 防护）',
  '图片上限 4MB，文本上限 20 万字符；配置 / 测试 / 解析 / 入库均单独限流',
  '上游响应体与异常原文不回传浏览器，只给出分类后的错误提示',
];

/* ------------------------------------------------------------ 运行时配置 */

export interface OcrSettings {
  preset: OcrPresetId;
  baseUrl: string;
  /** 本地 vLLM / Ollama 网关通常不需要密钥，允许为空 */
  apiKey: string;
  model: string;
  updatedAt: number;
}

export type OcrConfigSource = 'runtime' | 'env' | 'none';

export interface PublicOcrSettings {
  source: OcrConfigSource;
  configured: boolean;
  preset: OcrPresetId;
  baseUrl: string;
  model: string;
  maskedKey: string;
  updatedAt: number | null;
  demoMode: boolean;
  note: string;
}

interface OcrStore { settings: OcrSettings | null }
const GLOBAL_KEY = '__puhe_runtime_ocr__';

function store(): OcrStore {
  const g = globalThis as unknown as Record<string, OcrStore | undefined>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { settings: null };
  return g[GLOBAL_KEY]!;
}

export function getRuntimeOcrSettings(): OcrSettings | null {
  return store().settings;
}

export function setRuntimeOcrSettings(s: Omit<OcrSettings, 'updatedAt'>): OcrSettings {
  const next: OcrSettings = { ...s, updatedAt: Date.now() };
  store().settings = next;
  return next;
}

export function clearRuntimeOcrSettings(): void {
  store().settings = null;
}

/** 返回端点校验错误，合法时返回 null */
function assertEndpoint(baseRaw: string): string | null {
  if (!baseRaw) return 'Base URL 不能为空';
  if (baseRaw.length > 300) return 'Base URL 过长';
  let url: URL;
  try { url = new URL(baseRaw); } catch { return 'Base URL 不是合法 URL'; }
  if (url.username || url.password || url.search || url.hash) {
    return 'Base URL 不允许携带账号密码、查询参数或片段';
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (url.protocol === 'http:' && !loopback) return '外部端点必须使用 https；仅本机网关允许 http';
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '仅支持 http / https 协议';
  return null;
}

const PLACEHOLDER = /[一-龥\s]|你的|请填|YOUR|your_|placeholder|xxx|<|>/i;

export interface OcrValidation {
  ok: boolean;
  error?: string;
  value?: Omit<OcrSettings, 'updatedAt'>;
}

/** 严格校验网页提交的 OCR 配置（密钥可为空，其余与模型接入页同规格） */
export function validateOcrSettings(raw: unknown): OcrValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '请求体格式错误' };
  const b = raw as Record<string, unknown>;
  const presetRaw = typeof b.preset === 'string' ? b.preset.trim().toLowerCase() : 'custom';
  const preset: OcrPresetId = OCR_PRESETS.some((p) => p.id === presetRaw) ? presetRaw as OcrPresetId : 'custom';

  const baseUrl = typeof b.baseUrl === 'string' ? b.baseUrl.trim().replace(/\/+$/, '') : '';
  const endpointError = assertEndpoint(baseUrl);
  if (endpointError) return { ok: false, error: endpointError };

  const apiKey = typeof b.apiKey === 'string' ? b.apiKey.trim() : '';
  if (apiKey) {
    if (apiKey.length > 256) return { ok: false, error: 'API Key 过长（上限 256 字符）' };
    if (PLACEHOLDER.test(apiKey)) return { ok: false, error: 'API Key 疑似示例占位符，请粘贴真实密钥' };
    if (/[\r\n\u0000-\u001f]/.test(apiKey)) return { ok: false, error: 'API Key 含非法控制字符' };
  }

  const model = typeof b.model === 'string' ? b.model.trim() : '';
  if (!model) return { ok: false, error: '模型 ID 不能为空' };
  if (model.length > 128 || !/^[A-Za-z0-9._/:@-]+$/.test(model)) {
    return { ok: false, error: '模型 ID 含非法字符或过长（上限 128）' };
  }

  return { ok: true, value: { preset, baseUrl, apiKey, model } };
}

/**
 * 当前生效配置优先级：DEMO_MODE 强制关闭 > 网页运行时配置 > .env / Secrets > 未启用。
 * 与「模型接入」相互独立：OCR 不占用 Copilot 的文本模型配置。
 */
export function getOcrConfig(): OcrSettings | null {
  if (process.env.DEMO_MODE === 'true') return null;
  const rt = getRuntimeOcrSettings();
  if (rt) return rt;
  const baseUrl = process.env.OCR_BASE_URL?.trim().replace(/\/+$/, '') || '';
  const model = process.env.OCR_MODEL?.trim() || '';
  if (!baseUrl || !model || assertEndpoint(baseUrl)) return null;
  return {
    preset: 'custom',
    baseUrl,
    apiKey: process.env.OCR_API_KEY?.trim() || '',
    model,
    updatedAt: 0,
  };
}

/** 对外展示：绝不返回密钥本体；本地网关免密钥时给出明确说明 */
export function publicOcrSettings(): PublicOcrSettings {
  const demoMode = process.env.DEMO_MODE === 'true';
  const rt = getRuntimeOcrSettings();
  const cfg = getOcrConfig();
  const source: OcrConfigSource = demoMode ? 'none' : rt ? 'runtime' : cfg ? 'env' : 'none';
  const notes: Record<OcrConfigSource, string> = {
    runtime: '当前由「OCR 文档解析」页面配置驱动，密钥仅存于服务端内存，进程重启后失效',
    env: '当前由 .env.local / 平台 Secrets 的 OCR_BASE_URL / OCR_MODEL 驱动；网页配置可临时覆盖',
    none: '未启用 Xiaomi-OCR-0；请在页面选择部署预设并保存本地推理端点',
  };
  return {
    source,
    configured: Boolean(cfg),
    preset: rt?.preset || 'custom',
    baseUrl: cfg?.baseUrl || '',
    model: cfg?.model || '',
    maskedKey: cfg?.apiKey ? maskToken(cfg.apiKey) : '',
    updatedAt: rt?.updatedAt ?? null,
    demoMode,
    note: demoMode ? '已开启 DEMO_MODE 强制离线演示，OCR 通道暂不可用' : notes[source],
  };
}

/* -------------------------------------------------------------- 提示词 */

/**
 * 构造 image–instruction–response 里的 instruction。
 * 允许评审现场用自定义提示词覆盖官方模板（限长 2000 字符），便于对比不同任务写法。
 */
export function ocrInstruction(task: OcrTask, fields = '', question = '', customPrompt = ''): string {
  const custom = customPrompt.trim().slice(0, 2000);
  if (custom) return custom;
  if (task === 'parse') return OFFICIAL_PARSE_PROMPT;
  if (task === 'kie') {
    const keys = fields.split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 20).join(', ');
    return keys ? KIE_WITH_FIELDS.replace('{FIELDS}', keys) : KIE_GENERAL;
  }
  const q = question.trim().slice(0, 500) || 'What is the main content of this document?';
  return VQA_TEMPLATE.replace('{QUESTION}', q);
}

function classifyOcrStatus(status: number): string {
  if (status === 401 || status === 403) return '密钥无效，或该端点需要鉴权（本地网关可留空，外部网关需填 Key）';
  if (status === 404) return '端点或模型 ID 不存在，请检查 Base URL、模型 ID 与推理服务是否已加载权重';
  if (status === 429) return '推理服务繁忙或触发限流，请稍后重试';
  if (status === 400) return '请求被拒绝：请确认端点支持 OpenAI 兼容的 image_url 消息，且 max_model_len ≥ 16384';
  if (status >= 500) return '推理服务内部错误，请查看 vLLM / SGLang / Ollama 终端日志';
  return `推理服务返回 HTTP ${status}`;
}

/** OTSL 是官方模型输出表格的标记，官方 MCP 会转成 HTML；轻量通道保留原样并提示用户 */
export function hasOtslMarkup(text: string): boolean {
  return /<(?:fcel|lcel|ecel|ucel|nl)>/i.test(text);
}

export function normalizeOcrText(raw: string): { text: string; otsl: boolean; exceedsLimit: boolean } {
  const otsl = hasOtslMarkup(raw);
  let text = raw.replace(/\r/g, '');
  // KIE 常被模型包成 ```json ... ```，去掉围栏后才能直接作为 JSON 使用
  const fence = text.match(/^\s*```(?:json|markdown|md|text)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fence) text = fence[1];
  text = text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const exceedsLimit = text.length > LIMITS.TEXT;
  if (exceedsLimit) text = text.slice(0, LIMITS.TEXT);
  return { text, otsl, exceedsLimit };
}

/* ------------------------------------------------------------ 模型调用 */

export interface OcrParseOptions {
  task?: OcrTask;
  fields?: string;
  question?: string;
  customPrompt?: string;
  timeoutMs?: number;
}

export interface OcrResult {
  text: string;
  task: OcrTask;
  model: string;
  prompt: string;
  latencyMs: number;
  chars: number;
  /** 模型输出被 max_tokens / 字符上限截断，需分页或调小图片 */
  truncated: boolean;
  /** 结果含官方 OTSL 表格标记，未做 HTML 后处理 */
  otsl: boolean;
}

interface OcrChatResponse {
  choices?: {
    message?: {
      content?: string | { text?: string }[];
      reasoning_content?: string;
    };
    finish_reason?: string;
  }[];
}

const DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif|bmp);base64,[A-Za-z0-9+/=]+$/;
const MAX_DATA_URL_CHARS = Math.ceil((LIMITS.IMAGE_BYTES * 4) / 3) + 1024;

function ocrHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

/**
 * 单张图片 → Xiaomi-OCR-0：OpenAI 兼容 /chat/completions，非流式、temperature=0。
 * 官方示例把 image 放在 text 之前，这里保持同样的消息顺序。
 */
export async function ocrParse(dataUrl: string, opts: OcrParseOptions = {}): Promise<OcrResult> {
  const cfg = getOcrConfig();
  if (!cfg) throw new Error('尚未启用 Xiaomi-OCR-0：请先在「OCR 文档解析」页配置并保存本地推理端点');
  if (!DATA_URL.test(dataUrl) || dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('图片不合法：仅支持 PNG/JPG/WebP/GIF/BMP 的 base64 编码，且不超过 4MB');
  }

  const task: OcrTask = opts.task && ['parse', 'kie', 'vqa'].includes(opts.task) ? opts.task : 'parse';
  const prompt = ocrInstruction(task, opts.fields || '', opts.question || '', opts.customPrompt || '');
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: ocrHeaders(cfg.apiKey),
      body: JSON.stringify({
        model: cfg.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: prompt },
          ],
        }],
        temperature: 0,
        max_tokens: 4096,
        stream: false,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
      cache: 'no-store',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    throw new Error(/timeout|abort/i.test(msg)
      ? 'OCR 推理超时（默认 120 秒），请检查服务是否已加载权重或换用更小的图片'
      : '无法连接本地 OCR 服务，请确认 vLLM / SGLang / Ollama 已启动并监听所填地址');
  }
  if (!res.ok) {
    console.warn('[puhe:ocr] 上游返回 HTTP', res.status);
    throw new Error(classifyOcrStatus(res.status));
  }

  let json: OcrChatResponse;
  try { json = await res.json() as OcrChatResponse; } catch { throw new Error('推理服务返回的不是合法 JSON'); }
  const choice = json.choices?.[0];
  const content = choice?.message?.content;
  let raw = typeof content === 'string'
    ? content
    : Array.isArray(content) ? content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : '';
  if (!raw.trim()) raw = choice?.message?.reasoning_content || '';
  if (!raw.trim()) throw new Error('模型未返回任何内容，请换一张更清晰的图片或检查模型是否支持 image_url');

  const clean = normalizeOcrText(raw);
  return {
    text: clean.text,
    task,
    model: cfg.model,
    prompt,
    latencyMs: Date.now() - started,
    chars: clean.text.length,
    truncated: choice?.finish_reason === 'length' || clean.exceedsLimit,
    otsl: clean.otsl,
  };
}

/* ---------------------------------------------------------- 连通性探测 */

export interface OcrHealthResult {
  ok: boolean;
  latencyMs: number;
  model: string;
  servedModels?: string[];
  note?: string;
  error?: string;
}

/**
 * 先探测 GET /models（不消耗推理），端点未实现时回落一条极短 chat 请求。
 * 只验证「地址可达 + 鉴权通过 + 模型名被接受」，是否支持图片以真实解析为准。
 */
export async function ocrHealthCheck(target: Omit<OcrSettings, 'updatedAt'>): Promise<OcrHealthResult> {
  const baseUrl = target.baseUrl.replace(/\/+$/, '');
  const headers = ocrHeaders(target.apiKey);
  const started = Date.now();
  try {
    const r = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    if (r.ok) {
      const data = await r.json() as { data?: { id?: string }[] };
      const served = (data.data || []).map((m) => m.id || '').filter(Boolean).slice(0, 20);
      const matched = served.length === 0 || served.includes(target.model);
      return {
        ok: true,
        latencyMs: Date.now() - started,
        model: target.model,
        servedModels: served,
        note: matched
          ? '端点可达，模型 ID 匹配；请用一张真实文档图片确认 image_url 解析'
          : `端点可达，但 /models 未列出「${target.model}」，请核对服务实际加载的模型名`,
      };
    }
    if (r.status === 401 || r.status === 403) {
      return { ok: false, latencyMs: Date.now() - started, model: target.model, error: classifyOcrStatus(r.status) };
    }
    // 404 / 405 / 5xx：继续用 chat/completions 探测
  } catch { /* 回落到 chat 探测 */ }

  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: target.model,
        messages: [{ role: 'user', content: '请只回复 OK，不要解释。' }],
        temperature: 0,
        max_tokens: 8,
        stream: false,
      }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    const latencyMs = Date.now() - started;
    if (!r.ok) return { ok: false, latencyMs, model: target.model, error: classifyOcrStatus(r.status) };
    return {
      ok: true, latencyMs, model: target.model,
      note: '端点鉴权与模型名均正常（/models 不可用，已用极短补全探测）；请再用真实图片验证多模态',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    return {
      ok: false,
      latencyMs: Date.now() - started,
      model: target.model,
      error: /timeout|abort/i.test(msg) ? '连接超时，请检查推理服务是否已加载权重' : '网络不可达，请确认地址与端口（默认 8000 / 11434）',
    };
  }
}

/** GET /api/ocr 的能力清单 */
export function ocrCatalog() {
  return {
    presets: OCR_PRESETS,
    tasks: OCR_TASKS,
    links: OCR_LINKS,
    limitations: OCR_LIMITATIONS,
    security: OCR_SECURITY,
    limits: { imageBytes: LIMITS.IMAGE_BYTES, textChars: LIMITS.TEXT, maxTokens: 4096 },
    pipeline: ['① 上传/粘贴图片', '② Xiaomi-OCR-0 解析为 Markdown / JSON', '③ 人工复核修正', '④ 注入防护后入 RAG 语料', '⑤ Copilot 与 Deep Research 可检索'],
  };
}
