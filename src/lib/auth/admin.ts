import { isHosted } from '@/lib/deployment-mode';

interface AdminContext {
  hosted: boolean;
  adminIds: string | undefined;
}

/** Whether `userId` may see operator-only data (the system event log).
 *
 * Self-hosted there is one operator, so everyone with access is the admin.
 * Hosted, sign-up is open to anyone, so "signed in" is not a privilege: only
 * ids listed in `ADMIN_USER_IDS` (comma-separated Clerk user ids) qualify, and
 * with none configured nobody does — closed by default. */
export function isAdminUser(
  userId: string | null,
  ctx: AdminContext = { hosted: isHosted(), adminIds: process.env.ADMIN_USER_IDS }
): boolean {
  if (!userId) return false;
  if (!ctx.hosted) return true;
  const allowed = (ctx.adminIds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(userId);
}
