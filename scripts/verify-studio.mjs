#!/usr/bin/env node
/**
 * 创空间部署后一键验收（零依赖，Node ≥ 18）
 * --------------------------------------------------------------------------
 *   npm run verify:studio -- https://modelscope.cn/studios/<owner>/<repo>
 *   npm run verify:studio                     # 默认验证本地 http://127.0.0.1:3000
 *
 * 检查：页面可达、/api/status 运行态、专业目录完整性、MCP 工具、
 *       诊断 API、SSE 流式对话、安全响应头。
 * 若 /api/* 全部 404，通常是创空间把应用挂在子路径下，见 docs/08 第 8 步。
 */
const base = (process.argv[2] || process.env.STUDIO_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const TIMEOUT = 20000;

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(26, ' ')} ${detail}`);
};

async function req(pathname, options = {}, timeout = TIMEOUT) {
  const url = pathname.startsWith('http') ? pathname : base + pathname;
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  return res;
}
async function json(pathname, options) {
  const res = await req(pathname, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { data: await res.json(), res };
}

console.log('=== 谱合产教 · 部署验收 ===');
console.log(`目标：${base}`);
console.log('');

// 1. 首页
try {
  const res = await req('/');
  const html = await res.text();
  record('首页', res.status === 200, `HTTP ${res.status}${html.includes('AI 引擎') ? ' · 页面结构正常' : ' · HTML 结构需人工确认'}`);
} catch (e) { record('首页', false, String(e.message).slice(0, 90)); }

// 2. 运行状态
let status = null;
try {
  const { data, res } = await json('/api/status');
  status = data;
  record('运行状态 /api/status', true, `mode=${data.mode} · provider=${data.provider?.id} · tools=${data.tools?.total} · integrity=${data.integrity?.ok}`);
  if (res.headers.get('x-content-type-options') === 'nosniff') record('安全响应头', true, 'X-Content-Type-Options: nosniff');
  else record('安全响应头', false, '缺少 nosniff，检查 next.config.mjs headers()');
} catch (e) {
  record('运行状态 /api/status', false, `${String(e.message).slice(0, 90)}（若全部 /api 均 404，见 docs/08 第 8 步）`);
  record('安全响应头', false, '跳过');
}

// 3. 专业目录
try {
  const { data } = await json('/api/majors');
  record('专业目录 /api/majors', data.total >= 50 && data.integrity?.ok, `total=${data.total} · groups=${data.groupStats?.length} · issues=${data.integrity?.issues?.length ?? '?'}`);
} catch (e) { record('专业目录 /api/majors', false, String(e.message).slice(0, 90)); }

// 4. MCP 工具
try {
  const { data } = await json('/api/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  const n = data.result?.tools?.length ?? 0;
  record('MCP 工具端点', n >= 10, `tools/list 返回 ${n} 个工具`);
} catch (e) { record('MCP 工具端点', false, String(e.message).slice(0, 90)); }

// 5. 诊断 API
try {
  const { data } = await json('/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'overview' }),
  });
  record('诊断 API /api/analyze', Boolean(data.stats), `stats=${Boolean(data.stats)} · topRisk=${data.topRisk?.length ?? 0}`);
} catch (e) { record('诊断 API /api/analyze', false, String(e.message).slice(0, 90)); }

// 6. SSE 流式对话
try {
  const res = await req('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '数据结构这门课该怎么改？' }),
  }, 60000);
  const text = await res.text();
  const types = new Set();
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try { types.add(JSON.parse(line.slice(6)).type); } catch { /* 心跳行 */ }
  }
  record('SSE 流式对话', res.ok && types.has('delta') && types.has('done'), `HTTP ${res.status} · 事件类型 ${types.size} 类 · ${text.length} 字节`);
} catch (e) { record('SSE 流式对话', false, String(e.message).slice(0, 90)); }

// 7. 其余页面
for (const p of ['/graph', '/diagnosis', '/copilot', '/simulate', '/path', '/research', '/majors', '/data', '/report']) {
  try {
    const res = await req(p);
    record(`页面 ${p}`, res.status === 200, `HTTP ${res.status}`);
  } catch (e) { record(`页面 ${p}`, false, String(e.message).slice(0, 70)); }
}

console.log('');
const failed = results.filter((r) => !r.ok);
console.log(`结果：${results.length - failed.length}/${results.length} 项通过`);
if (status?.mode === 'local') {
  console.log('提示：当前为本地确定性引擎模式。若要启用魔搭模型，请在创空间 Secrets 中配置 MODELSCOPE_SDK_TOKEN。');
}
if (failed.length) {
  console.log('未通过项：');
  failed.forEach((f) => console.log(`  - ${f.name}：${f.detail}`));
  console.log('排错见 docs/08-创空间部署逐步操作手册.md 第 8 步与排错表。');
  process.exit(1);
}
console.log('✓ 部署验收通过，可以写入参赛材料的「在线演示」地址。');
