import { NextResponse } from 'next/server';
import { runAnalystDispatch } from '@/lib/analysts/dispatchJob';
import { isHosted } from '@/lib/deployment-mode';
import { authorizeCron } from '@/lib/security/cronAuth';

// Analyst Desk morning dispatch (#129, ADR 0058). Machine-to-machine: bearer CRON_SECRET, required in every environment, driven by
// `.github/workflows/analyst-dispatch.yml` at 08:30 IST on the hosted site. A non-hosted process also runs it for the user `local` (ADR 0062).
// Free: it arranges journal entries that already exist, no AI call.
// One brief per user per India day; a user with no vigilant analyst, no material item, or automatic analysts switched off gets nothing.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(request: Request) {
  const auth = authorizeCron(request, process.env.CRON_SECRET);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  // A non-hosted instance only ever serves the user 'local', even if its database also holds other users (see the stock-analysts worker).
  const only = isHosted() ? undefined : 'local';
  const result = await runAnalystDispatch(only);
  if (!result.ok) return NextResponse.json({ success: false, error: 'Dispatch run failed' }, { status: 500 });
  return NextResponse.json({ success: true, data: result.data });
}

export const POST = handle;
export const GET = handle;
