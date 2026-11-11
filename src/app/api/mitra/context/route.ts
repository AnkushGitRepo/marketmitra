import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getChatContext } from '@/lib/mitra-chat/context';

export const dynamic = 'force-dynamic';

/** The signed-in user's first name and live-priced holdings, for the Mitra chat greeting and starter prompts. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, data: null, error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ success: true, data: await getChatContext(userId), error: null });
}
