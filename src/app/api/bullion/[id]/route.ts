import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { updateBullionSchema } from '@/lib/bullion/schema';
import { deleteBullion, updateBullion } from '@/lib/bullion/store';

type Ctx = { params: Promise<{ id: string }> };

const fail = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  const parsed = updateBullionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 422);
  const { id } = await params;
  try {
    const entry = await updateBullion(userId, id, parsed.data);
    return entry ? NextResponse.json({ success: true, data: entry, error: null }) : fail('Entry not found', 404);
  } catch (err) {
    console.error('[bullion] update failed', err);
    return fail('Could not save this change.', 500);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  const { id } = await params;
  try {
    return (await deleteBullion(userId, id)) ? NextResponse.json({ success: true, data: { removed: true }, error: null }) : fail('Entry not found', 404);
  } catch (err) {
    console.error('[bullion] delete failed', err);
    return fail('Could not delete this entry.', 500);
  }
}
