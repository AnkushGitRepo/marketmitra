import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { AppShell } from '@/components/appshell/AppShell';
import { isAdvisorEnabled } from '@/lib/advisor/flag';
import { HostedClerkProvider } from '@/components/auth/HostedClerkProvider';
import { getCurrentUserId } from '@/lib/currentUserId';
import { resolveOnboardingGate } from '@/lib/onboarding/gate';
import { getPreferences, updatePreferences } from '@/lib/preferences/store';
import { maybeSendWelcome } from '@/lib/welcome';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Never throws: falls back to defaults so a database hiccup cannot take every page down.
  const userId = await getCurrentUserId().catch(() => null);
  const prefs = await getPreferences(userId);
  // First run (ADR 0075): a user with no holdings and no flag goes to the wizard; one who already has holdings is
  // stamped completed so this check stops touching the database for them.
  const gate = await resolveOnboardingGate(userId, prefs.onboarding);
  if (gate === 'redirect') redirect('/onboarding');
  if (gate === 'existing' && userId) after(() => updatePreferences(userId, { onboarding: { completed: true } }).then(() => undefined, () => undefined));
  // New hosted users get a one-time welcome email, sent after the response so it can never slow or break a page.
  after(() => maybeSendWelcome(userId));
  return (
    <HostedClerkProvider>
      <AppShell
        advisorEnabled={isAdvisorEnabled(userId)}
        shortcutsEnabled={prefs.shortcuts.enabled}
        hideValuesByDefault={prefs.display.hideValuesByDefault}
      >
        {children}
      </AppShell>
    </HostedClerkProvider>
  );
}
