import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISPATCH_EVERY_MS, SWEEP_EVERY_MS, TICK_EVERY_MS } from './localSchedule';

const quietSweep = async (userId: string) => ({
  counts: { initiated: 0, deferred: 0, checked: 0, requeued: 0 },
  failures: [] as string[],
  userId,
});
const sweep = vi.fn(quietSweep);
const dispatch = vi.fn(async (userId: string) => ({ ok: true as const, data: { userId } }));

vi.mock('@/lib/analysts/sweep', () => ({
  runStockAnalystSweep: (userId: string) => sweep(userId),
}));
vi.mock('@/lib/analysts/dispatchJob', () => ({
  runAnalystDispatch: (userId: string) => dispatch(userId),
}));
vi.mock('@/lib/deployment-mode', () => ({ isHosted: () => false }));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: vi.fn(async () => undefined) }));

const globalState = globalThis as typeof globalThis & { __mmLocalAiSchedule?: { timer: ReturnType<typeof setInterval> | null } };

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('startLocalAiSchedule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sweep.mockReset();
    sweep.mockImplementation(quietSweep);
    dispatch.mockClear();
    if (globalState.__mmLocalAiSchedule?.timer) clearInterval(globalState.__mmLocalAiSchedule.timer);
    delete globalState.__mmLocalAiSchedule;
    delete process.env.LOCAL_AI_SCHEDULE;
    delete process.env.NEXT_PHASE;
    process.env.NEXT_RUNTIME = 'nodejs';
  });

  afterEach(() => {
    if (globalState.__mmLocalAiSchedule?.timer) clearInterval(globalState.__mmLocalAiSchedule.timer);
    delete globalState.__mmLocalAiSchedule;
    vi.useRealTimers();
  });

  it('catches up on start and runs a later sweep from the wall clock without a second catch-up', async () => {
    const { startLocalAiSchedule } = await import('./localAiSchedule');
    startLocalAiSchedule();
    await flush();
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SWEEP_EVERY_MS);
    await flush();
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledTimes(1);

    // A second start must neither catch up again nor arm a second timer.
    const timer = globalState.__mmLocalAiSchedule?.timer;
    startLocalAiSchedule();
    await flush();
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(globalState.__mmLocalAiSchedule?.timer).toBe(timer);

    await vi.advanceTimersByTimeAsync(TICK_EVERY_MS);
    await flush();
    expect(sweep).toHaveBeenCalledTimes(2);

    // A non-hosted process only ever works for the user `local` (ADR 0058).
    for (const [userId] of [...sweep.mock.calls, ...dispatch.mock.calls]) expect(userId).toBe('local');
  });

  it('arms the timer again after it was lost, and the new timer runs the due sweep and dispatch', async () => {
    const { startLocalAiSchedule } = await import('./localAiSchedule');
    startLocalAiSchedule();
    await flush();
    const lost = globalState.__mmLocalAiSchedule?.timer;
    expect(lost).toBeTruthy();
    if (lost) clearInterval(lost);
    if (globalState.__mmLocalAiSchedule) globalState.__mmLocalAiSchedule.timer = null;

    // Nothing ticks while the timer is gone, however much time passes.
    await vi.advanceTimersByTimeAsync(DISPATCH_EVERY_MS);
    await flush();
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);

    startLocalAiSchedule();
    await flush();
    expect(globalState.__mmLocalAiSchedule?.timer).toBeTruthy();
    expect(sweep).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(TICK_EVERY_MS);
    await flush();
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('still runs a due dispatch when the sweep throws', async () => {
    const { startLocalAiSchedule } = await import('./localAiSchedule');
    startLocalAiSchedule();
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);

    sweep.mockRejectedValue(new Error('database unavailable'));
    await vi.advanceTimersByTimeAsync(DISPATCH_EVERY_MS);
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
