import { isHosted } from '@/lib/deployment-mode';
import { buildWelcomeEmail } from '@/emails/emails';
import { isEmailConfigured, sendHtmlEmail } from '@/lib/email/send';
import { runWelcome } from './sendOnce';
import { mongoWelcomeStore } from './store';

// Per warm instance: once a user has been dealt with (sent, or not ours to send) don't touch the database
// again for them on every page load.
const handled = new Set<string>();

/** Looks up the signed-in user's name and verified primary email from Clerk (hosted only). */
async function lookupRecipient(userId: string): Promise<{ email: string; name: string | null } | null> {
  const { clerkClient } = await import('@clerk/nextjs/server');
  const user = await (await clerkClient()).users.getUser(userId);
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== 'verified') return null;
  return { email: primary.emailAddress, name: user.firstName || user.username || null };
}

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
      const recipient = await lookupRecipient(userId);
      if (!recipient) return false;
      const mail = buildWelcomeEmail({ firstName: recipient.name, appUrl: process.env.NEXT_PUBLIC_APP_URL || '', contactLine: process.env.EMAIL_CONTACT_LINE });
      return sendHtmlEmail({ to: recipient.email, ...mail });
    },
  });
  if (outcome !== 'failed') handled.add(userId);
}
