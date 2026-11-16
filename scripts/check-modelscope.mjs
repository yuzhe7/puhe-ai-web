#!/usr/bin/env node
/**
 * 魔搭 API-Inference 连通性自检（零依赖，Node ≥ 18）
 * --------------------------------------------------------------------------
 *   node scripts/check-modelscope.mjs            基础对话连通性
 *   node scripts/check-modelscope.mjs --tools   额外验证 Function Calling
 *   node scripts/check-modelscope.mjs --model=Qwen/Qwen3-235B-A22B-Instruct-2507
 *
 * 只读取环境变量 / .env.local，绝不打印 Token 本体；用于部署前与答辩前的快速排查。
 */
import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key]) continue;
    process.env[key] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
}
loadEnv();

const args = process.argv.slice(2);
const testTools = args.includes('--tools');
const modelArg = args.find((a) => a.startsWith('--model='));
const provider = (process.env.AI_PROVIDER || 'modelscope').trim().toLowerCase();
const presets = {
  modelscope: { baseUrl: 'https://api-inference.modelscope.cn/v1', model: 'Qwen/Qwen3-Coder-30B-A3B-Instruct' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
};
const preset = presets[provider] || presets.modelscope;
const token = (process.env.AI_API_KEY || process.env.MODELSCOPE_SDK_TOKEN || '').trim();
const baseUrl = (process.env.AI_BASE_URL || preset.baseUrl).replace(/\/+$/, '');
const model = modelArg?.slice('--model='.length) || process.env.AI_MODEL || preset.model;

console.log('=== 谱合产教 · 大模型连通性自检 ===');
console.log(`服务商      : ${provider}`);
console.log(`接口地址    : ${baseUrl}`);
console.log(`模型 ID     : ${model}`);
console.log(`凭证        : ${token ? `${token.slice(0, 3)}***${token.slice(-2)}` : '未配置'}`);
console.log(`DEMO_MODE   : ${process.env.DEMO_MODE || 'false'}${process.env.DEMO_MODE === 'true' ? '（注意：服务会强制走本地引擎）' : ''}`);
console.log(`工具调用测试: ${testTools ? '开启' : '关闭'}`);
console.log('');

if (!token) {
  console.error('✗ 未检测到 MODELSCOPE_SDK_TOKEN / AI_API_KEY。');
  console.error('  获取地址：https://modelscope.cn/my/myaccesstoken');
  console.error('  前置条件：注册魔搭 → 绑定阿里云账号 → 完成实名认证。');
  process.exit(1);
}

const body = {
  model,
  messages: [{ role: 'user', content: '用一句话说明什么是产教融合，不超过 30 字。' }],
  max_tokens: 64,
  stream: false,
};
if (testTools) {
  body.tools = [{
    type: 'function',
    function: {
      name: 'check_connection',
      description: '仅用于连通性测试，返回一个 ok 字段',
      parameters: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
    },
  }];
  body.tool_choice = 'auto';
}

const started = Date.now();
try {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await res.text();
  const ms = Date.now() - started;
  if (!res.ok) {
    console.error(`✗ 上游返回 ${res.status}（${ms}ms）`);
    console.error(`  ${raw.slice(0, 300).replace(/\s+/g, ' ')}`);
    if (res.status === 401 || res.status === 403) console.error('  → 检查 Token 是否正确、账号是否绑定阿里云并完成实名认证。');
    if (res.status === 429) console.error('  → 触发动态限流或当日额度用尽，稍后重试；项目内已内置 3 次退避重试。');
    if (res.status === 404) console.error('  → 模型 ID 可能已下线，请到模型页复制最新的 API-Inference 范例 Model-Id。');
    process.exit(1);
  }
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('上游返回的不是合法 JSON'); }
  const choice = data.choices?.[0];
  const text = String(choice?.message?.content || choice?.message?.reasoning_content || '').trim();
  const toolCalls = choice?.message?.tool_calls || [];
  console.log(`✓ 连接成功（${ms}ms）`);
  console.log(`  回复：${text.slice(0, 120) || '（空内容，若使用推理模型请查看 reasoning_content）'}`);
  if (testTools) console.log(`  Function Calling：${toolCalls.length ? `支持，返回 ${toolCalls.length} 个 tool_calls` : '本次未触发工具调用（返回了文本，属正常 auto 行为）'}`);
  console.log('');
  console.log('下一步：在 .env.local 填好同一 Token，重启服务后访问 /api/status 应显示 mode=llm。');
} catch (e) {
  console.error(`✗ 请求失败：${String(e.message).slice(0, 200)}`);
  console.error('  → 检查网络、代理与 base_url；本项目未配密钥时仍可完整离线演示。');
  process.exit(1);
}
