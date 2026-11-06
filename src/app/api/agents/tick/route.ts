import { NextResponse, after } from 'next/server';
import { resolveInternalOrigin } from '@/lib/agents/internalOrigin';
import { bearerMatches } from '@/lib/security/secrets';
import { advanceRun } from '@/lib/agents/runner';
import { claimNextRun, ensureAgentRunsIndexes } from '@/lib/agents/store';

// Runs ONE phase of ONE agent run, then re-invokes itself if more work
// remains — so no invocation runs long. Machine-to-machine: bearer
// CRON_SECRET (dev-open, prod-503). `?id=` targets one run; without it,
// the oldest resumable run is picked (the `.github/workflows/agents-tick.yml`
// safety-net calls it that way).

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorize(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, status: 503, error: 'CRON_SECRET is not configured' };
    }
    return { ok: true };
  }
  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

async function handle(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? undefined;

  try {
    await ensureAgentRunsIndexes();
  } catch {
    /* non-fatal */
  }

  const doc = await claimNextRun(id);
  if (!doc) {
    return NextResponse.json({ success: true, data: { picked: false } });
  }

  const result = await advanceRun(doc);

  if (!result.done) {
    after(async () => {
      try {
        await fetch(new URL(`/api/agents/tick?id=${doc._id.toString()}`, resolveInternalOrigin(process.env, request.url)), {
          method: 'POST',
          headers: process.env.CRON_SECRET
            ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
            : {},
        });
      } catch {
        /* the scheduled sweep will resume it */
      }
    });
  }

  return NextResponse.json({
    success: true,
    data: { id: doc._id.toString(), ...result },
  });
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
