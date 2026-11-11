'use client';

import { useEffect, useState } from 'react';
import { AccountSection, LocalAccountSection } from '@/app/(app)/settings/AccountSection';
import { TokensSection } from '@/app/(app)/settings/TokensSection';
import { AboutSection } from '@/app/(app)/settings/DataAndAboutSections';
import { usePreferences } from '@/app/(app)/settings/usePreferenceSaver';
import type { EmailAlertStatus } from '@/lib/notifications/emailStatus';
import type { Preferences } from '@/lib/preferences/schema';
import { SETTINGS_TABS, resolveTab, tabAfterKey, type SettingsTab } from '@/lib/settings/tabs';
import type { AiSettingsView, NotificationChannelSettingsView } from '@/lib/userSettings';
import { AiPanel } from './AiPanel';
import { AlertsSummaryPanel } from './AlertsSummaryPanel';
import { DataPanel } from './DataPanel';
import { PreferencesPanel } from './PreferencesPanel';
import styles from './SettingsTabs.module.css';

interface SettingsTabsProps {
  readonly initialTab: SettingsTab;
  readonly hosted: boolean;
  readonly isAdmin: boolean;
  readonly encConfigured: boolean;
  readonly aiView: AiSettingsView | null;
  readonly prefs: Preferences;
  readonly emailStatus: EmailAlertStatus | null;
  readonly guardrailsEnabled: boolean;
  readonly channelsView: NotificationChannelSettingsView | null;
}

/** One tab at a time. The tab is kept in the URL, and the old in-page anchors (`#notifications`, `#ai`, …) still land on the right one. */
export function SettingsTabs({ initialTab, hosted, isAdmin, encConfigured, aiView, prefs: initialPrefs, emailStatus, guardrailsEnabled, channelsView }: SettingsTabsProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  // Preferences are shared by two tabs (Mitra permissions live under AI), so they are held here and survive switching.
  const { prefs, save, error, saved } = usePreferences(initialPrefs);

  // An old `#anchor` is only visible to the browser, so resolve it after mount (in a microtask, not synchronously in the effect).
  useEffect(() => {
    const wanted = resolveTab({ query: new URLSearchParams(window.location.search).get('tab'), hash: window.location.hash });
    if (wanted !== initialTab) void Promise.resolve().then(() => setTab(wanted));
  }, [initialTab]);

  const select = (next: SettingsTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    url.hash = '';
    window.history.replaceState(null, '', url);
  };

  return (
    <div className={styles.root}>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Settings sections"
        onKeyDown={(e) => {
          const next = tabAfterKey(tab, e.key);
          if (!next) return;
          e.preventDefault();
          select(next);
          document.getElementById(`settings-tab-${next}`)?.focus();
        }}
      >
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            id={`settings-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            aria-controls={`settings-panel-${t.id}`}
            tabIndex={t.id === tab ? 0 : -1}
            className={`${styles.tab} ${t.id === tab ? styles.tabActive : ''}`}
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id={`settings-panel-${tab}`} role="tabpanel" aria-labelledby={`settings-tab-${tab}`} className={styles.panel}>
        {tab === 'account' && (
          <>
            {hosted ? (
              <>
                <AccountSection />
                <TokensSection />
              </>
            ) : (
              <LocalAccountSection />
            )}
            <AboutSection hosted={hosted} isAdmin={isAdmin} />
          </>
        )}
        {tab === 'ai' && <AiPanel initialView={aiView} encConfigured={encConfigured} prefs={prefs} hosted={hosted} onPrefs={(patch) => void save(patch)} />}
        {tab === 'preferences' && <PreferencesPanel prefs={prefs} onPrefs={(patch) => void save(patch)} error={error} saved={saved} />}
        {tab === 'alerts' && <AlertsSummaryPanel emailStatus={emailStatus} guardrailsEnabled={guardrailsEnabled} channels={channelsView} />}
        {tab === 'data' && <DataPanel />}
      </div>
    </div>
  );
}
