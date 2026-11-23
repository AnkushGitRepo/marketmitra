import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { getCurrentUserId } from '@/lib/currentUserId';
import { isHosted } from '@/lib/deployment-mode';
import { listHoldings } from '@/lib/holdings';
import { getPreferences } from '@/lib/preferences/store';
import { getAiSettingsView } from '@/lib/userSettings';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Welcome' };

export default async function OnboardingPage() {
  const userId = await getCurrentUserId().catch(() => null);
  if (!userId) redirect('/sign-in');

  const [prefs, holdings, ai] = await Promise.all([
    getPreferences(userId),
    listHoldings(userId).catch(() => []),
    getAiSettingsView(userId).catch(() => null),
  ]);

  return (
    <OnboardingWizard
      initialRiskProfile={prefs.onboarding.riskProfile}
      initialHoldings={holdings.map(({ symbol, quantity, avgPrice }) => ({ symbol, quantity, avgPrice }))}
      savedProvider={ai?.provider ?? null}
      analystsActive={prefs.agents.auto}
      hosted={isHosted()}
    />
  );
}
