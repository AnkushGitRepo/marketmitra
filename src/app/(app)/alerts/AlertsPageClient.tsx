'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AlertRow, type RowKind } from '@/components/alerts/AlertRow';
import { AlertSettingsDrawer } from '@/components/alerts/AlertSettingsDrawer';
import { EmailAlertsCard } from '@/components/alerts/EmailAlertsCard';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import type { Alert } from '@/lib/alerts/types';
import type { EmailAlertStatus } from '@/lib/notifications/emailStatus';
import type { NotificationChannelSettingsView } from '@/lib/userSettings';
import { AlertForm } from './AlertForm';
import {
  GROUP_LABEL,
  GROUP_ORDER,
  TAB_LABEL,
  alertGroup,
  alertTitle,
  defaultTab,
  filterAlerts,
  guardrailBanner,
  splitSections,
  tabCounts,
  visibleTabs,
  type AlertGroupKey,
  type AlertTab,
} from './alertView';
import { GuardrailsToggle } from './GuardrailsToggle';
import { NotificationChannelsCard } from './NotificationChannelsCard';
import styles from './page.module.css';

interface AlertsPageClientProps {
  alerts: Alert[];
  /** From `?new=1&symbol=…` on the stock page's "Set alert" button. */
  openNew: boolean;
  /** From `?settings=1`, the link in Settings -> Alerts & Channels. */
  openSettings?: boolean;
  prefillSymbol?: string;
  channelsView: NotificationChannelSettingsView | null;
  encConfigured: boolean;
  autoGuardrailsEnabled: boolean;
  emailStatus: EmailAlertStatus | null;
  /** The server's clock, so "triggered this week" is the same on the server and the client. */
  nowIso: string;
}

const SECTION_TITLE = { attention: 'Needs attention', monitoring: 'Active monitoring', paused: 'Paused', resolved: 'Earlier triggers' } as const;

export function AlertsPageClient({ alerts, openNew, openSettings = false, prefillSymbol, channelsView, encConfigured, autoGuardrailsEnabled, emailStatus, nowIso }: AlertsPageClientProps) {
  const router = useRouter();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const counts = useMemo(() => tabCounts(alerts), [alerts]);
  const [tab, setTab] = useState<AlertTab>(() => defaultTab(tabCounts(alerts)));
  const [group, setGroup] = useState<AlertGroupKey | 'all'>('all');
  const [text, setText] = useState('');
  const [creating, setCreating] = useState(openNew);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(openSettings);
  const [deleting, setDeleting] = useState<Alert | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groupsPresent = useMemo(() => GROUP_ORDER.filter((g) => alerts.some((a) => alertGroup(a) === g)), [alerts]);
  const filtered = useMemo(() => filterAlerts(alerts, { tab, group, text }), [alerts, tab, group, text]);
  const sections = useMemo(() => splitSections(filtered, now), [filtered, now]);
  const banner = guardrailBanner(autoGuardrailsEnabled);
  const filtersActive = group !== 'all' || text.trim() !== '';

  const mutate = async (id: string, init: RequestInit, failure: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/alerts/${id}`, init);
      if (res.ok) router.refresh();
      else setError(failure);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = (a: Alert, status: 'active' | 'paused') =>
    mutate(a.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }, 'Could not update that alert.');

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    await mutate(target.id, { method: 'DELETE' }, 'Could not delete that alert.');
  };

  const renderRows = (list: Alert[], kind: RowKind) =>
    list.map((a) =>
      editingId === a.id ? (
        <li key={a.id} className={styles.formCard}>
          <p className={styles.formCardTitle}>Edit alert</p>
          <AlertForm alert={a} onClose={() => setEditingId(null)} />
        </li>
      ) : (
        <AlertRow
          key={a.id}
          alert={a}
          kind={kind}
          busy={busyId === a.id}
          onEdit={() => setEditingId(a.id)}
          onPause={() => void setStatus(a, 'paused')}
          onResume={() => void setStatus(a, 'active')}
          onDelete={() => setDeleting(a)}
        />
      )
    );

  const blocks: { key: keyof typeof SECTION_TITLE; list: Alert[] }[] = [
    { key: 'attention', list: sections.attention },
    { key: 'monitoring', list: sections.monitoring },
    { key: 'paused', list: sections.paused },
    { key: 'resolved', list: sections.resolved },
  ];

  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Alerts</p>
          <h1 className={styles.h1}>Price &amp; portfolio alerts</h1>
        </div>
        <div className={styles.headActions}>
          <button type="button" className={styles.gearBtn} onClick={() => setSettingsOpen(true)}>
            <span aria-hidden="true">⚙</span> Alert settings
          </button>
          {!creating && (
            <button type="button" className={styles.btnPrimary} onClick={() => setCreating(true)}>
              + New alert
            </button>
          )}
        </div>
      </div>

      <p className={`${styles.banner} ${banner.on ? '' : styles.bannerOff}`}>
        <span aria-hidden="true">{banner.on ? '🛡️' : '⚠️'}</span>
        <span>{banner.text}</span>
        <button type="button" className={styles.bannerLink} onClick={() => setSettingsOpen(true)}>
          Manage
        </button>
      </p>

      {creating && (
        <div className={styles.formCard}>
          <p className={styles.formCardTitle}>New alert</p>
          <AlertForm initialSymbol={prefillSymbol} onClose={() => setCreating(false)} />
        </div>
      )}

      {alerts.length === 0 && !creating ? (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>No alerts yet</p>
          <p className={styles.emptyText}>
            Create one to get notified (in MarketMitra and by email) when a stock crosses a price, moves sharply, hits a 52-week extreme, or
            your portfolio P&amp;L crosses a level.
          </p>
        </div>
      ) : (
        alerts.length > 0 && (
          <>
            <div className={styles.filterBar}>
              <div className={styles.tabs} role="tablist" aria-label="Alert status">
                {visibleTabs(counts, tab).map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={t === tab} className={`${styles.tab} ${t === tab ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
                    {TAB_LABEL[t]} <span className={styles.count}>{counts[t]}</span>
                  </button>
                ))}
              </div>
              <select className={styles.select} value={group} onChange={(e) => setGroup(e.target.value as AlertGroupKey | 'all')} aria-label="Filter by alert type">
                <option value="all">All types</option>
                {groupsPresent.map((g) => (
                  <option key={g} value={g}>
                    {GROUP_LABEL[g]}
                  </option>
                ))}
              </select>
              <input type="search" className={`${styles.input} ${styles.search}`} placeholder="Search by ticker, e.g. TCS" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search alerts" />
              {filtersActive && (
                <button type="button" className={styles.linkButton} onClick={() => { setGroup('all'); setText(''); }}>
                  Clear filters
                </button>
              )}
            </div>

            {error && (
              <p className={styles.formError} role="alert">
                {error}
              </p>
            )}

            {filtered.length === 0 ? (
              <div className={styles.emptyCard}>
                <p className={styles.emptyTitle}>{filtersActive ? 'No alerts match these filters' : `No ${TAB_LABEL[tab].toLowerCase()} alerts`}</p>
                <p className={styles.emptyText}>
                  {filtersActive ? 'Try a different type or search.' : tab === 'active' ? 'Create an alert to start watching a stock, or check the Triggered tab for ones that have fired.' : 'Nothing here right now.'}
                </p>
              </div>
            ) : (
              blocks
                .filter((b) => b.list.length > 0)
                .map((b) => (
                  <section key={b.key} aria-label={SECTION_TITLE[b.key]}>
                    <h2 className={styles.sectionHead}>{SECTION_TITLE[b.key]}</h2>
                    <ul className={styles.list}>{renderRows(b.list, b.key)}</ul>
                  </section>
                ))
            )}
          </>
        )
      )}

      <AlertSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <EmailAlertsCard initial={emailStatus} />
        <GuardrailsToggle initialEnabled={autoGuardrailsEnabled} />
        <NotificationChannelsCard initialView={channelsView} encConfigured={encConfigured} />
      </AlertSettingsDrawer>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete alert?"
        message={deleting ? `"${alertTitle(deleting)}" will be removed. This cannot be undone.` : ''}
        confirmLabel="Delete alert"
        busy={busyId !== null}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
