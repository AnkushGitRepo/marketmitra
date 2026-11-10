import { getCurrentUserId } from '@/lib/currentUserId';
import { isEncKeyConfigured } from '@/lib/crypto';
import { getAiSettingsView } from '@/lib/userSettings';
import { SettingsClient } from './SettingsClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.introNote}>Sign in to manage settings.</p>
      </div>
    );
  }

  const view = await getAiSettingsView(userId).catch(() => null);
  const encConfigured = isEncKeyConfigured();

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>Settings</p>
      <h1 className={styles.h1}>AI provider key</h1>
      <p className={styles.introNote}>
        MarketMitra&rsquo;s AI insights run on <em>your</em> API key — nothing is charged by
        MarketMitra. Pick a provider, paste a key, and it&rsquo;s stored encrypted. Insights
        summarise public data only; they never give buy/sell advice.
      </p>
      <SettingsClient initialView={view} encConfigured={encConfigured} />
    </div>
  );
}
