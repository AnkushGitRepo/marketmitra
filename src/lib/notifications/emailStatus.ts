import { isHosted } from '@/lib/deployment-mode';
import { maskEmail } from '@/lib/email/send';
import { getEmailAlertSettings, type AlertEmailStatus } from '@/lib/userSettings';
import { emailConfigured } from './channels';
import { resolveAlertEmailAddress } from './deliver';
import { decideEmailRoute, describeEmailSkip, type EmailSkipReason } from './emailPolicy';

export interface EmailAlertStatus {
  readonly enabled: boolean;
  /** True when an alert email would actually be sent right now. */
  readonly deliverable: boolean;
  /** Why not, when it would not (`disabled` is the user's own choice). */
  readonly blockedBy: EmailSkipReason | null;
  /** The reason in plain words, with how to fix it for this deployment; null when nothing blocks it. */
  readonly blockedText: string | null;
  /** The address, masked (`a***@example.com`); null when none is known. */
  readonly maskedTo: string | null;
  readonly last: { readonly at: string; readonly status: AlertEmailStatus; readonly detail: string | null } | null;
}

/** What the user sees next to the "email me" switch. Never throws; unknowns read as "not deliverable". */
export async function getEmailAlertStatus(userId: string): Promise<EmailAlertStatus> {
  const { enabled, last } = await getEmailAlertSettings(userId).catch(() => ({ enabled: true, last: null }));
  const providerConfigured = emailConfigured();
  const address = providerConfigured ? await resolveAlertEmailAddress(userId).catch(() => null) : null;
  const route = decideEmailRoute({ enabled, providerConfigured, address });
  return {
    enabled,
    deliverable: route.kind === 'send',
    blockedBy: route.kind === 'skip' ? route.reason : null,
    blockedText: route.kind === 'skip' ? describeEmailSkip(route.reason, isHosted()) : null,
    maskedTo: address ? maskEmail(address) : null,
    last: last ? { at: last.at.toISOString(), status: last.status, detail: last.detail } : null,
  };
}
