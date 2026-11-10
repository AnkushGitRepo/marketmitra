import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { createConversation, listConversations, migrateLegacyThread } from '@/lib/mitra-chat/conversations';
import { TITLE_MAX } from '@/lib/mitra-chat/limits';

export const dynamic = 'force-dynamic';

const createSchema = z.object({ title: z.string().trim().min(1).max(TITLE_MAX).optional() });

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, data: null, error: 'Not authenticated' }, { status: 401 });

  const q = new URL(request.url).searchParams.get('q') ?? undefined;
  try {
    let items = await listConversations(userId, q);
    if (items.length === 0 && !q) {
      // First visit: carry the widget's old single thread over as a first conversation.
      const migrated = await migrateLegacyThread(userId);
      if (migrated) items = [migrated];
    }
    return NextResponse.json({ success: true, data: items, error: null });
  } catch {
    return NextResponse.json({ success: false, data: null, error: 'Could not load conversations.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, data: null, error: 'Not authenticated' }, { status: 401 });

  const parsed = createSchema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return NextResponse.json({ success: false, data: null, error: 'Invalid request' }, { status: 422 });

  const created = await createConversation(userId, parsed.data.title);
  if (!created) {
    return NextResponse.json(
      { success: false, data: null, error: 'Conversation limit reached. Delete some old chats first.' },
      { status: 409 }
    );
  }
  return NextResponse.json({ success: true, data: created, error: null }, { status: 201 });
}
