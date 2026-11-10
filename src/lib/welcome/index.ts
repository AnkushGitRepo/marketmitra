import { isHosted } from '@/lib/deployment-mode';
import { buildWelcomeEmail } from '@/emails/emails';
import { lookupClerkRecipient } from '@/lib/email/recipient';
import { isEmailConfigured, maskEmail, sendHtmlEmail } from '@/lib/email/send';
import { logEvent } from '@/lib/system/eventLog';
import { runWelcome } from './sendOnce';
import { mongoWelcomeStore } from './store';

// Per warm instance: once a user has been dealt with (sent, or not ours to send) don't touch the database
// again for them on every page load.
const handled = new Set<string>();

/**
 * Sends the one-time welcome email to a new hosted user, at most once. Safe to call on every
 * authenticated page render: it is a no-op for self-host, when email isn't configured, and for
 * users already handled. Never throws.
 */
export async function maybeSendWelcome(userId: string | null): Promise<void> {
  if (!userId || !isHosted() || !isEmailConfigured() || handled.has(userId)) return;

  const outcome = await runWelcome(userId, {
    store: mongoWelcomeStore,
    now: () => new Date(),
    send: async () => {
      const recipient = await lookupClerkRecipient(userId);
      if (!recipient) return { ok: false as const, error: 'no verified primary email on the account' };
      const mail = buildWelcomeEmail({ firstName: recipient.name, appUrl: process.env.NEXT_PUBLIC_APP_URL || '', contactLine: process.env.EMAIL_CONTACT_LINE });
      const result = await sendHtmlEmail({ to: recipient.email, ...mail });
      // Visible failure: this used to be swallowed, so undelivered welcome emails went unnoticed (#63).
      if (!result.ok) {
        await logEvent({ level: 'error', source: 'email:welcome', message: `Welcome email to ${maskEmail(recipient.email)} failed: ${result.error}` });
      }
      return result;
    },
  });
  if (outcome !== 'failed') handled.add(userId);
}
