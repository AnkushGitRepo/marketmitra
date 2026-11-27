import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { buildTaxReport } from '@/lib/tax/report';

export const dynamic = 'force-dynamic';

const MAX_BOOKED = 1_000_000_000_000;
// Gains already booked this financial year; a loss is negative. Absent means zero.
const querySchema = z.object({
  bookedShort: z.coerce.number().finite().min(-MAX_BOOKED).max(MAX_BOOKED).default(0),
  bookedLong: z.coerce.number().finite().min(-MAX_BOOKED).max(MAX_BOOKED).default(0),
});

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, data: null, error: 'Not authenticated' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    ...(params.has('bookedShort') ? { bookedShort: params.get('bookedShort') } : {}),
    ...(params.has('bookedLong') ? { bookedLong: params.get('bookedLong') } : {}),
  });
  if (!parsed.success) return NextResponse.json({ success: false, data: null, error: 'bookedShort and bookedLong must be numbers' }, { status: 422 });
  try {
    const report = await buildTaxReport(userId, new Date(), { short: parsed.data.bookedShort, long: parsed.data.bookedLong });
    return NextResponse.json({ success: true, data: report, error: null });
  } catch (err) {
    console.error('[tax] report failed', err);
    return NextResponse.json({ success: false, data: null, error: 'Could not build your tax view.' }, { status: 500 });
  }
}
