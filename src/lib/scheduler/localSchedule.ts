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
/** How often the process checks the wall clock. The jobs themselves stay on the cadence above. */
export const TICK_EVERY_MS = 60 * 1000;
/** A run older than this no longer blocks the next one. */
export const BUSY_CAP_MS = 15 * 60 * 1000;
/** A tick older than this means the timer is gone and must be armed again. */
export const TICK_STALE_MS = 2 * 60 * 1000;

export interface ScheduleClock {
  lastSweepAt: number | null;
  lastDispatchAt: number | null;
  busySince: number | null;
}

export interface TickDecision {
  runSweep: boolean;
  runDispatch: boolean;
}

/** True when `lastAt` is missing or at least `everyMs` has passed. */
export function isJobDue(lastAt: number | null, now: number, everyMs: number): boolean {
  if (lastAt === null) return true;
  return now - lastAt >= everyMs;
}

/** True while a run started recently enough that another one should wait. */
export function isRunBlocking(busySince: number | null, now: number, capMs: number = BUSY_CAP_MS): boolean {
  if (busySince === null) return false;
  return now - busySince < capMs;
}

/**
 * A timer that was never armed, or whose last tick is older than `TICK_STALE_MS`, has to be armed again.
 * A live timer with a recent tick stays as it is.
 */
export function shouldRearmSchedule(input: { hasTimer: boolean; lastTickAt: number | null }, now: number): boolean {
  if (!input.hasTimer) return true;
  if (input.lastTickAt === null) return true;
  return now - input.lastTickAt >= TICK_STALE_MS;
}

/** Which jobs this tick should start. A run that is still inside the busy cap starts neither. */
export function decideScheduleTick(clock: ScheduleClock, now: number): TickDecision {
  if (isRunBlocking(clock.busySince, now)) return { runSweep: false, runDispatch: false };
  return {
    runSweep: isJobDue(clock.lastSweepAt, now, SWEEP_EVERY_MS),
    runDispatch: isJobDue(clock.lastDispatchAt, now, DISPATCH_EVERY_MS),
  };
}
