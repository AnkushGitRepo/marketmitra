import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { listAlerts } from '@/lib/alerts/store';
import { listHoldings } from '@/lib/holdings';
import { listNotes } from '@/lib/notes/userNotes';
<<<<<<< HEAD
import { listSnapshots } from '@/lib/tradeJournal/store';
import { listCash } from '@/lib/cash/store';
=======
import { listPurchaseDates } from '@/lib/tax/dates';
>>>>>>> origin/feat/414-tax-awareness
import { listWishlists } from '@/lib/wishlists/userWishlists';
import { listConversations, loadMessages } from '@/lib/mitra-chat/conversations';
import { MAX_CONVERSATIONS_PER_USER } from '@/lib/mitra-chat/limits';
import { liveMemoryStore } from '@/lib/mitra-chat/memory/store';
import { getPreferences } from '@/lib/preferences/store';
import { buildExportDocument, exportFilename } from '@/lib/settings/exportData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Everything the caller owns, as one JSON download. Secrets (AI key, channel tokens) are never included. */
export async function GET() {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return NextResponse.json({ success: false, data: null, error: 'Not authenticated' }, { status: 401 });
  try {
<<<<<<< HEAD
    const [holdings, notes, memories, alerts, wishlists, tradeJournal, cash, preferences, convos] = await Promise.all([
=======
    const [holdings, notes, memories, alerts, wishlists, purchaseDates, preferences, convos] = await Promise.all([
>>>>>>> origin/feat/414-tax-awareness
      listHoldings(userId),
      listNotes(userId),
      liveMemoryStore.list(userId),
      listAlerts(userId),
      listWishlists(userId),
<<<<<<< HEAD
      listSnapshots(userId),
      listCash(userId),
=======
      listPurchaseDates(userId),
>>>>>>> origin/feat/414-tax-awareness
      getPreferences(userId),
      listConversations(userId, undefined, MAX_CONVERSATIONS_PER_USER),
    ]);
    const conversations = await Promise.all(
      convos.map(async (conversation) => ({ conversation, messages: await loadMessages(userId, conversation.id) }))
    );
    const now = new Date();
<<<<<<< HEAD
    return new Response(JSON.stringify(buildExportDocument({ holdings, notes, memories, alerts, wishlists, tradeJournal, cash, conversations, preferences }, now), null, 2), {
=======
    return new Response(JSON.stringify(buildExportDocument({ holdings, notes, memories, alerts, wishlists, purchaseDates, conversations, preferences }, now), null, 2), {
>>>>>>> origin/feat/414-tax-awareness
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
