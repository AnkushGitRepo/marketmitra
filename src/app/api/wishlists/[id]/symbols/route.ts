import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { addSymbol } from '@/lib/wishlists/userWishlists';

const addSchema = z.object({
  symbol: z.string().trim().min(1).max(30),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const wishlist = await addSymbol(userId, id, parsed.data.symbol);
  if (!wishlist) {
    return NextResponse.json(
      { success: false, error: 'Wishlist not found, or it already has 50 symbols' },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true, data: wishlist });
}
