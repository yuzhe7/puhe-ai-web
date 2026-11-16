import { NextRequest } from 'next/server';
import { similarityMatrix, competencyDiagnosis, knowledgeGaps, buildGraph, layerNames } from '@/lib/graph';
import { majors, courses, jobs, skills, demoStats } from '@/lib/dataset';
import {
  validMajor, validCourse, validLayer, validSides, safeString,
  checkRateLimit, clientIp, rateLimitResponse, serverError,
} from '@/lib/validation';

export const runtime = 'nodejs';

const ALLOWED = new Set(['overview', 'similarity', 'competency', 'gap', 'graph', 'catalog']);

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(`analyze:${clientIp(req.headers)}`, 120);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  try {
    const raw = await req.json() as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return Response.json({ error: '请求体格式错误' }, { status: 400 });
    const kind = safeString(raw.kind, 32, 'overview');
    if (!ALLOWED.has(kind)) return Response.json({ error: `不支持的分析类型：${kind}` }, { status: 400 });

    const course = validCourse(raw.course);
    const major = validMajor(raw.focusMajor);

    if (kind === 'overview') {
      return Response.json({
        stats: demoStats,
        majorNames: majors.slice(0, 10).map((m) => m.name),
        topRisk: similarityMatrix().filter((c) => c.a !== c.b).sort((a, b) => b.score - a.score).slice(0, 6),
        competency: competencyDiagnosis(),
        gaps: knowledgeGaps('数据结构'),
      });
    }
    if (kind === 'similarity') return Response.json({ rows: similarityMatrix(), majors: majors.map((m) => m.name) });
    if (kind === 'competency') return Response.json({ rows: competencyDiagnosis() });
    if (kind === 'gap') return Response.json({ course, rows: knowledgeGaps(course) });
    if (kind === 'catalog') {
      return Response.json({
        majors: majors.map((m) => ({ name: m.name, college: m.college, category: m.category })),
        courses: courses.map((c) => ({ name: c.name, hours: c.hours, credits: c.credits, category: c.category })),
        jobs: jobs.map((j) => ({ title: j.title, count: j.count, salary: j.salary, industry: j.industry })),
        skills: skills.map((s) => ({ name: s.name, demand: s.demand, trend: s.trend })),
      });
    }
    const layer = validLayer(raw.layer);
    const sides = validSides(raw.sides);
    return Response.json({ layer, layerName: layerNames[layer], graph: buildGraph(layer, sides, major) });
  } catch (e) {
    return serverError('analyze', e);
  }
}
