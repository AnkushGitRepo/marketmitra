import { runAnalystDispatch } from '@/lib/analysts/dispatchJob';
import { runStockAnalystSweep } from '@/lib/analysts/sweep';
import { isHosted } from '@/lib/deployment-mode';
import { catchUpLocalAnalysts, DISPATCH_EVERY_MS, localScheduleEnabled, SWEEP_EVERY_MS } from '@/lib/scheduler/localSchedule';
import { logEvent } from '@/lib/system/eventLog';

const SOURCE = 'scheduler:local-ai';

const globalState = globalThis as typeof globalThis & { __mmLocalAiScheduleStarted?: boolean };

let busy = false;

function unrefTimer(timer: ReturnType<typeof setInterval>): void {
  if (typeof timer === 'object' && timer !== null && 'unref' in timer && typeof timer.unref === 'function') timer.unref();
}

function kick(work: () => Promise<void>): void {
  if (busy) return;
  busy = true;
  void work()
    .catch((err: unknown) => {
      void logEvent({
        level: 'error',
        source: SOURCE,
        message: `Local AI schedule failed: ${err instanceof Error ? err.name : 'Error'}`,
      });
    })
    .finally(() => {
      busy = false;
    });
}

/**
 * Catch up analyst dossiers, the evening check and the morning brief for the user `local`, then keep
 * the hosted cadence while this process stays up (ADR 0062). Does nothing on the hosted site, during
 * `next build`, on the edge runtime, or when `LOCAL_AI_SCHEDULE=off`. Safe to call more than once.
 */
export function startLocalAiSchedule(): void {
  if (globalState.__mmLocalAiScheduleStarted) return;
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
  globalState.__mmLocalAiScheduleStarted = true;

  kick(() =>
    catchUpLocalAnalysts({
      sweep: async () => {
        const { counts } = await runStockAnalystSweep('local');
        return counts;
      },
      dispatch: async () => {
        await runAnalystDispatch('local');
      },
    }).then(() => undefined),
  );

  unrefTimer(
    setInterval(() => {
      kick(async () => {
        await runStockAnalystSweep('local');
      });
    }, SWEEP_EVERY_MS),
  );
  unrefTimer(
    setInterval(() => {
      kick(async () => {
        await runAnalystDispatch('local');
      });
    }, DISPATCH_EVERY_MS),
  );
}
