import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { isEncKeyConfigured } from '@/lib/crypto';
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

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

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

  for (const [field, label] of [
    ['slackWebhookUrl', 'Slack webhook URL'],
    ['whatsappWebhookUrl', 'WhatsApp webhook URL'],
    ['customWebhookUrl', 'Custom webhook URL'],
  ] as const) {
    const value = input[field];
    if (value && !isHttpUrl(value)) {
      return NextResponse.json({ success: false, error: `${label} must be a valid http(s) URL.` }, { status: 422 });
    }
  }

  await setNotificationChannels(userId, input);
  const view = await getNotificationChannelSettingsView(userId);
  return NextResponse.json({ success: true, data: view });
}
