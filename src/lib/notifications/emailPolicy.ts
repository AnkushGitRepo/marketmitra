// When an alert email is sent, skipped or retried. Pure: no network, clock or storage, so each rule is easy to test.

export type EmailSkipReason = 'disabled' | 'provider_missing' | 'no_address';

export type EmailRoute = { readonly kind: 'send'; readonly to: string } | { readonly kind: 'skip'; readonly reason: EmailSkipReason };

export interface EmailRouteInput {
  /** The user's "email alerts" setting (on by default). */
  readonly enabled: boolean;
  /** An email provider key is present on the server. */
  readonly providerConfigured: boolean;
  /** The account address, when one could be resolved. */
  readonly address: string | null;
}

/** The user's choice is checked first, so "off" is never reported as a server problem. */
export function decideEmailRoute({ enabled, providerConfigured, address }: EmailRouteInput): EmailRoute {
  if (!enabled) return { kind: 'skip', reason: 'disabled' };
  if (!providerConfigured) return { kind: 'skip', reason: 'provider_missing' };
  const to = address?.trim();
  return to ? { kind: 'send', to } : { kind: 'skip', reason: 'no_address' };
}

const SKIP_TEXT: Record<EmailSkipReason, string> = {
  disabled: 'Email alerts are turned off for your account, so no email was sent.',
  provider_missing: 'This server has no email provider configured, so email cannot be sent.',
  no_address: 'No email address could be found for your account.',
};

/** Plain words for a skip, with the fix where it depends on how the app is run (hosted account vs your own server). */
export function describeEmailSkip(reason: EmailSkipReason, hosted = true): string {
  if (reason !== 'no_address') return SKIP_TEXT[reason];
  return hosted
    ? `${SKIP_TEXT.no_address} Add and verify one in your account settings.`
    : `${SKIP_TEXT.no_address} Set ALERT_EMAIL_TO in the server environment to receive alert emails.`;
}

/** Total tries (including the first) and the waits between them. Short enough to finish inside one cron run. */
export const EMAIL_ATTEMPTS = 3;
export const EMAIL_RETRY_DELAYS_MS: readonly number[] = [400, 1200];

export interface EmailErrorLike {
  readonly statusCode?: number;
  readonly name?: string;
  readonly message?: string;
}

const TRANSIENT_NAMES = new Set(['rate_limit_exceeded', 'application_error', 'internal_server_error', 'daily_quota_exceeded']);
const NETWORK_HINT = /fetch failed|network|timed? ?out|etimedout|econnreset|econnrefused|enotfound|socket hang up/i;

/** Retry rate limits, server errors and network trouble; never an invalid sender, a bad address or an unverified domain. */
export function isTransientEmailError(error: EmailErrorLike): boolean {
  if (error.statusCode !== undefined) return error.statusCode === 429 || error.statusCode >= 500;
  if (error.name && TRANSIENT_NAMES.has(error.name)) return true;
  return NETWORK_HINT.test(error.message ?? '');
}
