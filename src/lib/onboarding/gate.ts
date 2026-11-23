import { listHoldings } from '@/lib/holdings';
import type { Preferences } from '@/lib/preferences/schema';
import { shouldOnboard } from './state';

/** `redirect`: send to the wizard. `existing`: already has holdings, so stamp them completed and never ask. `skip`: do nothing. */
export type OnboardingGate = 'redirect' | 'existing' | 'skip';

/** Runs in the app layout on every page, so it only touches the database for a user with no flag set, and it never throws. */
export async function resolveOnboardingGate(userId: string | null, onboarding: Preferences['onboarding']): Promise<OnboardingGate> {
  if (!userId || onboarding.completed || onboarding.dismissed) return 'skip';
  const holdingsCount = await listHoldings(userId).then((h) => h.length, () => null);
  if (holdingsCount !== null && holdingsCount > 0) return 'existing';
  return shouldOnboard({ holdingsCount, completed: onboarding.completed, dismissed: onboarding.dismissed }) ? 'redirect' : 'skip';
}
