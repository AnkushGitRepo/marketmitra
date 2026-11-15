import { NextResponse } from 'next/server';
import { z } from 'zod';
import { advisorGate } from '@/lib/advisor/guard';
import { logEvent } from '@/lib/system/eventLog';
import { checkFit } from '@/lib/advisor/diagnostics/fit';
import { loadOverview } from '@/lib/advisor/diagnostics/overview';
import { parseProfile } from '@/lib/advisor/diagnostics/profiles';
import { getCompany } from '@/lib/dashboard/fundamentalsApi';

export const dynamic = 'force-dynamic';

// GET /api/advisor/fit?symbol=X&amount=10000 — would adding this amount of one name break your own limits
// or exclusions? A check against your rules, not a view on the company.

const querySchema = z.object({
  symbol: z.string().trim().regex(/^[A-Za-z0-9&._-]{1,20}$/),
  amount: z.coerce.number().gt(0).max(1e9).default(10000),
  profile: z.string().optional(),
});

export async function GET(request: Request) {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;

  const q = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) return NextResponse.json({ success: false, error: 'Enter a valid ticker symbol.' }, { status: 422 });

  try {
    const [overview, company] = await Promise.all([
      loadOverview(gate.userId, parseProfile(q.data.profile)),
      getCompany(q.data.symbol.toUpperCase()).catch(() => null),
    ]);
    const result = checkFit({
      holdings: overview.holdings,
      symbol: q.data.symbol,
      sector: company?.sector ?? null,
      amountINR: q.data.amount,
      limits: overview.rules.limits,
      excludedSectors: overview.rules.excludedSectors,
      excludedTickers: overview.rules.excludedTickers,
    });
    return NextResponse.json({ success: true, data: { ...result, name: company?.name ?? null, sector: company?.sector ?? null } });
  } catch (error) {
    await logEvent({ level: 'error', source: 'advisor:fit', message: 'Request failed', meta: { error: error instanceof Error ? error.message : String(error) } });
    return NextResponse.json({ success: false, error: 'Could not run the check.' }, { status: 500 });
  }
}
