import { getCurrentUserId } from '@/lib/currentUserId';
import { listAlerts } from '@/lib/alerts/store';
import { isEncKeyConfigured } from '@/lib/crypto';
import { getAutoGuardrailsEnabled, getNotificationChannelSettingsView } from '@/lib/userSettings';
import { getEmailAlertStatus, type EmailAlertStatus } from '@/lib/notifications/emailStatus';
import { AlertsPageClient } from './AlertsPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; symbol?: string; settings?: string }>;
}) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.introNote}>Sign in to manage alerts.</p>
      </div>
    );
  }

  const { new: newParam, symbol, settings } = await searchParams;
  let alerts: Awaited<ReturnType<typeof listAlerts>> = [];
  let channelsView: Awaited<ReturnType<typeof getNotificationChannelSettingsView>> | null = null;
  let autoGuardrailsEnabled = true;
  let emailStatus: EmailAlertStatus | null = null;
  try {
    alerts = await listAlerts(userId);
  } catch {
    // Mongo unreachable — render the shell with an empty list rather than 500.
  }
  try {
    channelsView = await getNotificationChannelSettingsView(userId);
  } catch {
    // Same fallback as above.
  }
  try {
    autoGuardrailsEnabled = await getAutoGuardrailsEnabled(userId);
  } catch {
    // Same fallback — default to the on state rather than 500.
  }

  try {
    emailStatus = await getEmailAlertStatus(userId);
  } catch {
    // The card shows an "unavailable" note rather than the page failing.
  }

  return (
    <AlertsPageClient
      alerts={alerts}
      openNew={newParam === '1' || newParam === 'true'}
      openSettings={settings === '1' || settings === 'true'}
      prefillSymbol={symbol?.toUpperCase()}
      channelsView={channelsView}
      encConfigured={isEncKeyConfigured()}
      autoGuardrailsEnabled={autoGuardrailsEnabled}
      emailStatus={emailStatus}
      nowIso={new Date().toISOString()}
    />
  );
}
