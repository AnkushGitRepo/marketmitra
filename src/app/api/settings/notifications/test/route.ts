import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { resolveChannels } from '@/lib/notifications/deliver';
import { sendSlack, sendTelegram, sendWebhook, sendWhatsapp } from '@/lib/notifications/channels';

const testSchema = z.object({
  channel: z.enum(['slack', 'telegram', 'whatsapp', 'webhook']),
});

/** Sends one real test notification through a single already-saved channel,
 * so the user can confirm it actually works (not just that the URL/token
 * saved without error) before relying on it for a real alert. */
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = testSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const channels = await resolveChannels(userId);
  const payload = {
    kind: 'system' as const,
    title: 'Test notification',
    body: 'If you can see this, MarketMitra can reach you on this channel.',
    href: '/dashboard/alerts',
  };

  const { channel } = parsed.data;
  if (channel === 'slack') {
    if (!channels.slack) return NextResponse.json({ success: false, error: 'Slack is not configured yet.' }, { status: 409 });
    return NextResponse.json({ success: true, data: await sendSlack(channels.slack, payload) });
  }
  if (channel === 'telegram') {
    if (!channels.telegram) {
      return NextResponse.json({ success: false, error: 'Telegram is not configured yet.' }, { status: 409 });
    }
    return NextResponse.json({
      success: true,
      data: await sendTelegram(channels.telegram.botToken, channels.telegram.chatId, payload),
    });
  }
  if (channel === 'whatsapp') {
    if (!channels.whatsapp) {
      return NextResponse.json({ success: false, error: 'WhatsApp is not configured yet.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: await sendWhatsapp(channels.whatsapp, payload) });
  }
  if (!channels.webhook) {
    return NextResponse.json({ success: false, error: 'Custom webhook is not configured yet.' }, { status: 409 });
  }
  return NextResponse.json({ success: true, data: await sendWebhook(channels.webhook, payload) });
}
