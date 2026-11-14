import { realDeps } from '@/lib/analysts/deps';
import { heartbeat, initiate } from '@/lib/analysts/engine';
import { releaseInitiate, tryClaimInitiate } from '@/lib/analysts/inFlight';
import { ensureAnalystIndexes, listDueForHeartbeat, listHoldingPairs, listInitializing, markFailure, requeueRetryable, spawnAnalyst } from '@/lib/analysts/store';
import { MAX_HEARTBEATS, MAX_INITIATIONS } from '@/lib/analysts/sweepLimits';
import { getPreferences } from '@/lib/preferences/store';
import { logEvent } from '@/lib/system/eventLog';

const SOURCE = 'cron:stock-analysts';
const MAX_HOLDING_PAIRS = 500;

export interface SweepCounts {
  initiated: number;
  deferred: number;
  needsKey: number;
  errors: number;
  checked: number;
  journaled: number;
  quiet: number;
  skippedOff: number;
  requeued: number;
}

export interface SweepOutcome {
  counts: SweepCounts;
  failures: string[];
}

/**
 * One analyst sweep (ADR 0058). `only` limits it to one user; the hosted cron passes undefined and a
 * local run passes `'local'`. Gives holdings an analyst, builds pending dossiers and runs due checks.
 */
export async function runStockAnalystSweep(only?: string): Promise<SweepOutcome> {
  const started = Date.now();
  const deps = realDeps();
  const now = deps.now();

  try {
    await ensureAnalystIndexes();
  } catch {
    /* non-fatal */
  }

  const autoOn = new Map<string, boolean>();
  const isAuto = async (userId: string): Promise<boolean> => {
    if (!autoOn.has(userId)) autoOn.set(userId, await getPreferences(userId).then((p) => p.agents.auto).catch(() => true));
    return autoOn.get(userId) as boolean;
  };

  const counts: SweepCounts = { initiated: 0, deferred: 0, needsKey: 0, errors: 0, checked: 0, journaled: 0, quiet: 0, skippedOff: 0, requeued: 0 };
  const failures: string[] = [];

  for (const pair of await listHoldingPairs(MAX_HOLDING_PAIRS, only).catch(() => [])) {
    if (!(await isAuto(pair.userId))) continue;
    await spawnAnalyst(pair.userId, pair.symbol, 'holding', now).catch(() => null);
  }

  counts.requeued = await requeueRetryable(only).catch(() => 0);

  for (const a of await listInitializing(MAX_INITIATIONS, only)) {
    if (!(await isAuto(a.userId))) {
      counts.skippedOff += 1;
      continue;
    }
    if (!tryClaimInitiate(a.userId, a.symbol)) continue;
    try {
      const r = await initiate(a, deps);
      if (r === 'initiated') counts.initiated += 1;
      else if (r === 'deferred') counts.deferred += 1;
      else if (r === 'needs_key') counts.needsKey += 1;
      else counts.errors += 1;
    } catch (err) {
      counts.errors += 1;
      failures.push(`${a.symbol}: ${err instanceof Error ? err.message : 'failed'}`);
      await markFailure(a.userId, a.symbol).catch(() => undefined);
    } finally {
      releaseInitiate(a.userId, a.symbol);
    }
  }

  for (const a of await listDueForHeartbeat(now, MAX_HEARTBEATS, only)) {
    if (!(await isAuto(a.userId))) {
      counts.skippedOff += 1;
      continue;
    }
    try {
      const r = await heartbeat(a, deps);
      counts.checked += 1;
      if (r === 'journaled') counts.journaled += 1;
      else if (r === 'quiet') counts.quiet += 1;
    } catch (err) {
      counts.errors += 1;
      failures.push(`${a.symbol}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  void logEvent({
    level: counts.errors > 0 ? 'warn' : 'info',
    source: SOURCE,
    message: `Stock analysts: ${counts.initiated} initiated, ${counts.checked} checked (${counts.journaled} journaled, ${counts.quiet} quiet), ${counts.errors} errored`,
    durationMs: Date.now() - started,
    meta: { ...counts },
  });
  return { counts, failures };
}
