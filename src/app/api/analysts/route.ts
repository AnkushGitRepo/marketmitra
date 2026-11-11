import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadDeskData } from '@/lib/analysts/deskData';
import { ensureAnalystIndexes, MAX_ANALYSTS_PER_USER, spawnAnalyst } from '@/lib/analysts/store';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getCompany } from '@/lib/dashboard/fundamentalsApi';

export const dynamic = 'force-dynamic';

// Analyst Desk (ADR 0058). Session only: these endpoints control unattended use of the user's own AI key.
const deploySchema = z.object({ symbol: z.string().trim().min(1).max(20) });

export async function GET() {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json({ success: true, data: await loadDeskData(userId) });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load your analysts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const parsed = deploySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  const symbol = parsed.data.symbol.toUpperCase();

  if (!(await getCompany(symbol))) {
    return NextResponse.json({ success: false, error: `Could not find "${symbol}". Check the NSE symbol.` }, { status: 404 });
  }
  try {
    await ensureAnalystIndexes().catch(() => undefined);
    const analyst = await spawnAnalyst(userId, symbol, 'watcher');
    if (!analyst) {
      return NextResponse.json({ success: false, error: `You can have at most ${MAX_ANALYSTS_PER_USER} analysts. Remove one first.` }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: { symbol: analyst.symbol, status: analyst.status } }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not deploy the analyst' }, { status: 500 });
  }
}
