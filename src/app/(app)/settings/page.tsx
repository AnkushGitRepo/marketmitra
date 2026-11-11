import { getCurrentUserId } from '@/lib/currentUserId';
import { isAdminUser } from '@/lib/auth/admin';
import { isEncKeyConfigured } from '@/lib/crypto';
import { isHosted } from '@/lib/deployment-mode';
import { getEmailAlertStatus } from '@/lib/notifications/emailStatus';
import { getPreferences } from '@/lib/preferences/store';
import { resolveTab } from '@/lib/settings/tabs';
import { getAiSettingsView, getAutoGuardrailsEnabled, getNotificationChannelSettingsView } from '@/lib/userSettings';
import { SettingsTabs } from '@/components/settings/SettingsTabs';
import pageStyles from './page.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Settings' };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={pageStyles.pageRoot}>
        <p className={pageStyles.introNote}>Sign in to manage settings.</p>
      </div>
    );
  }

  const { tab } = await searchParams;
  const [aiView, prefs, channelsView, guardrails, emailStatus] = await Promise.all([
    getAiSettingsView(userId).catch(() => null),
    getPreferences(userId),
    getNotificationChannelSettingsView(userId).catch(() => null),
    getAutoGuardrailsEnabled(userId).catch(() => true),
    getEmailAlertStatus(userId).catch(() => null),
  ]);

  return (
    <div className={pageStyles.pageRoot}>
      <p className={pageStyles.eyebrow}>Settings</p>
      <h1 className={pageStyles.h1}>Settings</h1>
      <p className={pageStyles.introNote}>Keys, preferences and your data, one section at a time.</p>

      <SettingsTabs
        initialTab={resolveTab({ query: tab })}
        hosted={isHosted()}
        isAdmin={isAdminUser(userId)}
        encConfigured={isEncKeyConfigured()}
        aiView={aiView}
        prefs={prefs}
        emailStatus={emailStatus}
        guardrailsEnabled={guardrails}
        channelsView={channelsView}
      />
    </div>
  );
}
