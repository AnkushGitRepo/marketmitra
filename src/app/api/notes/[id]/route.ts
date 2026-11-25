import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { deleteNote, updateNote } from '@/lib/notes/userNotes';
import { updateNoteSchema } from '@/lib/notes/schema';
import { removeUserNote, syncUserNote } from '@/lib/rag/userSync';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const parsed = updateNoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const note = await updateNote(userId, id, parsed.data);
  if (!note) return NextResponse.json({ success: false, error: 'Note not found' }, { status: 404 });

  void syncUserNote(userId, note);

  return NextResponse.json({ success: true, data: note });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const ok = await deleteNote(userId, id);
  if (!ok) return NextResponse.json({ success: false, error: 'Note not found' }, { status: 404 });

  void removeUserNote(id);

  return NextResponse.json({ success: true, data: { id } });
}
