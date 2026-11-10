import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { listAlerts } from '@/lib/alerts/store';
import { listHoldings } from '@/lib/holdings';
import { listNotes } from '@/lib/notes/userNotes';
import { listWishlists } from '@/lib/wishlists/userWishlists';
import { listConversations, loadMessages } from '@/lib/mitra-chat/conversations';
import { MAX_CONVERSATIONS_PER_USER } from '@/lib/mitra-chat/limits';
import { getPreferences } from '@/lib/preferences/store';
import { buildExportDocument, exportFilename } from '@/lib/settings/exportData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Everything the caller owns, as one JSON download. Secrets (AI key, channel tokens) are never included. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, data: null, error: 'Not authenticated' }, { status: 401 });
  try {
    const [holdings, notes, alerts, wishlists, preferences, convos] = await Promise.all([
      listHoldings(userId),
      listNotes(userId),
      listAlerts(userId),
      listWishlists(userId),
      getPreferences(userId),
      listConversations(userId, undefined, MAX_CONVERSATIONS_PER_USER),
    ]);
    const conversations = await Promise.all(
      convos.map(async (conversation) => ({ conversation, messages: await loadMessages(userId, conversation.id) }))
    );
    const now = new Date();
    return new Response(JSON.stringify(buildExportDocument({ holdings, notes, alerts, wishlists, conversations, preferences }, now), null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFilename(now)}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ success: false, data: null, error: 'Could not build your export. Please try again.' }, { status: 500 });
  }
}
