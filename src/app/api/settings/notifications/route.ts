import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { isEncKeyConfigured } from '@/lib/crypto';
import {
  SLACK_WEBHOOK_HOSTS,
  TELEGRAM_CHAT_ID_RE,
  TELEGRAM_TOKEN_RE,
  outboundOptions,
} from '@/lib/notifications/channels';
import { validateOutboundUrl } from '@/lib/security/outbound';
import {
  getNotificationChannelSettingsView,
  setNotificationChannels,
} from '@/lib/userSettings';

// Empty string clears that one channel; omitted leaves it untouched — same
// convention as the rest of this settings surface.
const putSchema = z.object({
  slackWebhookUrl: z.string().trim().max(500).optional(),
  telegramBotToken: z.string().trim().max(200).optional(),
  telegramChatId: z.string().trim().max(60).optional(),
  whatsappWebhookUrl: z.string().trim().max(500).optional(),
  customWebhookUrl: z.string().trim().max(500).optional(),
});


export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const view = await getNotificationChannelSettingsView(userId).catch(() => null);
  return NextResponse.json({ success: true, data: view, meta: { encConfigured: isEncKeyConfigured() } });
}

export async function PUT(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  if (!isEncKeyConfigured()) {
    return NextResponse.json(
      { success: false, error: 'This deployment has no SETTINGS_ENC_KEY set, so channels cannot be stored.' },
      { status: 503 }
    );
  }

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }
  const input = parsed.data;

  // Webhook targets are URLs the server will POST to, so they are validated
  // against SSRF rules here (and again at send time): https + public hosts
  // only when hosted, Slack pinned to hooks.slack.com.
  for (const [field, label, hosts] of [
    ['slackWebhookUrl', 'Slack webhook URL', SLACK_WEBHOOK_HOSTS],
    ['whatsappWebhookUrl', 'WhatsApp webhook URL', undefined],
    ['customWebhookUrl', 'Custom webhook URL', undefined],
  ] as const) {
    const value = input[field];
    if (!value) continue;
    const check = validateOutboundUrl(value, outboundOptions(hosts));
    if (!check.ok) {
      return NextResponse.json({ success: false, error: `${label}: ${check.reason}.` }, { status: 422 });
    }
  }
  if (input.telegramBotToken && !TELEGRAM_TOKEN_RE.test(input.telegramBotToken)) {
    return NextResponse.json({ success: false, error: 'Telegram bot token looks invalid.' }, { status: 422 });
  }
  if (input.telegramChatId && !TELEGRAM_CHAT_ID_RE.test(input.telegramChatId)) {
    return NextResponse.json({ success: false, error: 'Telegram chat id looks invalid.' }, { status: 422 });
  }

  await setNotificationChannels(userId, input);
  const view = await getNotificationChannelSettingsView(userId);
  return NextResponse.json({ success: true, data: view });
}
