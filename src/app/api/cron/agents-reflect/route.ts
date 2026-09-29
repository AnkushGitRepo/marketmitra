import { NextResponse } from 'next/server';
import { reflectOnRun } from '@/lib/agents/reflect';
import {
  ensureAgentRunsIndexes,
  findRunsNeedingReflection,
  pruneOldRuns,
} from '@/lib/agents/store';
import { REFLECTION_HORIZON_DAYS } from '@/lib/agents/types';
import { logEvent } from '@/lib/system/eventLog';

const SOURCE = 'cron:agents-reflect';

// Phase 11 Part C (ADR 0021). Writes a hindsight "lessons" reflection on
// finished agent runs older than the horizon, and prunes very old runs.
// Machine-to-machine: bearer CRON_SECRET (dev-open, prod-503). Driven by
// `.github/workflows/agents-reflect.yml` (daily).

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_PER_RUN = 8;
const PRUNE_AFTER_DAYS = 120;

function authorize(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, status: 503, error: 'CRON_SECRET is not configured' };
    }
    return { ok: true };
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

async function handle(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  const started = Date.now();

  try {
    await ensureAgentRunsIndexes();
  } catch {
    /* non-fatal */
  }

  const due = await findRunsNeedingReflection(REFLECTION_HORIZON_DAYS, MAX_PER_RUN);
  const outcomes = { written: 0, skipped: 0, error: 0 };
  const errors: string[] = [];
  for (const doc of due) {
    try {
      const r = await reflectOnRun(doc);
      outcomes[r.status] += 1;
      if (r.status === 'error' && r.detail) errors.push(`${doc.symbol}: ${r.detail}`);
    } catch (err) {
      outcomes.error += 1;
      errors.push(`${doc.symbol}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  let pruned = 0;
  try {
    pruned = await pruneOldRuns(PRUNE_AFTER_DAYS);
  } catch {
    /* non-fatal */
  }

  void logEvent({
    level: outcomes.error > 0 ? 'warn' : 'info',
    source: SOURCE,
    message: `Agent reflection run: ${outcomes.written} written, ${outcomes.error} errored, ${pruned} pruned`,
    durationMs: Date.now() - started,
    meta: { considered: due.length, ...outcomes, pruned },
  });

  return NextResponse.json({
    success: true,
    data: { considered: due.length, ...outcomes, pruned, errors },
  });
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
