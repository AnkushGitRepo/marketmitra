import { runDispatch } from '@/lib/analysts/dispatchRun';
import { ensureDispatchIndexes } from '@/lib/analysts/dispatchStore';
import { listUsersWithActiveAnalysts } from '@/lib/analysts/store';
import { getPreferences } from '@/lib/preferences/store';
import { logEvent } from '@/lib/system/eventLog';

const SOURCE = 'cron:analyst-dispatch';

export interface DispatchCounts {
  users: number;
  sent: number;
  nothing: number;
  already: number;
  skippedOff: number;
  errors: number;
}

export type DispatchOutcome = { ok: true; data: DispatchCounts } | { ok: false };

/**
 * Morning dispatch for the users this process may touch (ADR 0058). `only` is `'local'` off the hosted
 * site. Free: it arranges journal entries that already exist. One brief per user per India day.
 */
export async function runAnalystDispatch(only?: string): Promise<DispatchOutcome> {
  const started = Date.now();
  const now = new Date();
  await ensureDispatchIndexes().catch(() => undefined);
  const data: DispatchCounts = { users: 0, sent: 0, nothing: 0, already: 0, skippedOff: 0, errors: 0 };

  try {
    for (const userId of await listUsersWithActiveAnalysts(only)) {
      data.users += 1;
      try {
        if (!(await getPreferences(userId).then((p) => p.agents.auto).catch(() => true))) {
          data.skippedOff += 1;
          continue;
        }
        const r = await runDispatch(userId, now);
        if (r.kind === 'sent') data.sent += 1;
        else if (r.kind === 'already') data.already += 1;
        else data.nothing += 1;
      } catch (err) {
        data.errors += 1;
        await logEvent({ level: 'error', source: SOURCE, message: `Dispatch failed for one user: ${err instanceof Error ? err.name : 'Error'}` }).catch(() => undefined);
      }
    }
  } catch (err) {
    await logEvent({ level: 'error', source: SOURCE, message: `Dispatch run failed: ${err instanceof Error ? err.name : 'Error'}` }).catch(() => undefined);
    return { ok: false };
  }

  await logEvent({ level: 'info', source: SOURCE, message: `Dispatch run: ${JSON.stringify(data)}`, meta: { ms: Date.now() - started } }).catch(() => undefined);
  return { ok: true, data };
}
