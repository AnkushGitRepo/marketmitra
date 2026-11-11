import { NextResponse } from 'next/server';
import { realDeps } from '@/lib/analysts/deps';
import { isHosted } from '@/lib/deployment-mode';
import { heartbeat, initiate } from '@/lib/analysts/engine';
import { ensureAnalystIndexes, listDueForHeartbeat, listHoldingPairs, listInitializing, spawnAnalyst, setStatus } from '@/lib/analysts/store';
import { getPreferences } from '@/lib/preferences/store';
import { authorizeCron } from '@/lib/security/cronAuth';
import { logEvent } from '@/lib/system/eventLog';

const SOURCE = 'cron:stock-analysts';

// Analyst Desk (#128, ADR 0058). Machine-to-machine: bearer CRON_SECRET, required everywhere except a non-hosted dev instance on localhost, driven by
// `.github/workflows/stock-analysts.yml`. Each run: (1) gives every holding an analyst, (2) builds pending dossiers,
// (3) runs the end-of-day check for analysts that are due. Bounded per run; the per-user daily AI cap is enforced inside the engine.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_HOLDING_PAIRS = 500;
const MAX_INITIATIONS = 4;
const MAX_HEARTBEATS = 12;

async function handle(request: Request) {
  const auth = authorizeCron(request, { secret: process.env.CRON_SECRET, nodeEnv: process.env.NODE_ENV, hosted: isHosted() });
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  const started = Date.now();
  const deps = realDeps();
  const now = deps.now();

  try {
    await ensureAnalystIndexes();
  } catch {
    /* non-fatal */
  }

  // Only the hosted deployment serves many users. A self-hosted or local instance has the single user 'local' (ADR 0010), and it can be
  // pointed at a database that also holds other users' data, so it must never touch anyone else's records or keys.
  const only = isHosted() ? undefined : 'local';

  // The master switch is per user and defaults on; it is read once per user per run.
  const autoOn = new Map<string, boolean>();
  const isAuto = async (userId: string): Promise<boolean> => {
    if (!autoOn.has(userId)) autoOn.set(userId, await getPreferences(userId).then((p) => p.agents.auto).catch(() => true));
    return autoOn.get(userId) as boolean;
  };

  const out = { initiated: 0, deferred: 0, needsKey: 0, errors: 0, checked: 0, journaled: 0, quiet: 0, skippedOff: 0 };
  const errors: string[] = [];

  // 1. Every holding gets an analyst (a no-op for those that already have one).
  for (const pair of await listHoldingPairs(MAX_HOLDING_PAIRS, only).catch(() => [])) {
    if (!(await isAuto(pair.userId))) continue;
    await spawnAnalyst(pair.userId, pair.symbol, 'holding', now).catch(() => null);
  }

  // 2. Build pending dossiers.
  for (const a of await listInitializing(MAX_INITIATIONS, only)) {
    if (!(await isAuto(a.userId))) {
      out.skippedOff += 1;
      continue;
    }
    try {
      const r = await initiate(a, deps);
      if (r === 'initiated') out.initiated += 1;
      else if (r === 'deferred') out.deferred += 1;
      else if (r === 'needs_key') out.needsKey += 1;
      else out.errors += 1;
    } catch (err) {
      out.errors += 1;
      errors.push(`${a.symbol}: ${err instanceof Error ? err.message : 'failed'}`);
      await setStatus(a.userId, a.symbol, 'error', 'The analyst hit an unexpected error. Resume it to try again.').catch(() => undefined);
    }
  }

  // 3. End-of-day checks.
  for (const a of await listDueForHeartbeat(now, MAX_HEARTBEATS, only)) {
    if (!(await isAuto(a.userId))) {
      out.skippedOff += 1;
      continue;
    }
    try {
      const r = await heartbeat(a, deps);
      out.checked += 1;
      if (r === 'journaled') out.journaled += 1;
      else if (r === 'quiet') out.quiet += 1;
    } catch (err) {
      out.errors += 1;
      errors.push(`${a.symbol}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  void logEvent({
    level: out.errors > 0 ? 'warn' : 'info',
    source: SOURCE,
    message: `Stock analysts: ${out.initiated} initiated, ${out.checked} checked (${out.journaled} journaled, ${out.quiet} quiet), ${out.errors} errored`,
    durationMs: Date.now() - started,
    meta: out,
  });
  return NextResponse.json({ success: true, data: { ...out, errors } });
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
