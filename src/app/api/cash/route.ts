import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { MAX_CASH_ENTRIES, createCashSchema } from '@/lib/cash/schema';
import { createCash, listCash } from '@/lib/cash/store';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  try {
    return NextResponse.json({ success: true, data: await listCash(userId), error: null });
  } catch (err) {
    console.error('[cash] list failed', err);
    return fail('Could not load your cash.', 500);
  }
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  const parsed = createCashSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 422);
  try {
    const entry = await createCash(userId, parsed.data);
    if (!entry) return fail(`You can keep up to ${MAX_CASH_ENTRIES} cash entries.`, 409);
    return NextResponse.json({ success: true, data: entry, error: null }, { status: 201 });
  } catch (err) {
    console.error('[cash] create failed', err);
    return fail('Could not save this cash entry.', 500);
  }
}
