import { AppShell } from '@/components/appshell/AppShell';
import { isAdvisorEnabled } from '@/lib/advisor/flag';
import { HostedClerkProvider } from '@/components/auth/HostedClerkProvider';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getPreferences } from '@/lib/preferences/store';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Never throws: falls back to defaults so a database hiccup cannot take every page down.
  const prefs = await getPreferences(await getCurrentUserId().catch(() => null));
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
