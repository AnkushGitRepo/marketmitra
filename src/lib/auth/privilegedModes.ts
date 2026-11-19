import { isAdminUser } from './admin';

/**
 * Whether `userId` may use the opt-in modes that carry investment-advice risk: Unrestricted Mitra (ADR 0054) and Mitra Advisor (ADR 0035).
 * Self-host: always (one local operator). Hosted: only a user listed in `ADMIN_USER_IDS`, which is closed by default (ADR 0032), so
 * ordinary hosted users never get them (ADR 0070). The id must come from the server session, never from a request body.
 */
export function canUsePrivilegedModes(userId: string | null | undefined): boolean {
  return isAdminUser(userId ?? null);
}
