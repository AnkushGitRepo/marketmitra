import { getCurrentUserId } from '@/lib/currentUserId';
import { isAdminUser } from '@/lib/auth/admin';
import { isEncKeyConfigured } from '@/lib/crypto';
import { isHosted } from '@/lib/deployment-mode';
import { getPreferences } from '@/lib/preferences/store';
import { getAiSettingsView, getAutoGuardrailsEnabled, getNotificationChannelSettingsView } from '@/lib/userSettings';
import { GuardrailsToggle } from '../alerts/GuardrailsToggle';
import { NotificationChannelsCard } from '../alerts/NotificationChannelsCard';
import { AccountSection, LocalAccountSection } from './AccountSection';
import { AboutSection, DataSection } from './DataAndAboutSections';
import { PreferencesSections } from './PreferencesSections';
import { SettingsClient } from './SettingsClient';
import pageStyles from './page.module.css';
import styles from './Settings.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Settings' };

const SECTIONS = [
  ['account', 'Account & security'],
  ['ai', 'AI & API keys'],
  ['chat', 'Mitra chat'],
  ['display', 'Display'],
  ['notifications', 'Notifications & alerts'],
  ['shortcuts', 'Keyboard shortcuts'],
  ['data', 'Data & privacy'],
  ['about', 'About'],
] as const;

export default async function SettingsPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={pageStyles.pageRoot}>
        <p className={pageStyles.introNote}>Sign in to manage settings.</p>
      </div>
    );
  }

  const encConfigured = isEncKeyConfigured();
  const [aiView, prefs, channelsView, guardrails] = await Promise.all([
    getAiSettingsView(userId).catch(() => null),
    getPreferences(userId),
    getNotificationChannelSettingsView(userId).catch(() => null),
    getAutoGuardrailsEnabled(userId).catch(() => true),
  ]);

  return (
    <div className={pageStyles.pageRoot}>
      <p className={pageStyles.eyebrow}>Settings</p>
      <h1 className={pageStyles.h1}>Settings</h1>
      <p className={pageStyles.introNote}>Keys, preferences and your data, in one place.</p>

      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="Settings sections">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`}>{label}</a>
          ))}
        </nav>

        <div className={styles.sections}>
          {isHosted() ? <AccountSection /> : <LocalAccountSection />}

          <section id="ai" className={styles.section} aria-labelledby="ai-title">
            <h2 id="ai-title" className={styles.sectionTitle}>AI &amp; API keys</h2>
            <p className={styles.sectionIntro}>
              MarketMitra&rsquo;s AI runs on <em>your</em> API key; nothing is charged by MarketMitra. The key is stored encrypted, used only on the server, and never shown again after you save it.
            </p>
            <SettingsClient initialView={aiView} encConfigured={encConfigured} />
          </section>

          <PreferencesSections initial={prefs} />

          <section id="notifications" className={styles.section} aria-labelledby="notif-title">
            <h2 id="notif-title" className={styles.sectionTitle}>Notifications &amp; alerts</h2>
            <p className={styles.sectionIntro}>Where alert notifications are delivered, and what is set up automatically for new holdings.</p>
            <GuardrailsToggle initialEnabled={guardrails} />
            <NotificationChannelsCard initialView={channelsView} encConfigured={encConfigured} />
          </section>

          <DataSection />
          <AboutSection hosted={isHosted()} isAdmin={isAdminUser(userId)} />
        </div>
      </div>
    </div>
  );
}
