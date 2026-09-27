import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { removeSymbol } from '@/lib/wishlists/userWishlists';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; symbol: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const { id, symbol } = await params;
  const wishlist = await removeSymbol(userId, id, decodeURIComponent(symbol));
  if (!wishlist) return NextResponse.json({ success: false, error: 'Wishlist not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: wishlist });
}
