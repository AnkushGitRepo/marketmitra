import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { deleteWishlist, MAX_NAME, renameWishlist } from '@/lib/wishlists/userWishlists';

const renameSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const wishlist = await renameWishlist(userId, id, parsed.data.name);
  if (!wishlist) return NextResponse.json({ success: false, error: 'Wishlist not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: wishlist });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const ok = await deleteWishlist(userId, id);
  if (!ok) return NextResponse.json({ success: false, error: 'Wishlist not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: { id } });
}
