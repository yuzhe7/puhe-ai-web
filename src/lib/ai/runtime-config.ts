/**
 * 运行时大模型配置（服务端内存态）
 * --------------------------------------------------------------------------
 * 目标：让参赛者 / 评审能在网页里直接配置并启用大模型 API，无需改 .env、无需重启。
 *
 * 安全约定（与赛道「密钥不得入库」一致）：
 *  1. 密钥只保存在**当前 Node 进程内存**，不写磁盘、不写 localStorage、不进 Git、不进日志；
 *  2. 任何对外的响应只返回脱敏值（前 3 后 2），绝不回传密钥本体；
 *  3. 进程重启 / 容器重启后配置自动清空，回落到 .env 或本地确定性引擎；
 *  4. baseUrl 做协议白名单校验，避免把「自定义端点」变成 SSRF 通道。
 *
 * 多实例限制：这是单进程内存态，不适用多副本部署；生产/创空间请用环境变量或平台 Secrets。
 */
import { PROVIDERS, resolveProvider, maskToken } from './providers';

export type ConfigSource = 'demo' | 'runtime' | 'env' | 'none';

export interface RuntimeSettings {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 可选：显式指定视觉模型后才启用图片 JD 抽取 */
  visionModel: string;
  updatedAt: number;
}

export interface PublicSettings {
  source: ConfigSource;
  configured: boolean;
  provider: string;
  providerName: string;
  baseUrl: string;
  model: string;
  visionModel: string;
  maskedKey: string;
  updatedAt: number | null;
  demoMode: boolean;
  note: string;
}

interface Store {
  settings: RuntimeSettings | null;
}

const GLOBAL_KEY = '__puhe_runtime_llm__';

function store(): Store {
  const g = globalThis as unknown as Record<string, Store | undefined>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { settings: null };
  return g[GLOBAL_KEY]!;
}

export function getRuntimeSettings(): RuntimeSettings | null {
  return store().settings;
}

export function setRuntimeSettings(s: Omit<RuntimeSettings, 'updatedAt'>): RuntimeSettings {
  const next: RuntimeSettings = { ...s, updatedAt: Date.now() };
  store().settings = next;
  return next;
}

export function clearRuntimeSettings(): void {
  store().settings = null;
}

/** 当前配置从哪来：DEMO_MODE 强制离线 > 网页运行时 > 环境变量 > 本地引擎 */
export function configSource(): ConfigSource {
  if (process.env.DEMO_MODE === 'true') return 'demo';
  if (getRuntimeSettings()?.apiKey) return 'runtime';
  if (process.env.AI_API_KEY?.trim() || process.env.MODELSCOPE_SDK_TOKEN?.trim()) return 'env';
  return 'none';
}

const PROVIDER_IDS = ['modelscope', 'deepseek', 'zhipu', 'qwen', 'openai', 'custom'] as const;

/** 明显的模板占位符 / 说明文字，避免把示例值当成真密钥保存 */
const PLACEHOLDER = /[一-龥\s]|你的|请填|YOUR|your_|placeholder|xxx|<|>/i;

export interface ValidationResult {
  ok: boolean;
  error?: string;
  value?: Omit<RuntimeSettings, 'updatedAt'>;
}

/**
 * 严格校验网页提交的模型配置。
 * 模型 ID 允许 ModelScope 命名空间（Qwen/xxx）、点、连字符、冒号、下划线，其余字符一律拒绝。
 */
export function validateSettings(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '请求体格式错误' };
  const b = raw as Record<string, unknown>;

  const provider = typeof b.provider === 'string' && (PROVIDER_IDS as readonly string[]).includes(b.provider.trim().toLowerCase())
    ? b.provider.trim().toLowerCase()
    : 'custom';

  const apiKey = typeof b.apiKey === 'string' ? b.apiKey.trim() : '';
  if (!apiKey) return { ok: false, error: 'API Key 不能为空' };
  if (apiKey.length > 256) return { ok: false, error: 'API Key 过长（上限 256 字符）' };
  if (PLACEHOLDER.test(apiKey)) return { ok: false, error: 'API Key 疑似示例占位符，请粘贴真实密钥' };
  if (/[\r\n\u0000-\u001f]/.test(apiKey)) return { ok: false, error: 'API Key 含非法控制字符' };

  const baseRaw = typeof b.baseUrl === 'string' ? b.baseUrl.trim().replace(/\/+$/, '') : '';
  if (!baseRaw) return { ok: false, error: 'Base URL 不能为空' };
  if (baseRaw.length > 300) return { ok: false, error: 'Base URL 过长' };
  let url: URL;
  try { url = new URL(baseRaw); } catch { return { ok: false, error: 'Base URL 不是合法 URL' }; }
  if (url.username || url.password || url.search || url.hash) {
    return { ok: false, error: 'Base URL 不允许携带账号密码、查询参数或片段' };
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (url.protocol === 'http:' && !loopback) {
    return { ok: false, error: '自定义端点必须使用 https；仅本机网关允许 http' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: '仅支持 http / https 协议' };
  }

  const model = typeof b.model === 'string' ? b.model.trim() : '';
  if (!model) return { ok: false, error: '模型 ID 不能为空' };
  if (model.length > 128 || !/^[A-Za-z0-9._/:@-]+$/.test(model)) {
    return { ok: false, error: '模型 ID 含非法字符或过长（上限 128）' };
  }

  const visionRaw = typeof b.visionModel === 'string' ? b.visionModel.trim() : '';
  if (visionRaw && (visionRaw.length > 128 || !/^[A-Za-z0-9._/:@-]+$/.test(visionRaw))) {
    return { ok: false, error: '视觉模型 ID 含非法字符或过长' };
  }

  return {
    ok: true,
    value: {
      provider,
      apiKey,
      baseUrl: baseRaw,
      model,
      visionModel: visionRaw,
    },
  };
}

/** 对外展示：绝不返回密钥本体 */
export function publicSettings(): PublicSettings {
  const rt = getRuntimeSettings();
  const source = configSource();
  const preset = rt ? resolveProvider(rt.provider) : null;
  const envPreset = resolveProvider(process.env.AI_PROVIDER);
  const envKey = process.env.AI_API_KEY?.trim() || process.env.MODELSCOPE_SDK_TOKEN?.trim() || '';
  const fromEnv = source === 'env';
  const provider = rt ? rt.provider : (envPreset?.id || 'custom');
  const providerName = rt
    ? (preset?.name || '自定义 OpenAI 兼容端点')
    : (envPreset?.name || '自定义 OpenAI 兼容端点');
  const baseUrl = rt ? rt.baseUrl : (process.env.AI_BASE_URL?.trim() || envPreset?.baseUrl || PROVIDERS.deepseek.baseUrl);
  const model = rt ? rt.model : (process.env.AI_MODEL?.trim() || envPreset?.defaultModel || PROVIDERS.deepseek.defaultModel);
  const visionModel = rt ? rt.visionModel : (process.env.VISION_MODEL?.trim() || '');
  const notes: Record<ConfigSource, string> = {
    demo: '已开启 DEMO_MODE，强制离线演示；网页配置不会生效',
    runtime: '当前由「模型接入」页面配置驱动，保存在服务端内存中，进程重启后失效',
    env: '当前由 .env.local / 平台 Secrets 驱动；网页配置可临时覆盖它',
    none: '未配置任何密钥，自动运行本地确定性引擎（功能完整、零 token 消耗）',
  };
  return {
    source,
    configured: source === 'runtime' || source === 'env',
    provider,
    providerName,
    baseUrl,
    model,
    visionModel,
    maskedKey: maskToken(rt?.apiKey || (fromEnv ? envKey : '')),
    updatedAt: rt?.updatedAt ?? null,
    demoMode: source === 'demo',
    note: notes[source],
  };
}
