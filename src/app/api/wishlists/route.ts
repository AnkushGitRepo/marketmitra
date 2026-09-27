import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { createWishlist, listWishlists, MAX_NAME } from '@/lib/wishlists/userWishlists';

const createSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME),
});

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ success: true, data: await listWishlists(userId) });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const wishlist = await createWishlist(userId, parsed.data.name);
  if (!wishlist) {
    return NextResponse.json(
      { success: false, error: 'Wishlist limit reached (20). Delete one first.' },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true, data: wishlist }, { status: 201 });
}
