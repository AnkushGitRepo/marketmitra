import { describe, expect, it, vi } from 'vitest';
import { MAX_HEARTBEATS } from '@/lib/analysts/sweepLimits';
import {
  BUSY_CAP_MS,
  DISPATCH_EVERY_MS,
  MAX_RUNS_IN_FLIGHT,
  RUN_ABANDON_MS,
  SWEEP_EVERY_MS,
  TICK_STALE_MS,
  canStartRun,
  catchUpLocalAnalysts,
  ADVISOR_REVIEW_EVERY_MS,
  decideAdvisorReview,
  decideScheduleTick,
  isJobDue,
  localScheduleEnabled,
  shouldContinueCatchUp,
  shouldRearmSchedule,
  withRun,
  withoutRun,
  type CatchUpPass,
} from './localSchedule';

const quiet: CatchUpPass = { initiated: 0, deferred: 0, checked: 0, requeued: 0 };

describe('localScheduleEnabled', () => {
  const on = { hosted: false, schedule: undefined, phase: undefined, runtime: 'nodejs' as const };

  it('runs for a self-hosted Node process', () => {
    expect(localScheduleEnabled(on)).toBe(true);
    expect(localScheduleEnabled({ ...on, runtime: undefined })).toBe(true);
  });

  it('stays off on the hosted site, when opted out, during the production build, and on the edge runtime', () => {
    expect(localScheduleEnabled({ ...on, hosted: true })).toBe(false);
    expect(localScheduleEnabled({ ...on, schedule: 'off' })).toBe(false);
    expect(localScheduleEnabled({ ...on, schedule: 'on' })).toBe(true);
    expect(localScheduleEnabled({ ...on, phase: 'phase-production-build' })).toBe(false);
    expect(localScheduleEnabled({ ...on, runtime: 'edge' })).toBe(false);
  });
});

describe('shouldContinueCatchUp', () => {
  it('stops when the pass built nothing and did not fill the heartbeat batch', () => {
    expect(shouldContinueCatchUp(quiet)).toBe(false);
    expect(shouldContinueCatchUp({ ...quiet, checked: MAX_HEARTBEATS - 1 })).toBe(false);
  });

  it('continues when a dossier was built, the heartbeat batch was full, or analysts were re-queued', () => {
    expect(shouldContinueCatchUp({ ...quiet, initiated: 1 })).toBe(true);
    expect(shouldContinueCatchUp({ ...quiet, checked: MAX_HEARTBEATS })).toBe(true);
    expect(shouldContinueCatchUp({ ...quiet, requeued: 2 })).toBe(true);
  });

  it('stops when the daily cap deferred the work and nothing was built', () => {
    expect(shouldContinueCatchUp({ ...quiet, deferred: 4, requeued: 3 })).toBe(false);
  });
});

describe('catchUpLocalAnalysts', () => {
  it('repeats while work remains, then dispatches once', async () => {
    const sweep = vi
      .fn<() => Promise<CatchUpPass>>()
      .mockResolvedValueOnce({ ...quiet, initiated: 4 })
      .mockResolvedValueOnce(quiet);
    const dispatch = vi.fn(async () => undefined);
    const passes = await catchUpLocalAnalysts({ sweep, dispatch, maxPasses: 5 });
    expect(passes).toBe(2);
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('stops at the pass cap even when every pass still builds', async () => {
    const sweep = vi.fn(async () => ({ ...quiet, initiated: 1 }));
    const dispatch = vi.fn(async () => undefined);
    const passes = await catchUpLocalAnalysts({ sweep, dispatch, maxPasses: 3 });
    expect(passes).toBe(3);
    expect(sweep).toHaveBeenCalledTimes(3);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('does not keep sweeping after the daily cap defers a pass', async () => {
    const sweep = vi.fn(async () => ({ ...quiet, deferred: 1 }));
    const dispatch = vi.fn(async () => undefined);
    expect(await catchUpLocalAnalysts({ sweep, dispatch })).toBe(1);
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});

describe('wall-clock cadence', () => {
  const t0 = 1_700_000_000_000;

  it('treats a missing last run as due, and a run as due once its interval has elapsed', () => {
    expect(isJobDue(null, t0, SWEEP_EVERY_MS)).toBe(true);
    expect(isJobDue(t0, t0 + SWEEP_EVERY_MS - 1, SWEEP_EVERY_MS)).toBe(false);
    expect(isJobDue(t0, t0 + SWEEP_EVERY_MS, SWEEP_EVERY_MS)).toBe(true);
    expect(isJobDue(t0, t0 + DISPATCH_EVERY_MS - 1, DISPATCH_EVERY_MS)).toBe(false);
    expect(isJobDue(t0, t0 + DISPATCH_EVERY_MS, DISPATCH_EVERY_MS)).toBe(true);
  });

  it('starts a due job and skips both while a fresh run is going', () => {
    expect(decideScheduleTick({ lastSweepAt: null, lastDispatchAt: t0, runStarts: [] }, t0)).toEqual({
      runSweep: true,
      runDispatch: false,
    });
    expect(
      decideScheduleTick(
        { lastSweepAt: t0 - SWEEP_EVERY_MS, lastDispatchAt: t0 - DISPATCH_EVERY_MS, runStarts: [t0] },
        t0 + 1_000,
      ),
    ).toEqual({ runSweep: false, runDispatch: false });
    expect(
      decideScheduleTick(
        { lastSweepAt: t0 - SWEEP_EVERY_MS, lastDispatchAt: t0 - DISPATCH_EVERY_MS, runStarts: [t0 - BUSY_CAP_MS] },
        t0,
      ),
    ).toEqual({ runSweep: true, runDispatch: true });
  });

  it('starts nothing once the stalled runs fill every slot', () => {
    const due = { lastSweepAt: t0 - SWEEP_EVERY_MS, lastDispatchAt: t0 - DISPATCH_EVERY_MS };
    const stalled = [t0 - 2 * BUSY_CAP_MS, t0 - 3 * BUSY_CAP_MS];
    expect(decideScheduleTick({ ...due, runStarts: stalled }, t0)).toEqual({ runSweep: false, runDispatch: false });
    expect(decideScheduleTick({ ...due, runStarts: stalled.slice(0, 1) }, t0)).toEqual({
      runSweep: true,
      runDispatch: true,
    });
  });

  describe('run slots', () => {
    it('starts when nothing is running', () => {
      expect(canStartRun([], t0)).toBe(true);
    });

    it('waits for a fresh run, then lets one more start beside a stalled one', () => {
      expect(canStartRun([t0], t0 + BUSY_CAP_MS - 1)).toBe(false);
      expect(canStartRun([t0], t0 + BUSY_CAP_MS)).toBe(true);
    });

    it('never has more than MAX_RUNS_IN_FLIGHT runs going', () => {
      expect(MAX_RUNS_IN_FLIGHT).toBe(2);
      const now = t0 + 2 * BUSY_CAP_MS;
      expect(canStartRun([t0, t0 + 1_000], now)).toBe(false);
      // A fresh run still blocks, however many slots are free.
      expect(canStartRun([t0, now - 1_000], now)).toBe(false);
    });

    it('stops counting a run that has been pending for RUN_ABANDON_MS', () => {
      const stalled = [t0, t0 + 60 * 60 * 1000];
      expect(canStartRun(stalled, t0 + RUN_ABANDON_MS - 1)).toBe(false);
      expect(canStartRun(stalled, t0 + RUN_ABANDON_MS)).toBe(true);
    });

    it('adds a run without mutating the list, and drops runs that were abandoned', () => {
      const before = [t0, t0 + 1_000];
      expect(withRun(before, t0 + 2_000)).toEqual([t0, t0 + 1_000, t0 + 2_000]);
      expect(before).toEqual([t0, t0 + 1_000]);
      expect(withRun(before, t0 + RUN_ABANDON_MS)).toEqual([t0 + 1_000, t0 + RUN_ABANDON_MS]);
    });

    it('removes one run by its start, leaves the others, and ignores a start it does not know', () => {
      const before = [t0, t0 + 1_000, t0 + 2_000];
      expect(withoutRun(before, t0 + 1_000)).toEqual([t0, t0 + 2_000]);
      expect(withoutRun(before, t0 + 5_000)).toEqual(before);
      expect(withoutRun([t0, t0], t0)).toEqual([t0]);
      expect(before).toEqual([t0, t0 + 1_000, t0 + 2_000]);
    });
  });

  it('re-arms when there is no timer or the last tick is stale', () => {
    expect(shouldRearmSchedule({ hasTimer: false, lastTickAt: t0 }, t0)).toBe(true);
    expect(shouldRearmSchedule({ hasTimer: true, lastTickAt: null }, t0)).toBe(true);
    expect(shouldRearmSchedule({ hasTimer: true, lastTickAt: t0 }, t0 + TICK_STALE_MS - 1)).toBe(false);
    expect(shouldRearmSchedule({ hasTimer: true, lastTickAt: t0 }, t0 + TICK_STALE_MS)).toBe(true);
  });
});

describe('decideAdvisorReview', () => {
  const t0 = 1_700_000_000_000;
  const idle = { lastSweepAt: t0, lastDispatchAt: t0, runStarts: [] as number[] };

  it('is due when it has never run and again after six hours', () => {
    expect(decideAdvisorReview({ ...idle, lastAdvisorReviewAt: null }, t0, true)).toBe(true);
    expect(decideAdvisorReview(idle, t0, true)).toBe(true);
    expect(decideAdvisorReview({ ...idle, lastAdvisorReviewAt: t0 }, t0 + ADVISOR_REVIEW_EVERY_MS - 1, true)).toBe(false);
    expect(decideAdvisorReview({ ...idle, lastAdvisorReviewAt: t0 }, t0 + ADVISOR_REVIEW_EVERY_MS, true)).toBe(true);
  });

  it('never runs when the Advisor is off', () => {
    expect(decideAdvisorReview({ ...idle, lastAdvisorReviewAt: null }, t0, false)).toBe(false);
  });

  it('waits while a fresh run holds the slot', () => {
    expect(decideAdvisorReview({ ...idle, lastAdvisorReviewAt: null, runStarts: [t0 - 1_000] }, t0, true)).toBe(false);
  });
});

describe('catchUpLocalAnalysts with the Advisor review', () => {
  it('runs the review after the dispatch, and still runs it when the dispatch fails', async () => {
    const order: string[] = [];
    await catchUpLocalAnalysts({
      sweep: async () => quiet,
      dispatch: async () => {
        order.push('dispatch');
      },
      advisorReview: async () => {
        order.push('review');
      },
    });
    expect(order).toEqual(['dispatch', 'review']);

    const failed: string[] = [];
    await expect(
      catchUpLocalAnalysts({
        sweep: async () => quiet,
        dispatch: async () => {
          throw new Error('dispatch down');
        },
        advisorReview: async () => {
          failed.push('review');
        },
      }),
    ).rejects.toThrow('dispatch down');
    expect(failed).toEqual(['review']);
  });
});
