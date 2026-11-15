import { runAnalystDispatch } from '@/lib/analysts/dispatchJob';
import { runStockAnalystSweep } from '@/lib/analysts/sweep';
import { isHosted } from '@/lib/deployment-mode';
import {
  TICK_EVERY_MS,
  catchUpLocalAnalysts,
  decideScheduleTick,
  localScheduleEnabled,
  shouldRearmSchedule,
  type ScheduleClock,
} from '@/lib/scheduler/localSchedule';
import { logEvent } from '@/lib/system/eventLog';

const SOURCE = 'scheduler:local-ai';

interface ScheduleState extends ScheduleClock {
  timer: ReturnType<typeof setInterval> | null;
  lastTickAt: number | null;
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
      busySince: null,
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

/** Runs the sweep and the dispatch when each is due. A run still inside the busy cap is skipped. */
async function runDue(now: number): Promise<void> {
  const s = state();
  const decision = decideScheduleTick(s, now);
  if (!decision.runSweep && !decision.runDispatch) return;
  s.busySince = now;
  if (decision.runSweep) s.lastSweepAt = now;
  if (decision.runDispatch) s.lastDispatchAt = now;
  try {
    if (decision.runSweep) {
      await runJob(() => runStockAnalystSweep('local'));
      s.lastSweepAt = Date.now();
    }
    if (decision.runDispatch) {
      await runJob(() => runAnalystDispatch('local'));
      s.lastDispatchAt = Date.now();
    }
  } finally {
    if (s.busySince === now) s.busySince = null;
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
  s.busySince = now;
  s.lastSweepAt = now;
  s.lastDispatchAt = now;
  void catchUpLocalAnalysts({
    sweep: async () => {
      const { counts } = await runStockAnalystSweep('local');
      return counts;
    },
    dispatch: async () => {
      await runAnalystDispatch('local');
    },
  })
    .then(() => {
      const current = state();
      if (current.busySince !== now) return;
      const finished = Date.now();
      current.lastSweepAt = finished;
      current.lastDispatchAt = finished;
    })
    .catch((err: unknown) => {
      logFailure(err);
    })
    .finally(() => {
      const current = state();
      if (current.busySince === now) current.busySince = null;
    });
}
