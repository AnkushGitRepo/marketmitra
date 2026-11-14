import { describe, expect, it, vi } from 'vitest';
import { MAX_HEARTBEATS } from '@/lib/analysts/sweepLimits';
import { catchUpLocalAnalysts, localScheduleEnabled, shouldContinueCatchUp, type CatchUpPass } from './localSchedule';

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
