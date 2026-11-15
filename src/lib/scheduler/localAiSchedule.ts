import { isAdvisorEnabled } from '@/lib/advisor/flag';
import { runAdvisorReviewJob } from '@/lib/advisor/journal/reviewJob';
import { runAnalystDispatch } from '@/lib/analysts/dispatchJob';
import { runStockAnalystSweep } from '@/lib/analysts/sweep';
import { isHosted } from '@/lib/deployment-mode';
import {
  TICK_EVERY_MS,
  catchUpLocalAnalysts,
  decideAdvisorReview,
  decideScheduleTick,
  localScheduleEnabled,
  shouldRearmSchedule,
  withRun,
  withoutRun,
  type ScheduleClock,
} from '@/lib/scheduler/localSchedule';
import { logEvent } from '@/lib/system/eventLog';

const SOURCE = 'scheduler:local-ai';

interface ScheduleState extends ScheduleClock {
  timer: ReturnType<typeof setInterval> | null;
  lastTickAt: number | null;
  lastAdvisorReviewAt: number | null;
  catchUpStarted: boolean;
}

const globalState = globalThis as typeof globalThis & { __mmLocalAiSchedule?: ScheduleState };

function state(): ScheduleState {
  if (!globalState.__mmLocalAiSchedule) {
    globalState.__mmLocalAiSchedule = {
      timer: null,
      lastTickAt: null,
      lastSweepAt: null,
      lastDispatchAt: null,
      lastAdvisorReviewAt: null,
      runStarts: [],
      catchUpStarted: false,
    };
  }
  return globalState.__mmLocalAiSchedule;
}

function logFailure(err: unknown): void {
  void logEvent({
    level: 'error',
    source: SOURCE,
    message: `Local AI schedule failed: ${err instanceof Error ? err.name : 'Error'}`,
  });
}

/** Runs one job and logs its failure, so a failing sweep cannot keep a due dispatch from running. */
async function runJob(job: () => Promise<unknown>): Promise<void> {
  try {
    await job();
  } catch (err: unknown) {
    logFailure(err);
  }
}

/** Runs the sweep, the dispatch and the Advisor review when each is due. The tick is skipped while no run slot is free. */
async function runDue(now: number): Promise<void> {
  const s = state();
  const decision = decideScheduleTick(s, now);
  const runReview = decideAdvisorReview(s, now, isAdvisorEnabled());
  if (!decision.runSweep && !decision.runDispatch && !runReview) return;
  s.runStarts = withRun(s.runStarts, now);
  if (decision.runSweep) s.lastSweepAt = now;
  if (decision.runDispatch) s.lastDispatchAt = now;
  if (runReview) s.lastAdvisorReviewAt = now;
  try {
    if (decision.runSweep) {
      await runJob(() => runStockAnalystSweep('local'));
      s.lastSweepAt = Date.now();
    }
    if (decision.runDispatch) {
      await runJob(() => runAnalystDispatch('local'));
      s.lastDispatchAt = Date.now();
    }
    if (runReview) {
      await runJob(() => runAdvisorReviewJob('local'));
      s.lastAdvisorReviewAt = Date.now();
    }
  } finally {
    s.runStarts = withoutRun(s.runStarts, now);
  }
}

/** The schedule must not keep the process alive on its own. */
function unrefTimer(timer: ReturnType<typeof setInterval>): void {
  if (typeof timer === 'object' && timer !== null && 'unref' in timer && typeof timer.unref === 'function') timer.unref();
}

function arm(now: number): void {
  const s = state();
  if (s.timer) clearInterval(s.timer);
  s.lastTickAt = now;
  s.timer = setInterval(() => {
    const tickNow = Date.now();
    state().lastTickAt = tickNow;
    void runDue(tickNow);
  }, TICK_EVERY_MS);
  unrefTimer(s.timer);
}

/**
 * Catch up analyst dossiers, the evening check and the morning brief for the user `local`, then keep
 * the hosted cadence on the wall clock while this process stays up (ADR 0062). A lost timer is armed
 * again the next time this is called. Does nothing on the hosted site, during `next build`, on the
 * edge runtime, or when `LOCAL_AI_SCHEDULE=off`. Safe to call more than once.
 */
export function startLocalAiSchedule(now: number = Date.now()): void {
  if (
    !localScheduleEnabled({
      hosted: isHosted(),
      schedule: process.env.LOCAL_AI_SCHEDULE,
      phase: process.env.NEXT_PHASE,
      runtime: process.env.NEXT_RUNTIME,
    })
  ) {
    return;
  }
  const s = state();
  if (shouldRearmSchedule({ hasTimer: s.timer !== null, lastTickAt: s.lastTickAt }, now)) arm(now);
  if (s.catchUpStarted) return;
  s.catchUpStarted = true;
  s.runStarts = withRun(s.runStarts, now);
  s.lastSweepAt = now;
  s.lastDispatchAt = now;
  s.lastAdvisorReviewAt = now;
  void catchUpLocalAnalysts({
    sweep: async () => {
      const { counts } = await runStockAnalystSweep('local');
      return counts;
    },
    dispatch: async () => {
      await runAnalystDispatch('local');
    },
    advisorReview: isAdvisorEnabled() ? () => runJob(() => runAdvisorReviewJob('local')) : undefined,
  })
    .then(() => {
      const current = state();
      const finished = Date.now();
      current.lastSweepAt = finished;
      current.lastDispatchAt = finished;
      current.lastAdvisorReviewAt = finished;
    })
    .catch((err: unknown) => {
      logFailure(err);
    })
    .finally(() => {
      const current = state();
      current.runStarts = withoutRun(current.runStarts, now);
    });
}
