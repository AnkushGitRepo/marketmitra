import { getCurrentUserId } from '@/lib/currentUserId';
import { listAlerts } from '@/lib/alerts/store';
import { isEncKeyConfigured } from '@/lib/crypto';
import { getAutoGuardrailsEnabled, getNotificationChannelSettingsView } from '@/lib/userSettings';
import { AlertsPageClient } from './AlertsPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; symbol?: string }>;
}) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.introNote}>Sign in to manage alerts.</p>
      </div>
    );
  }

  const { new: newParam, symbol } = await searchParams;
  let alerts: Awaited<ReturnType<typeof listAlerts>> = [];
  let channelsView: Awaited<ReturnType<typeof getNotificationChannelSettingsView>> | null = null;
  let autoGuardrailsEnabled = true;
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

  return (
    <AlertsPageClient
      alerts={alerts}
      openNew={newParam === '1' || newParam === 'true'}
      prefillSymbol={symbol?.toUpperCase()}
      channelsView={channelsView}
      encConfigured={isEncKeyConfigured()}
      autoGuardrailsEnabled={autoGuardrailsEnabled}
    />
  );
}
