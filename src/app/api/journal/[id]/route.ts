import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { MAX_POST_MORTEM, MAX_REASON } from '@/lib/tradeJournal/snapshot';
import { deleteSnapshot, editEntryText } from '@/lib/tradeJournal/store';

const editSchema = z
  .object({
    reason: z.string().trim().max(MAX_REASON).nullable().optional(),
    postMortem: z.string().trim().max(MAX_POST_MORTEM).nullable().optional(),
  })
  .refine((v) => v.reason !== undefined || v.postMortem !== undefined, { message: 'Send reason or postMortem' });

type Ctx = { params: Promise<{ id: string }> };

const fail = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

/** Edits the user's own words on an entry (reason, reflection). The recorded facts are not editable. */
export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 422);
  const { id } = await params;
  try {
    const entry = await editEntryText(userId, id, parsed.data);
    if (!entry) return fail('Journal entry not found', 404);
    return NextResponse.json({ success: true, data: entry, error: null });
  } catch (err) {
    console.error('[journal] edit failed', err);
    return fail('Could not save this change.', 500);
  }
}

/** Deletes one entry. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  const { id } = await params;
  try {
    if (!(await deleteSnapshot(userId, id))) return fail('Journal entry not found', 404);
    return NextResponse.json({ success: true, data: { removed: true }, error: null });
  } catch (err) {
    console.error('[journal] delete failed', err);
    return fail('Could not delete this entry.', 500);
  }
}
