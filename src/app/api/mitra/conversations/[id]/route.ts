import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import {
  deleteConversation,
  getConversation,
  loadMessages,
  renameConversation,
} from '@/lib/mitra-chat/conversations';
import { getFileStore } from '@/lib/mitra-chat/gridFsFileStore';
import { TITLE_MAX } from '@/lib/mitra-chat/limits';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const renameSchema = z.object({ title: z.string().trim().min(1).max(TITLE_MAX) });

const err = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

export async function GET(_request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return err('Not authenticated', 401);
  const { id } = await params;
  const conversation = await getConversation(userId, id);
  if (!conversation) return err('Conversation not found', 404);
  const messages = await loadMessages(userId, id);
  return NextResponse.json({ success: true, data: { conversation, messages }, error: null });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return err('Not authenticated', 401);
  const { id } = await params;
  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return err('Invalid request', 422);
  const updated = await renameConversation(userId, id, parsed.data.title);
  if (!updated) return err('Conversation not found', 404);
  return NextResponse.json({ success: true, data: updated, error: null });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return err('Not authenticated', 401);
  const { id } = await params;
  const removed = await deleteConversation(userId, id);
  if (!removed) return err('Conversation not found', 404);
  // Best-effort: an orphaned file only costs quota, so don't fail the delete over it.
  const files = await getFileStore().removeByConversation(userId, id).catch(() => 0);
  return NextResponse.json({ success: true, data: { removed: true, files }, error: null });
}
