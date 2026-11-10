import { Resend } from 'resend';
import { DEFAULT_SENDER } from './diagnosis';
import { replyToFromEnv } from './replyTo';

// Resend's shared onboarding sender only delivers to the account owner; hosted needs a verified
// domain in ALERT_EMAIL_FROM (same setting the alert emails use, ADR 0014 amendment). See diagnosis.ts.

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export type SendResult = { readonly ok: true; readonly id: string | null } | { readonly ok: false; readonly error: string };

const MAX_ERROR_CHARS = 400;

/** Sends one email through Resend. Never throws; returns the provider's own error text on failure so it can be shown and logged. */
export async function sendHtmlEmail(email: OutgoingEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not set' };
  try {
    const { data, error } = await new Resend(apiKey).emails.send({
      from: process.env.ALERT_EMAIL_FROM || DEFAULT_SENDER,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: replyToFromEnv(),
    });
    if (error) return { ok: false, error: (error.message || error.name || 'provider error').slice(0, MAX_ERROR_CHARS) };
    return { ok: true, id: data?.id ?? null };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : 'unknown error').slice(0, MAX_ERROR_CHARS) };
  }
}

export interface VerifiedDomains {
  /** Names of verified domains, or null when they could not be fetched. */
  readonly domains: string[] | null;
  readonly error: string | null;
}

/** Which domains are verified in Resend (read-only). Never throws; times out so a status page can't hang. */
export async function fetchVerifiedDomains(timeoutMs = 5_000): Promise<VerifiedDomains> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { domains: null, error: 'no API key' };
  try {
    const result = await Promise.race([
      new Resend(apiKey).domains.list(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), timeoutMs)),
    ]);
    if (result.error) return { domains: null, error: result.error.message || 'provider error' };
    const list = result.data?.data ?? [];
    return { domains: list.filter((d) => d.status === 'verified').map((d) => d.name), error: null };
  } catch (e) {
    return { domains: null, error: e instanceof Error ? e.message : 'unknown error' };
  }
}

/** `a***@example.com`: enough to recognise an address in logs without storing it in full. */
export function maskEmail(address: string): string {
  const [local, domain] = address.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}
