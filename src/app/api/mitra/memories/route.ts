import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { memoryInputSchema } from '@/lib/mitra-chat/memory/schema';
import { MAX_MEMORIES } from '@/lib/mitra-chat/memory/rules';
import { liveMemoryStore } from '@/lib/mitra-chat/memory/store';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

/** Everything Mitra remembers about the caller, newest first. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  try {
    return NextResponse.json({ success: true, data: await liveMemoryStore.list(userId) });
  } catch {
    return fail('Could not load your memory. Please try again.', 500);
  }
}

/** Adds a memory the user writes themselves. */
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  const parsed = memoryInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Write a short fact (4 to 300 characters).', 422);
  try {
    const memory = await liveMemoryStore.add(userId, { text: parsed.data.text, kind: parsed.data.kind ?? 'other', source: 'manual' });
    if (!memory) return fail(`Memory is full (${MAX_MEMORIES}). Delete some first.`, 409);
    return NextResponse.json({ success: true, data: memory }, { status: 201 });
  } catch {
    return fail('Could not save that. Please try again.', 500);
  }
}

/** Forgets everything. */
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);
  try {
    return NextResponse.json({ success: true, data: { removed: await liveMemoryStore.removeAll(userId) } });
  } catch {
    return fail('Could not clear your memory. Please try again.', 500);
  }
}
