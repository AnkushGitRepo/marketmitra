import { Resend } from 'resend';
import { replyToFromEnv } from '@/lib/email/replyTo';
import { retryWithBackoff } from '@/lib/net/retry';
import { EMAIL_ATTEMPTS, EMAIL_RETRY_DELAYS_MS, isTransientEmailError } from './emailPolicy';
import { isHosted } from '@/lib/deployment-mode';
import { describeOutboundError, safeOutboundFetch, type OutboundOptions } from '@/lib/security/outbound';
import type { ChannelResult, NotificationPayload } from './types';

const WEBHOOK_TIMEOUT_MS = 5_000;

// Resend's shared onboarding sender works with no domain verification, but
// only delivers to the Resend account owner's own address — fine for the
// self-host operator and for a first live test. Real multi-recipient
// sending (the hosted instance) needs a verified custom domain in
// `ALERT_EMAIL_FROM` (ADR 0014 amendment).
const DEFAULT_FROM = 'MarketMitra <onboarding@resend.dev>';

/** Hosted: https to public hosts only. Self-host: the operator may point at
 * their own http://localhost automation (n8n, etc.). */
export function outboundOptions(allowedHosts?: readonly string[]): OutboundOptions {
  const hosted = isHosted();
  return { allowHttp: !hosted, allowPrivate: !hosted, allowedHosts: hosted ? allowedHosts : undefined };
}

/** Slack incoming webhooks only ever live on this host. */
export const SLACK_WEBHOOK_HOSTS = ['hooks.slack.com'] as const;
export const TELEGRAM_TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{20,}$/;
export const TELEGRAM_CHAT_ID_RE = /^(-?\d{1,20}|@[A-Za-z0-9_]{5,32})$/;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://marketmitra-v2.vercel.app';

/** POST the notification to a user-supplied URL. Covers Telegram/Discord/
 * Slack incoming webhooks and is the zero-provider delivery path for
 * self-hosters (ADR 0014 §2). */
export async function sendWebhook(
  url: string,
  payload: NotificationPayload
): Promise<ChannelResult> {
  try {
    const response = await safeOutboundFetch(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: payload.kind,
          title: payload.title,
          body: payload.body,
          href: payload.href ?? null,
          meta: payload.meta ?? {},
        }),
      },
      { ...outboundOptions(), timeoutMs: WEBHOOK_TIMEOUT_MS }
    );
    await response.body?.cancel().catch(() => {});
    if (!response.ok) {
      return { channel: 'webhook', status: 'error', detail: `HTTP ${response.status}` };
    }
    return { channel: 'webhook', status: 'sent' };
  } catch (err) {
    return { channel: 'webhook', status: 'error', detail: describeOutboundError(err) };
  }
}

/** Slack incoming-webhook format — a plain `{text}` payload renders as a
 * message in the channel the webhook was created for. Real Slack markdown
 * (`*bold*`, `<url|label>` links), not the generic JSON `sendWebhook` posts. */
export async function sendSlack(webhookUrl: string, payload: NotificationPayload): Promise<ChannelResult> {
  const link = payload.href ? `${APP_URL}${payload.href}` : APP_URL;
  const text = `*${payload.title}*\n${payload.body}\n<${link}|Open in MarketMitra>`;
  try {
    const response = await safeOutboundFetch(
      webhookUrl,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) },
      { ...outboundOptions(SLACK_WEBHOOK_HOSTS), timeoutMs: WEBHOOK_TIMEOUT_MS }
    );
    await response.body?.cancel().catch(() => {});
    // Never echo the response body: for a user-supplied URL it would let them
    // read whatever answered (SSRF response exfiltration).
    if (!response.ok) return { channel: 'slack', status: 'error', detail: `HTTP ${response.status}` };
    return { channel: 'slack', status: 'sent' };
  } catch (err) {
    return { channel: 'slack', status: 'error', detail: describeOutboundError(err) };
  }
}

/** Escapes Telegram's Markdown v1 special characters in plain body text
 * (not in the link we build ourselves). The backslash is escaped too: left
 * alone, an input like `\_` would become `\\_`, whose first backslash escapes
 * the second and leaves the `_` free to open an italic span. */
export function escapeTelegramMarkdown(s: string): string {
  return s.replace(/([\\_*`[\]])/g, '\\$1');
}

/** Real Telegram Bot API `sendMessage` — the user's own bot token + the
 * chat id it should post to (get one by messaging the bot, then hitting
 * `https://api.telegram.org/bot<token>/getUpdates`). */
export async function sendTelegram(
  botToken: string,
  chatId: string,
  payload: NotificationPayload
): Promise<ChannelResult> {
  if (!TELEGRAM_TOKEN_RE.test(botToken) || !TELEGRAM_CHAT_ID_RE.test(chatId)) {
    return { channel: 'telegram', status: 'error', detail: 'Invalid Telegram bot token or chat id format' };
  }
  const link = payload.href ? `${APP_URL}${payload.href}` : APP_URL;
  const text = `*${escapeTelegramMarkdown(payload.title)}*\n${escapeTelegramMarkdown(payload.body)}\n[Open in MarketMitra](${link})`;
  try {
    const response = await safeOutboundFetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
      },
      { allowHttp: false, allowPrivate: false, allowedHosts: ['api.telegram.org'], timeoutMs: WEBHOOK_TIMEOUT_MS }
    );
    await response.body?.cancel().catch(() => {});
    if (!response.ok) return { channel: 'telegram', status: 'error', detail: `HTTP ${response.status}` };
    return { channel: 'telegram', status: 'sent' };
  } catch (err) {
    return { channel: 'telegram', status: 'error', detail: describeOutboundError(err) };
  }
}

/** There is no free, keyless WhatsApp send API — real delivery needs a
 * provisioned WhatsApp Business/Twilio number. This posts the same generic
 * JSON body as `sendWebhook` to a URL the user supplies: a Twilio Function,
 * a CallMeBot-style relay, or a Zapier/Make webhook that forwards to their
 * WhatsApp number. Not a built-in WhatsApp integration — the UI says so. */
export async function sendWhatsapp(webhookUrl: string, payload: NotificationPayload): Promise<ChannelResult> {
  const result = await sendWebhook(webhookUrl, payload);
  return { ...result, channel: 'whatsapp' };
}

/** True once an email provider has been provisioned (Vercel Marketplace —
 * see ADR 0014's open dependencies) and its key is in the environment. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Plain, transactional email body for one notification — no marketing. */
function renderEmail(payload: NotificationPayload): { subject: string; html: string; text: string } {
  const subject = `[MarketMitra] ${payload.title}`;
  const link = payload.href ? `${APP_URL}${payload.href}` : APP_URL;
  const kindLabel =
    { alert: 'Alert', ipo: 'IPO', insight: 'Insight', system: 'Notice' }[payload.kind] ?? 'Notice';

  const text = [
    `${kindLabel}: ${payload.title}`,
    '',
    payload.body,
    '',
    `Open: ${link}`,
    '',
    '— MarketMitra. Not investment advice. You get this because you set up an alert.',
  ].join('\n');

  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#16191c">
  <p style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#8a9299;margin:0 0 6px">${esc(kindLabel)}</p>
  <h1 style="font-size:19px;font-weight:600;margin:0 0 10px">${esc(payload.title)}</h1>
  <p style="font-size:14px;line-height:1.55;color:#4a5158;margin:0 0 18px">${esc(payload.body)}</p>
  <p style="margin:0 0 24px"><a href="${esc(link)}" style="display:inline-block;background:#16191c;color:#fff;text-decoration:none;border-radius:999px;padding:9px 20px;font-size:13px">Open MarketMitra</a></p>
  <p style="font-size:11.5px;color:#8a9299;margin:0">Not investment advice. You&rsquo;re receiving this because you set up an alert in MarketMitra.</p>
</div>`;

  return { subject, html, text };
}

class EmailSendError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly errName?: string
  ) {
    super(message);
  }
}

/**
 * Send one notification as an email via Resend (ADR 0014 §2). Never throws:
 * returns `skipped` when no `RESEND_API_KEY` is set (degrades to in-app +
 * webhook), `error` on a provider failure, `sent` otherwise.
 *
 * A transient failure (rate limit, 5xx, network) is retried with a short back-off, because the
 * alert has already been marked triggered by the time this runs: one dropped attempt would lose
 * the email for good. Permanent failures (invalid sender, unverified domain) are not retried.
 *
 * `ALERT_EMAIL_FROM` overrides the default sender — required for the hosted
 * instance (a verified domain); `onboarding@resend.dev` is fine for
 * self-host / a first test.
 */
export async function sendEmail(
  to: string,
  payload: NotificationPayload,
  options: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<ChannelResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { channel: 'email', status: 'skipped', detail: 'no email provider configured' };
  }

  const { subject, html, text } = renderEmail(payload);
  const resend = new Resend(apiKey);
  try {
    await retryWithBackoff(
      async () => {
        const { error } = await resend.emails.send({
          from: process.env.ALERT_EMAIL_FROM || DEFAULT_FROM,
          to,
          subject,
          html,
          text,
          replyTo: replyToFromEnv(),
        });
        if (error) {
          const e = error as { message?: string; name?: string; statusCode?: number | null };
          throw new EmailSendError(e.message || 'resend error', e.statusCode ?? undefined, e.name);
        }
      },
      {
        attempts: EMAIL_ATTEMPTS,
        delaysMs: EMAIL_RETRY_DELAYS_MS,
        sleep: options.sleep,
        shouldRetry: (e) =>
          e instanceof EmailSendError
            ? isTransientEmailError({ statusCode: e.statusCode, name: e.errName, message: e.message })
            : isTransientEmailError({ message: e instanceof Error ? e.message : String(e) }),
      }
    );
    return { channel: 'email', status: 'sent' };
  } catch (err) {
    return {
      channel: 'email',
      status: 'error',
      detail: err instanceof Error ? err.message : 'unknown error',
    };
  }
}
