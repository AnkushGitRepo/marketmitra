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
  /** Runs after the dispatch whether or not it failed, so one broken job cannot skip the Advisor review. */
  advisorReview?: () => Promise<void>;
  maxPasses?: number;
}): Promise<number> {
  const max = deps.maxPasses ?? MAX_CATCHUP_PASSES;
  let passes = 0;
  while (passes < max) {
    passes += 1;
    const result = await deps.sweep();
    if (!shouldContinueCatchUp(result)) break;
  }
  try {
    await deps.dispatch();
  } finally {
    if (deps.advisorReview) await deps.advisorReview();
  }
  return passes;
}

export const SWEEP_EVERY_MS = 20 * 60 * 1000;
export const DISPATCH_EVERY_MS = 60 * 60 * 1000;
/** The Advisor thesis review is idempotent (a criterion notifies once), so a few runs a day are enough. */
export const ADVISOR_REVIEW_EVERY_MS = 6 * 60 * 60 * 1000;
/** How often the process checks the wall clock. The jobs themselves stay on the cadence above. */
export const TICK_EVERY_MS = 60 * 1000;
/** A run younger than this is never overlapped. Past it, a stalled run does not stop the next one. */
export const BUSY_CAP_MS = 15 * 60 * 1000;
/** How many runs may be in flight at once: one that stalled, for example in sleep, and the current one. */
export const MAX_RUNS_IN_FLIGHT = 2;
/**
 * A run still pending after this long is treated as lost and stops holding a slot, so a run that never
 * returns cannot stop the schedule for good. Longer than a night's sleep, so stalled runs from a
 * sleeping laptop never claim a third slot.
 */
export const RUN_ABANDON_MS = 12 * 60 * 60 * 1000;
/** A tick older than this means the timer is gone and must be armed again. */
export const TICK_STALE_MS = 2 * 60 * 1000;

export interface ScheduleClock {
  lastSweepAt: number | null;
  lastDispatchAt: number | null;
  /** Absent until the Advisor review has run in this process. */
  lastAdvisorReviewAt?: number | null;
  /** Start times of the runs that have not finished. */
  runStarts: readonly number[];
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

/**
 * A new run may start when no live run is still fresh (inside `BUSY_CAP_MS`) and fewer than
 * `MAX_RUNS_IN_FLIGHT` are live. A run pending for `RUN_ABANDON_MS` or more is not live.
 */
export function canStartRun(runStarts: readonly number[], now: number): boolean {
  const live = runStarts.filter((startedAt) => now - startedAt < RUN_ABANDON_MS);
  if (live.some((startedAt) => now - startedAt < BUSY_CAP_MS)) return false;
  return live.length < MAX_RUNS_IN_FLIGHT;
}

/** `runStarts` with a run that started at `startedAt` added. Runs that were abandoned by then are dropped. */
export function withRun(runStarts: readonly number[], startedAt: number): number[] {
  return [...runStarts.filter((other) => startedAt - other < RUN_ABANDON_MS), startedAt];
}

/** `runStarts` without one run that started at `startedAt`. A start that is not in the list changes nothing. */
export function withoutRun(runStarts: readonly number[], startedAt: number): number[] {
  const index = runStarts.indexOf(startedAt);
  if (index === -1) return [...runStarts];
  return [...runStarts.slice(0, index), ...runStarts.slice(index + 1)];
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

/** Which jobs this tick should start. While no run slot is free, it starts neither. */
export function decideScheduleTick(clock: ScheduleClock, now: number): TickDecision {
  if (!canStartRun(clock.runStarts, now)) return { runSweep: false, runDispatch: false };
  return {
    runSweep: isJobDue(clock.lastSweepAt, now, SWEEP_EVERY_MS),
    runDispatch: isJobDue(clock.lastDispatchAt, now, DISPATCH_EVERY_MS),
  };
}

/** Whether this tick should run the Advisor thesis review: only with the Advisor on, in a free run slot, and once it is due. */
export function decideAdvisorReview(clock: ScheduleClock, now: number, advisorEnabled: boolean): boolean {
  if (!advisorEnabled) return false;
  if (!canStartRun(clock.runStarts, now)) return false;
  return isJobDue(clock.lastAdvisorReviewAt ?? null, now, ADVISOR_REVIEW_EVERY_MS);
}
