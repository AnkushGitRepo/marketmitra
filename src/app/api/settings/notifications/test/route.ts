import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { isHosted } from '@/lib/deployment-mode';
import { resolveAlertEmailAddress, resolveChannels } from '@/lib/notifications/deliver';
import { decideEmailRoute, describeEmailSkip } from '@/lib/notifications/emailPolicy';
import { getEmailAlertStatus } from '@/lib/notifications/emailStatus';
import { emailConfigured, sendEmail } from '@/lib/notifications/channels';
import { getEmailAlertSettings, recordAlertEmailResult } from '@/lib/userSettings';
import { sendSlack, sendTelegram, sendWebhook, sendWhatsapp } from '@/lib/notifications/channels';

const testSchema = z.object({
  channel: z.enum(['email', 'slack', 'telegram', 'whatsapp', 'webhook']),
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

  const payload = {
    kind: 'system' as const,
    title: 'Test notification',
    body: 'If you can see this, MarketMitra can reach you on this channel.',
    href: '/alerts',
  };

  const { channel } = parsed.data;

  if (channel === 'email') {
    // The same route a real alert takes (setting, provider, address), so a passing test means an alert would arrive.
    const { enabled } = await getEmailAlertSettings(userId).catch(() => ({ enabled: true }));
    const providerConfigured = emailConfigured();
    const address = providerConfigured ? await resolveAlertEmailAddress(userId).catch(() => null) : null;
    const route = decideEmailRoute({ enabled, providerConfigured, address });
    if (route.kind === 'skip') {
      return NextResponse.json({ success: false, error: describeEmailSkip(route.reason, isHosted()), reason: route.reason }, { status: 409 });
    }
    const result = await sendEmail(route.to, payload);
    await recordAlertEmailResult(userId, { status: result.status === 'sent' ? 'sent' : result.status === 'skipped' ? 'skipped' : 'failed', detail: result.detail ?? null });
    return NextResponse.json({ success: true, data: { result, status: await getEmailAlertStatus(userId) } });
  }

  const channels = await resolveChannels(userId);
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
