import { MAX_CATCHUP_PASSES, MAX_HEARTBEATS } from '@/lib/analysts/sweepLimits';

export interface CatchUpPass {
  initiated: number;
  deferred: number;
  checked: number;
  requeued: number;
}

export interface ScheduleEnv {
  hosted: boolean;
  /** `LOCAL_AI_SCHEDULE`. The value `off` disables the runner. */
  schedule: string | undefined;
  /** `NEXT_PHASE`. The production build must not start timers. */
  phase: string | undefined;
  /** `NEXT_RUNTIME`. Edge does not run this. Unset is treated as Node. */
  runtime: string | undefined;
}

/** The local runner starts only for a non-hosted Node process that has not opted out. */
export function localScheduleEnabled(env: ScheduleEnv): boolean {
  if (env.hosted) return false;
  if (env.schedule === 'off') return false;
  if (env.phase === 'phase-production-build') return false;
  if (env.runtime === 'edge') return false;
  if (env.runtime !== undefined && env.runtime !== '' && env.runtime !== 'nodejs') return false;
  return true;
}

/**
 * Another pass is useful when this one built a dossier, filled the heartbeat batch, or put analysts
 * back in the queue. A pass that did none of that is caught up. A daily cap with nothing built stops
 * the loop so it does not spin until the pass cap.
 */
export function shouldContinueCatchUp(result: CatchUpPass): boolean {
  if (result.deferred > 0 && result.initiated === 0) return false;
  if (result.requeued > 0) return true;
  if (result.initiated > 0) return true;
  if (result.checked >= MAX_HEARTBEATS) return true;
  return false;
}

/** Repeats the sweep until it is caught up or `maxPasses` is hit, then runs the dispatch once. Returns how many sweeps ran. */
export async function catchUpLocalAnalysts(deps: {
  sweep: () => Promise<CatchUpPass>;
  dispatch: () => Promise<void>;
  maxPasses?: number;
}): Promise<number> {
  const max = deps.maxPasses ?? MAX_CATCHUP_PASSES;
  let passes = 0;
  while (passes < max) {
    passes += 1;
    const result = await deps.sweep();
    if (!shouldContinueCatchUp(result)) break;
  }
  await deps.dispatch();
  return passes;
}

export const SWEEP_EVERY_MS = 20 * 60 * 1000;
export const DISPATCH_EVERY_MS = 60 * 60 * 1000;
