import { after } from 'next/server';
import { AppShell } from '@/components/appshell/AppShell';
import { isAdvisorEnabled } from '@/lib/advisor/flag';
import { HostedClerkProvider } from '@/components/auth/HostedClerkProvider';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getPreferences } from '@/lib/preferences/store';
import { maybeSendWelcome } from '@/lib/welcome';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Never throws: falls back to defaults so a database hiccup cannot take every page down.
  const userId = await getCurrentUserId().catch(() => null);
  const prefs = await getPreferences(userId);
  // New hosted users get a one-time welcome email, sent after the response so it can never slow or break a page.
  after(() => maybeSendWelcome(userId));
  return (
    <HostedClerkProvider>
      <AppShell
        advisorEnabled={isAdvisorEnabled()}
        shortcutsEnabled={prefs.shortcuts.enabled}
        hideValuesByDefault={prefs.display.hideValuesByDefault}
      >
        {children}
      </AppShell>
    </HostedClerkProvider>
  );
}
