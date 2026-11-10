// Explains, in plain words, whether outgoing email can reach real users (#63). Pure: the caller supplies the facts
// (env values, and the domains verified in the email provider if they could be fetched).

export type IssueSeverity = 'error' | 'warning' | 'info';
export type OverallStatus = 'ok' | 'warning' | 'error';

export interface EmailIssue {
  readonly severity: IssueSeverity;
  readonly message: string;
}

export interface EmailDiagnosis {
  readonly status: OverallStatus;
  readonly summary: string;
  readonly sender: string;
  readonly senderDomain: string | null;
  /** Domains verified in the provider, or null if that could not be checked. */
  readonly verifiedDomains: readonly string[] | null;
  readonly issues: readonly EmailIssue[];
}

export interface DiagnosisInput {
  readonly apiKeySet: boolean;
  /** The configured `ALERT_EMAIL_FROM`, if any. */
  readonly from: string | undefined;
  readonly contactLine: string | undefined;
  /** Verified domain names from the provider; null = could not be fetched. */
  readonly verifiedDomains: readonly string[] | null;
  readonly domainsError?: string | null;
}

export const DEFAULT_SENDER = 'MarketMitra <onboarding@resend.dev>';
const SHARED_DOMAIN = 'resend.dev';

/** Extracts the domain from `Name <a@b.com>` or `a@b.com`; null if it isn't a plausible address. */
export function senderDomain(from: string): string | null {
  const address = /<([^<>]+)>/.exec(from)?.[1] ?? from;
  const m = /^[^\s@<>]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})$/.exec(address.trim());
  return m ? m[1].toLowerCase() : null;
}

/** Shown instead of a configured value that isn't a sender address: it could be anything (even a pasted secret). */
export const HIDDEN_VALUE = '(invalid value, hidden)';

export function diagnoseEmailSetup(input: DiagnosisInput): EmailDiagnosis {
  const configured = input.from?.trim() || '';
  const domain = configured ? senderDomain(configured) : senderDomain(DEFAULT_SENDER);
  // SECURITY: never echo a config value that isn't a plausible sender address. A mis-pasted .env line can put a
  // secret in ALERT_EMAIL_FROM, and this diagnosis is shown in the admin UI and returned by an API.
  const sender = !configured ? DEFAULT_SENDER : domain ? configured : HIDDEN_VALUE;
  const issues: EmailIssue[] = [];

  if (!input.apiKeySet) {
    issues.push({ severity: 'error', message: 'RESEND_API_KEY is not set, so no email is sent at all.' });
  } else {
    if (!configured) {
      issues.push({
        severity: 'error',
        message:
          'ALERT_EMAIL_FROM is not set, so mail is sent from the shared test sender (onboarding@resend.dev). Resend only delivers that to the owner of the Resend account, so every other user silently gets nothing, including new-user welcome emails. Set ALERT_EMAIL_FROM to an address on a domain you have verified in Resend.',
      });
    } else if (!domain) {
      issues.push({ severity: 'error', message: 'ALERT_EMAIL_FROM is set but is not a valid sender address (its value is hidden here on purpose). Check the line for a typo or a merged line, and use name@yourdomain.com or "Name <name@yourdomain.com>".' });
    } else if (domain === SHARED_DOMAIN) {
      issues.push({ severity: 'error', message: 'The sender is on resend.dev, which only delivers to the owner of the Resend account. Use an address on your own verified domain.' });
    } else if (input.verifiedDomains !== null && !input.verifiedDomains.map((d) => d.toLowerCase()).includes(domain)) {
      const have = input.verifiedDomains.length > 0 ? ` Verified in Resend: ${input.verifiedDomains.join(', ')}.` : ' No domain is verified in Resend yet.';
      issues.push({ severity: 'error', message: `The sender domain "${domain}" is not verified in Resend, so it will refuse to send to other people.${have}` });
    }

    if (input.verifiedDomains === null) {
      const restricted = /restricted|permission|scope/i.test(input.domainsError ?? '');
      issues.push({
        severity: 'warning',
        message: restricted
          ? 'This Resend API key can only send mail, so it cannot list your verified domains. That is fine and safer; use "Send test" to confirm delivery for certain.'
          : `Couldn't check which domains are verified in Resend${input.domainsError ? ` (${input.domainsError})` : ''}. Use "Send test" to find out for certain.`,
      });
    }
  }

  if (!input.contactLine?.trim()) {
    issues.push({ severity: 'info', message: 'EMAIL_CONTACT_LINE is not set, so email footers show a default contact line. Set a real postal or contact line before any marketing email.' });
  }

  const status: OverallStatus = issues.some((i) => i.severity === 'error') ? 'error' : issues.some((i) => i.severity === 'warning') ? 'warning' : 'ok';
  const summary =
    status === 'ok'
      ? 'Email is set up to reach real users.'
      : status === 'error'
        ? 'Email will not reach most users. Fix the problems below.'
        : 'Email is probably fine, but something could not be confirmed.';

  return { status, summary, sender, senderDomain: domain, verifiedDomains: input.verifiedDomains, issues };
}
