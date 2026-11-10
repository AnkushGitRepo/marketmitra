import { Resend } from 'resend';

// Resend's shared onboarding sender only delivers to the account owner; hosted needs a verified
// domain in ALERT_EMAIL_FROM (same setting the alert emails use, ADR 0014 amendment).
const DEFAULT_FROM = 'MarketMitra <onboarding@resend.dev>';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/** Sends one email through Resend. Never throws; `true` only when the provider accepted it. */
export async function sendHtmlEmail(email: OutgoingEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: process.env.ALERT_EMAIL_FROM || DEFAULT_FROM,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    return !error;
  } catch {
    return false;
  }
}
