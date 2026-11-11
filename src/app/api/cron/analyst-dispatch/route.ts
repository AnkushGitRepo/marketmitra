import { NextResponse } from 'next/server';
import { runDispatch } from '@/lib/analysts/dispatchRun';
import { ensureDispatchIndexes } from '@/lib/analysts/dispatchStore';
import { listUsersWithActiveAnalysts } from '@/lib/analysts/store';
import { isHosted } from '@/lib/deployment-mode';
import { getPreferences } from '@/lib/preferences/store';
import { authorizeCron } from '@/lib/security/cronAuth';
import { logEvent } from '@/lib/system/eventLog';

const SOURCE = 'cron:analyst-dispatch';

// Analyst Desk morning dispatch (#129, ADR 0058). Machine-to-machine: bearer CRON_SECRET, required in every environment, driven by
// `.github/workflows/analyst-dispatch.yml` at 08:30 IST. Free: it arranges journal entries that already exist, no AI call.
// One brief per user per India day; a user with no vigilant analyst, no material item, or automatic analysts switched off gets nothing.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(request: Request) {
  const auth = authorizeCron(request, process.env.CRON_SECRET);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  const started = Date.now();
  const now = new Date();
  await ensureDispatchIndexes().catch(() => undefined);

  // A non-hosted instance only ever serves the user 'local', even if its database also holds other users (see the stock-analysts worker).
  const only = isHosted() ? undefined : 'local';
  const out = { users: 0, sent: 0, nothing: 0, already: 0, skippedOff: 0, errors: 0 };

  try {
    for (const userId of await listUsersWithActiveAnalysts(only)) {
      out.users += 1;
      try {
        if (!(await getPreferences(userId).then((p) => p.agents.auto).catch(() => true))) {
          out.skippedOff += 1;
          continue;
        }
        const r = await runDispatch(userId, now);
        if (r.kind === 'sent') out.sent += 1;
        else if (r.kind === 'already') out.already += 1;
        else out.nothing += 1;
      } catch (err) {
        out.errors += 1;
        await logEvent({ level: 'error', source: SOURCE, message: `Dispatch failed for one user: ${err instanceof Error ? err.name : 'Error'}` }).catch(() => undefined);
      }
    }
  } catch (err) {
    await logEvent({ level: 'error', source: SOURCE, message: `Dispatch run failed: ${err instanceof Error ? err.name : 'Error'}` }).catch(() => undefined);
    return NextResponse.json({ success: false, error: 'Dispatch run failed' }, { status: 500 });
  }

  await logEvent({ level: 'info', source: SOURCE, message: `Dispatch run: ${JSON.stringify(out)}`, meta: { ms: Date.now() - started } }).catch(() => undefined);
  return NextResponse.json({ success: true, data: out });
}

export const POST = handle;
export const GET = handle;
