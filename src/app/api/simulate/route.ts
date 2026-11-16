import { NextRequest } from 'next/server';
import {
  listMajors, listJobs, curriculumOf, moduleCandidates, baselinePlan, simulate, autoOptimize,
} from '@/lib/simulator';
import type { SimPlan } from '@/lib/simulator';
import {
  LIMITS, safeNumber, validMajor, validJob, validHours, validModules, validRemoved, serverError,
} from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const major = validMajor(req.nextUrl.searchParams.get('major'));
  const job = validJob(req.nextUrl.searchParams.get('job'));
  return Response.json({
    majors: listMajors(), jobs: listJobs(),
    curriculum: curriculumOf(major), modules: moduleCandidates(major, job),
    baseline: baselinePlan(major, job),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body !== 'object') return Response.json({ error: '请求体格式错误' }, { status: 400 });
    const major = validMajor(body.major);
    const targetJob = validJob(body.targetJob);
    const budget = Math.round(safeNumber(body.budget, 0, LIMITS.BUDGET_MAX, 48));
    const optimize = body.optimize === true;

    // 所有外部可控数组/数值先收敛到白名单与有限区间，杜绝 NaN 指标与学时溢出
    const base = baselinePlan(major, targetJob);
    let plan: SimPlan = {
      ...base,
      hours: { ...base.hours, ...validHours(body.hours, major) },
      modules: validModules(body.modules),
      removed: validRemoved(body.removed, major),
    };
    let trace: string[] = [];
    if (optimize) {
      const r = autoOptimize(major, targetJob, budget);
      plan = r.plan;
      trace = r.trace;
    }
    const result = simulate(plan);
    // 兜底：任何一路出现非有限数值都拒绝返回，而不是把 NaN 推给前端渲染
    if (Object.values(result.after).some((v) => typeof v === 'number' && !Number.isFinite(v))) {
      return Response.json({ error: '模拟结果包含非有限数值，已拒绝返回', code: 'INVALID_METRICS' }, { status: 500 });
    }
    return Response.json({ plan, trace, result });
  } catch (e) {
    return serverError('simulate', e);
  }
}
