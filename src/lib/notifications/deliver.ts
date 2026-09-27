import { isHosted } from '@/lib/deployment-mode';
import { getNotificationChannelSettings } from '@/lib/userSettings';
import { emailConfigured, sendEmail, sendSlack, sendTelegram, sendWebhook, sendWhatsapp } from './channels';
import { insertNotification } from './store';
import type { ChannelResult, Notification, NotificationPayload } from './types';

export interface ChannelConfig {
  /** External email recipient, or false/undefined to skip email. */
  email?: string | false;
  /** External webhook URL, or false/undefined to skip. */
  webhook?: string | false;
  /** Slack incoming-webhook URL, or false/undefined to skip. */
  slack?: string | false;
  /** Telegram bot token + chat id, or false/undefined to skip. */
  telegram?: { botToken: string; chatId: string } | false;
  /** A user-supplied relay webhook that forwards to WhatsApp, or false/undefined to skip. */
  whatsapp?: string | false;
}

export interface DeliveryOutcome {
  notification: Notification;
  results: ChannelResult[];
}

/**
 * The single fan-out point for every notification in the app (ADR 0014 §2,
 * extended by ADR 0028 with per-user Slack/Telegram/WhatsApp channels).
 * Always writes the in-app record; then delivers to whichever external
 * channels are configured. Never throws for a channel failure — a bad
 * webhook or missing email provider must not lose the notification.
 */
export async function deliverNotification(
  userId: string,
  payload: NotificationPayload,
  channels: ChannelConfig = {}
): Promise<DeliveryOutcome> {
  const notification = await insertNotification(userId, payload);
  const results: ChannelResult[] = [{ channel: 'in_app', status: 'sent' }];

  if (channels.email) {
    results.push(await sendEmail(channels.email, payload));
  }
  if (channels.webhook) {
    results.push(await sendWebhook(channels.webhook, payload));
  }
  if (channels.slack) {
    results.push(await sendSlack(channels.slack, payload));
  }
  if (channels.telegram) {
    results.push(await sendTelegram(channels.telegram.botToken, channels.telegram.chatId, payload));
  }
  if (channels.whatsapp) {
    results.push(await sendWhatsapp(channels.whatsapp, payload));
  }

  return { notification, results };
}

/**
 * A user's external channels — their own saved Slack/Telegram/WhatsApp/
 * custom-webhook settings (ADR 0028), falling back to the deployment-wide
 * `ALERT_WEBHOOK_URL` for the generic webhook slot only (so a self-hoster
 * who's set that env var still gets it with zero per-user setup, same as
 * before ADR 0028). Email is unchanged from ADR 0014: hosted mode resolves
 * the Clerk user's primary address, self-host uses `ALERT_EMAIL_TO` —
 * either way only once `emailConfigured()`.
 */
export async function resolveChannels(userId: string): Promise<ChannelConfig> {
  const stored = await getNotificationChannelSettings(userId).catch(() => null);

  const webhook = stored?.customWebhookUrl || process.env.ALERT_WEBHOOK_URL || false;
  const slack = stored?.slackWebhookUrl || false;
  const telegram =
    stored?.telegramBotToken && stored?.telegramChatId
      ? { botToken: stored.telegramBotToken, chatId: stored.telegramChatId }
      : false;
  const whatsapp = stored?.whatsappWebhookUrl || false;

  let email: string | false = false;
  if (emailConfigured()) {
    if (isHosted()) {
      email = (await resolveClerkEmail(userId)) ?? false;
    } else {
      email = process.env.ALERT_EMAIL_TO || false;
    }
  }

  return { email, webhook, slack, telegram, whatsapp };
}

async function resolveClerkEmail(userId: string): Promise<string | null> {
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
    return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
  } catch {
    return null;
  }
}
