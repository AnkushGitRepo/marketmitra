import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { listHoldings } from '@/lib/holdings';
import { setPurchaseDate } from '@/lib/tax/dates';
import { parseDate, toDateString } from '@/lib/tax/india';

const bodySchema = z.object({ purchaseDate: z.string().trim().nullable() });

const fail = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

/** Sets the date the user bought a holding (YYYY-MM-DD, not in the future), or clears it with null. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Send { purchaseDate: "YYYY-MM-DD" | null }', 422);
  const date = parsed.data.purchaseDate;
  if (date !== null) {
    const day = parseDate(date);
    if (!day) return fail('Enter a real date as YYYY-MM-DD.', 422);
    if (date > toDateString(new Date())) return fail('The purchase date cannot be in the future.', 422);
  }
  const { id } = await params;
  try {
    if (!(await listHoldings(userId)).some((h) => h.id === id)) return fail('Holding not found', 404);
    await setPurchaseDate(userId, id, date);
    return NextResponse.json({ success: true, data: { holdingId: id, purchaseDate: date }, error: null });
  } catch (err) {
    console.error('[tax] purchase date failed', err);
    return fail('Could not save this date.', 500);
  }
}
