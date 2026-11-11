import { isHosted } from '@/lib/deployment-mode';
import { getEmailAlertSettings, getNotificationChannelSettings, recordAlertEmailResult } from '@/lib/userSettings';
import { maskEmail } from '@/lib/email/send';
import { logEvent } from '@/lib/system/eventLog';
import { decideEmailRoute, describeEmailSkip, type EmailRoute, type EmailSkipReason } from './emailPolicy';
import { emailConfigured, sendEmail, sendSlack, sendTelegram, sendWebhook, sendWhatsapp } from './channels';
import { insertNotification } from './store';
import type { ChannelResult, Notification, NotificationPayload } from './types';

export interface ChannelConfig {
  /** External email recipient, or false/undefined to skip email. */
  email?: string | false;
  /** Why email is not being sent, when it is not (recorded so the user can see it). */
  emailSkipped?: EmailSkipReason;
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
    const result = await sendEmail(channels.email, payload);
    results.push(result);
    await recordEmailOutcome(userId, channels.email, result);
  } else if (channels.emailSkipped) {
    await recordAlertEmailResult(userId, { status: 'skipped', detail: describeEmailSkip(channels.emailSkipped) });
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

  const route = await resolveEmailRoute(userId);
  const email = route.kind === 'send' ? route.to : false;
  const emailSkipped = route.kind === 'skip' ? route.reason : undefined;

  return { email, emailSkipped, webhook, slack, telegram, whatsapp };
}

/** The address alert emails go to: the Clerk primary email when hosted, `ALERT_EMAIL_TO` when self-hosting. */
export async function resolveAlertEmailAddress(userId: string): Promise<string | null> {
  if (isHosted()) return resolveClerkEmail(userId);
  return process.env.ALERT_EMAIL_TO?.trim() || null;
}

/** Whether an alert email will be sent, to which address, or why not. Reads the user's setting (on by default). */
export async function resolveEmailRoute(userId: string): Promise<EmailRoute> {
  const { enabled } = await getEmailAlertSettings(userId).catch(() => ({ enabled: true }));
  const providerConfigured = emailConfigured();
  // Only look the address up when it could be used: a hosted lookup is a network call.
  const address = enabled && providerConfigured ? await resolveAlertEmailAddress(userId) : null;
  return decideEmailRoute({ enabled, providerConfigured, address });
}

/** Records the outcome for the user and logs a failure; never throws, so recording cannot lose a notification. */
async function recordEmailOutcome(userId: string, to: string, result: ChannelResult): Promise<void> {
  if (result.status === 'sent') return void (await recordAlertEmailResult(userId, { status: 'sent', detail: null }));
  if (result.status === 'skipped') return void (await recordAlertEmailResult(userId, { status: 'skipped', detail: result.detail ?? null }));
  await recordAlertEmailResult(userId, { status: 'failed', detail: result.detail ?? 'unknown error' });
  await logEvent({ level: 'error', source: 'alerts:email', message: `Alert email to ${maskEmail(to)} failed: ${result.detail ?? 'unknown error'}` });
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
