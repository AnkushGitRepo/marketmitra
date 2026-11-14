import { NextResponse } from 'next/server';
import { isHosted } from '@/lib/deployment-mode';
import { runStockAnalystSweep } from '@/lib/analysts/sweep';
import { authorizeCron } from '@/lib/security/cronAuth';

// Analyst Desk (#128, ADR 0058). Machine-to-machine: bearer CRON_SECRET, required in every environment (no dev-open path), driven by
// `.github/workflows/stock-analysts.yml` on the hosted site. A non-hosted process also runs the same sweep for the user `local` (ADR 0062).
// Each run: (1) gives every holding an analyst, (2) builds pending dossiers, (3) runs the end-of-day check for analysts that are due.
// Bounded per run; the per-user daily AI cap is enforced inside the engine.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(request: Request) {
  const auth = authorizeCron(request, process.env.CRON_SECRET);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  // Only the hosted deployment serves many users. A self-hosted or local instance has the single user 'local' (ADR 0010), and it can be
  // pointed at a database that also holds other users' data, so it must never touch anyone else's records or keys.
  const only = isHosted() ? undefined : 'local';
  const { counts, failures } = await runStockAnalystSweep(only);
  return NextResponse.json({ success: true, data: { ...counts, errors: failures } });
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
