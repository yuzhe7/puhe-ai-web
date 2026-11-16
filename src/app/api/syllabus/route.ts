import { NextRequest } from 'next/server';
import { generateSyllabus, baselinePlan } from '@/lib/simulator';
import { courses } from '@/lib/dataset';
import type { SimPlan } from '@/lib/simulator';
import { validCourse, validMajor, validJob, validHours, validModules, validRemoved, serverError } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ courses: courses.map((c) => ({ name: c.name, hours: c.hours, credits: c.credits, category: c.category })) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body !== 'object') return Response.json({ error: '请求体格式错误' }, { status: 400 });
    const course = validCourse(body.course);
    const raw = (body.plan && typeof body.plan === 'object' ? body.plan : {}) as Record<string, unknown>;
    const major = validMajor(raw.major);
    const job = validJob(raw.targetJob);
    const base = baselinePlan(major, job);
    // 客户端传来的改革方案同样必须收敛，避免任意字符串 / NaN 进入大纲学时表
    const plan: SimPlan = {
      ...base,
      hours: { ...base.hours, ...validHours(raw.hours, major) },
      modules: validModules(raw.modules),
      removed: validRemoved(raw.removed, major),
    };
    const markdown = generateSyllabus(course, plan);
    return Response.json({ course, markdown, chars: markdown.length });
  } catch (e) {
    return serverError('syllabus', e);
  }
}
