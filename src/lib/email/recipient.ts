import { isHosted } from '@/lib/deployment-mode';

export interface Recipient {
  readonly email: string;
  readonly name: string | null;
}

/** A hosted user's verified primary email and first name from Clerk; null if there isn't a verified one. */
export async function lookupClerkRecipient(userId: string): Promise<Recipient | null> {
  const { clerkClient } = await import('@clerk/nextjs/server');
  const user = await (await clerkClient()).users.getUser(userId);
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== 'verified') return null;
  return { email: primary.emailAddress, name: user.firstName || user.username || null };
}

/** Where an admin's own test emails go: their Clerk email when hosted, `ALERT_EMAIL_TO` when self-hosted. */
export async function resolveAdminRecipient(userId: string): Promise<string | null> {
  if (isHosted()) return (await lookupClerkRecipient(userId).catch(() => null))?.email ?? null;
  return process.env.ALERT_EMAIL_TO?.trim() || null;
}
