import { isHosted } from '@/lib/deployment-mode';
import { canUsePrivilegedModes } from '@/lib/auth/privilegedModes';

// Mitra Advisor is an opt-in tool (docs/decisions/0035, 0070). It is switched on by an explicit server-side env flag, never by hostname
// sniffing. On a self-hosted install the flag is enough. On the hosted deployment it is refused for everyone except an admin
// (`ADMIN_USER_IDS`), so a stray env var cannot expose it to ordinary users; with no `userId` (the scheduler, an unauthenticated request)
// it is off there. Deliberately not a NEXT_PUBLIC_ var: client code gets the boolean from a server component.
export function isAdvisorEnabled(userId?: string | null): boolean {
  if (process.env.ADVISOR_MODE !== 'enabled') return false;
  return !isHosted() || canUsePrivilegedModes(userId);
}
