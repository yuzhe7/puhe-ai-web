/**
 * 大模型服务商预设（v4 · 魔搭 ModelScope 接入）
 * --------------------------------------------------------------------------
 * 项目本身没有自训模型：诊断数值由 `lib/graph.ts` / `simulator.ts` 的确定性算法产出，
 * 大模型只负责语言组织、意图理解与 Function Calling。这里把「用哪家模型」做成可插拔配置。
 *
 * 魔搭 API-Inference 提供 OpenAI 兼容接口，因此无需改动任何 SSE / 工具循环代码，
 * 只需切换 base_url、api_key 与 model（ModelScope Model-Id）三元组。
 * 官方资料：https://www.modelscope.cn/docs/model-service/API-Inference/intro
 */
export type ProviderId = 'modelscope' | 'deepseek' | 'zhipu' | 'qwen' | 'openai' | 'custom';

export interface ProviderPreset {
  id: Exclude<ProviderId, 'custom'>;
  name: string;
  baseUrl: string;
  defaultModel: string;
  tokenUrl?: string;
  note: string;
  /** 是否需要对 429 做退避重试（免费推理服务普遍采用动态限流） */
  throttleProne: boolean;
}

export const PROVIDERS: Record<Exclude<ProviderId, 'custom'>, ProviderPreset> = {
  modelscope: {
    id: 'modelscope',
    name: '魔搭 ModelScope · API-Inference',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    defaultModel: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
    tokenUrl: 'https://modelscope.cn/my/myaccesstoken',
    note: '开源模型免费推理；需绑定阿里云账号并实名认证；动态限流，429 自动退避',
    throttleProne: true,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    note: '按 token 计费',
    throttleProne: false,
  },
  zhipu: {
    id: 'zhipu',
    name: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    note: '有免费档模型',
    throttleProne: false,
  },
  qwen: {
    id: 'qwen',
    name: '阿里云百炼 / 通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    note: '按 token 计费',
    throttleProne: false,
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    note: '需海外网络与付费账户',
    throttleProne: false,
  },
};

/** 魔搭常用模型（社区实测支持 Function Calling；模型会迭代，以模型页 API-Inference 范例为准） */
export const MODELSCOPE_MODEL_CANDIDATES = [
  { id: 'Qwen/Qwen3-Coder-30B-A3B-Instruct', use: '默认，编程/工具调用稳定、限流宽松' },
  { id: 'Qwen/Qwen3-235B-A22B-Instruct-2507', use: '更强的综合推理，额度消耗更高' },
  { id: 'deepseek-ai/DeepSeek-V3.2', use: '中文报告与长文本综合' },
  { id: 'Qwen/Qwen2.5-VL-72B-Instruct', use: '多模态视觉（图片 JD 抽取，配 VISION_* 使用）' },
] as const;

export type ModelKind = 'text' | 'vision';
export interface RecommendedModel { id: string; use: string; kind: ModelKind }

/**
 * 各服务商的常见模型 ID。命名规则差异极大：
 *  - 魔搭 / 自定义网关用「命名空间/仓库名」（Qwen/xxx）；
 *  - 百炼 / DeepSeek / 智谱 / OpenAI 用短名（qwen-plus、deepseek-chat）。
 * **混用会直接 404**，因此配置页按所选服务商展示对应清单。
 * 模型会上下线，清单仅作起点，最终以厂商控制台与「测试连接」结果为准。
 */
export const RECOMMENDED_MODELS: Record<ProviderId, RecommendedModel[]> = {
  modelscope: [
    { id: 'Qwen/Qwen3-Coder-30B-A3B-Instruct', use: '默认 · 工具调用稳定、限流宽松', kind: 'text' },
    { id: 'Qwen/Qwen3-235B-A22B-Instruct-2507', use: '综合推理更强，额度消耗更高', kind: 'text' },
    { id: 'deepseek-ai/DeepSeek-V3.2', use: '中文报告与长文本综合', kind: 'text' },
    { id: 'Qwen/Qwen2.5-VL-72B-Instruct', use: '视觉理解 · 图片 JD 抽取', kind: 'vision' },
    { id: 'Qwen/Qwen3-VL-235B-A22B-Instruct', use: '旗舰多模态视觉', kind: 'vision' },
  ],
  deepseek: [
    { id: 'deepseek-chat', use: 'DeepSeek-V3 通用对话 · 支持 Function Calling', kind: 'text' },
    { id: 'deepseek-reasoner', use: 'R1 深度推理 · 不支持工具调用，Copilot 会降级', kind: 'text' },
  ],
  zhipu: [
    { id: 'glm-4-flash', use: '免费档 · 轻量对话', kind: 'text' },
    { id: 'glm-4-air', use: '性价比档', kind: 'text' },
    { id: 'glm-4-plus', use: '综合推理更强', kind: 'text' },
  ],
  qwen: [
    { id: 'qwen-plus', use: '默认 · 均衡，支持 Function Calling', kind: 'text' },
    { id: 'qwen-max', use: '复杂推理与长文本', kind: 'text' },
    { id: 'qwen-turbo', use: '最快、成本最低', kind: 'text' },
    { id: 'deepseek-v3', use: '百炼托管的 DeepSeek-V3', kind: 'text' },
    { id: 'qwen-vl-max', use: '视觉理解 · 图片 JD 抽取', kind: 'vision' },
    { id: 'qwen-vl-plus', use: '视觉理解 · 性价比档', kind: 'vision' },
  ],
  openai: [
    { id: 'gpt-4o-mini', use: '默认 · 成本低、支持工具调用', kind: 'text' },
    { id: 'gpt-4o', use: '综合推理更强', kind: 'text' },
    { id: 'gpt-4o', use: '视觉理解 · 图片 JD 抽取', kind: 'vision' },
  ],
  custom: [
    { id: 'qwen2.5:7b', use: 'Ollama 本地示例（多数本地模型不支持 tools）', kind: 'text' },
    { id: 'Qwen/Qwen2.5-7B-Instruct', use: 'vLLM / SGLang 自建服务示例', kind: 'text' },
  ],
};

export function recommendedFor(provider: string): RecommendedModel[] {
  const key = (provider || '').trim().toLowerCase();
  return RECOMMENDED_MODELS[key as ProviderId] || RECOMMENDED_MODELS.custom;
}

export function resolveProvider(value?: string): ProviderPreset | null {
  const key = (value || '').trim().toLowerCase();
  return (PROVIDERS as Record<string, ProviderPreset>)[key] || null;
}

/** 只用于状态面板展示，任何情况下都不返回密钥本体 */
export function maskToken(token: string): string {
  if (!token) return '';
  return `${token.slice(0, 3)}***${token.slice(-2)}`;
}
