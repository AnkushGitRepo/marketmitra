import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { MAX_BULLION_ENTRIES, createBullionSchema } from '@/lib/bullion/schema';
import { createBullion, listBullion } from '@/lib/bullion/store';
import { valueBullion } from '@/lib/bullion/value';
import { getCommodities } from '@/lib/commodities/getCommodities';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

/** The user's physical metals, valued at the estimated Indian price (ADR 0086, 0087). Values are null when no price is available. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  try {
    const [entries, commodities] = await Promise.all([listBullion(userId), getCommodities().catch(() => null)]);
    const summary = valueBullion(entries, commodities);
    return NextResponse.json({
      success: true,
      data: { ...summary, estimate: true, assumptions: commodities?.assumptions ?? null },
      error: null,
    });
  } catch (err) {
    console.error('[bullion] list failed', err);
    return fail('Could not load your metals.', 500);
  }
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  const parsed = createBullionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 422);
  try {
    const entry = await createBullion(userId, parsed.data);
    if (!entry) return fail(`You can keep up to ${MAX_BULLION_ENTRIES} metal entries.`, 409);
    return NextResponse.json({ success: true, data: entry, error: null }, { status: 201 });
  } catch (err) {
    console.error('[bullion] create failed', err);
    return fail('Could not save this entry.', 500);
  }
}
