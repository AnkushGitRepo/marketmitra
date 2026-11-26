import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { memoryInputSchema } from '@/lib/mitra-chat/memory/schema';
import { liveMemoryStore } from '@/lib/mitra-chat/memory/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

/** Edits one memory's text (and optionally its kind). */
export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  const { id } = await params;
  const parsed = memoryInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Write a short fact (4 to 300 characters).', 422);
  try {
    const memory = await liveMemoryStore.update(userId, id, { text: parsed.data.text, kind: parsed.data.kind });
    return memory ? NextResponse.json({ success: true, data: memory }) : fail('Memory not found', 404);
  } catch {
    return fail('Could not save that. Please try again.', 500);
  }
}

/** Forgets one memory. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  const { id } = await params;
  try {
    const gone = await liveMemoryStore.remove(userId, id);
    return gone ? NextResponse.json({ success: true, data: { id } }) : fail('Memory not found', 404);
  } catch {
    return fail('Could not delete that. Please try again.', 500);
  }
}
