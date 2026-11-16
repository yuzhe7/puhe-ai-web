import { NextRequest } from 'next/server';
import { tools, runTool } from '@/lib/ai/tools';
import { retrieve } from '@/lib/rag';
import { safeString, checkRateLimit, clientIp, rateLimitResponse } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * MCP（Model Context Protocol）最小服务端实现
 * 让外部 Agent / 客户端（Claude Desktop、Cursor、自定义智能体）通过标准 tools/list + tools/call
 * 直接调用「谱合产教」的三维诊断能力，对应评分细则「MCP/工具集成 4%」。
 * 传输采用 HTTP JSON-RPC，便于公网演示与评审访问。
 */
const SERVER_INFO = { name: 'puhe-edu-graph', version: '1.0.0', protocolVersion: '2024-11-05' };

async function handle(req: NextRequest) {
  const rl = checkRateLimit(`mcp:${clientIp(req.headers)}`, 60);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  let body: { jsonrpc?: string; id?: number | string; method?: string; params?: Record<string, unknown> };
  try { body = await req.json(); } catch { body = { method: 'tools/list', id: 1 }; }
  const id = body.id ?? 1;
  const ok = (result: unknown) => Response.json({ jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string) => Response.json({ jsonrpc: '2.0', id, error: { code, message } }, { status: 400 });

  switch (body.method) {
    case 'initialize':
      return ok({ ...SERVER_INFO, capabilities: { tools: { listChanged: false }, resources: { subscribe: false } } });
    case 'tools/list':
      return ok({
        tools: tools.map((t) => ({
          name: t.name,
          description: `${t.label}｜${t.description}`,
          inputSchema: t.parameters,
        })),
      });
    case 'tools/call': {
      const name = safeString(body.params?.name, 64);
      const rawArgs = (body.params?.arguments && typeof body.params.arguments === 'object' && !Array.isArray(body.params.arguments))
        ? body.params.arguments as Record<string, unknown> : {};
      // 限制 MCP 参数体积，避免超大对象进入确定性算法造成内存与 CPU 放大
      const args: Record<string, unknown> = Object.entries(rawArgs).length <= 20 && JSON.stringify(rawArgs).length <= 4000 ? rawArgs : {};
      const t = tools.find((x) => x.name === name);
      if (!t) return fail(-32602, `未知工具：${name}`);
      const out = runTool(name, args);
      return ok({ content: [{ type: 'text', text: out.content }], isError: false, structuredContent: { summary: out.summary, card: out.card || null } });
    }
    case 'resources/list':
      return ok({ resources: [{ uri: 'puhe://corpus/overview', name: '产教融合知识库概览', mimeType: 'application/json' }] });
    case 'resources/read': {
      const hits = retrieve('产教融合 专业 课程 岗位 技能', 3);
      return ok({ contents: [{ uri: 'puhe://corpus/overview', mimeType: 'application/json', text: JSON.stringify(hits, null, 2) }] });
    }
    default:
      return fail(-32601, `不支持的方法：${body.method}`);
  }
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET() {
  return Response.json({
    service: SERVER_INFO,
    endpoints: { 'POST /api/mcp': 'JSON-RPC：initialize / tools/list / tools/call / resources/list / resources/read' },
    toolCount: tools.length,
    example: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'analyze_similarity', arguments: { major: '计算机科学与技术' } } },
  });
}
