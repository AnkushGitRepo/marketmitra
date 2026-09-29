'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Alert, AlertStatus, AlertType } from '@/lib/alerts/types';
import type { NotificationChannelSettingsView } from '@/lib/userSettings';
import { AlertForm } from './AlertForm';
import { alertStatusView, alertTypeLabel, describeAlert, relativeTime } from './alertText';
import { GuardrailsToggle } from './GuardrailsToggle';
import { NotificationChannelsCard } from './NotificationChannelsCard';
import styles from './page.module.css';

type StatusFilter = 'all' | AlertStatus;

interface AlertsPageClientProps {
  alerts: Alert[];
  /** From `?new=1&symbol=…` on the stock page's "Set alert" button. */
  openNew: boolean;
  prefillSymbol?: string;
  channelsView: NotificationChannelSettingsView | null;
  encConfigured: boolean;
  autoGuardrailsEnabled: boolean;
}

export function AlertsPageClient({
  alerts,
  openNew,
  prefillSymbol,
  channelsView,
  encConfigured,
  autoGuardrailsEnabled,
}: AlertsPageClientProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(openNew);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | AlertType>('all');
  const [symbolFilter, setSymbolFilter] = useState('');

  const typesPresent = useMemo(() => {
    const seen = new Set<AlertType>();
    for (const a of alerts) seen.add(a.type);
    return [...seen].sort((a, b) => alertTypeLabel(a).localeCompare(alertTypeLabel(b)));
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    const symbolQuery = symbolFilter.trim().toUpperCase();
    return alerts.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (symbolQuery && !(a.symbol ?? '').toUpperCase().includes(symbolQuery)) return false;
      return true;
    });
  }, [alerts, statusFilter, typeFilter, symbolFilter]);

  const filtersActive = statusFilter !== 'all' || typeFilter !== 'all' || symbolFilter.trim() !== '';
  const clearFilters = () => {
    setStatusFilter('all');
    setTypeFilter('all');
    setSymbolFilter('');
  };

  const mutate = async (id: string, init: RequestInit) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/alerts/${id}`, init);
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = (a: Alert, status: 'active' | 'paused') =>
    mutate(a.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

  const remove = (a: Alert) => mutate(a.id, { method: 'DELETE' });

  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Alerts</p>
          <h1 className={styles.h1}>Price &amp; portfolio alerts</h1>
        </div>
        {!creating && (
          <button type="button" className={styles.btnPrimary} onClick={() => setCreating(true)}>
            New alert
          </button>
        )}
      </div>

      <p className={styles.introNote}>
        Checked about every 10 minutes during NSE market hours. Notifications always
        show up here in-app — connect Slack, Telegram, WhatsApp, or a custom webhook
        below to also get them there.
      </p>

      <GuardrailsToggle initialEnabled={autoGuardrailsEnabled} />
      <NotificationChannelsCard initialView={channelsView} encConfigured={encConfigured} />

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
            Create one to get notified when a stock crosses a price, moves sharply, hits a
            52-week extreme, or your portfolio P&amp;L crosses a level.
          </p>
        </div>
      ) : (
        <>
          {alerts.length > 0 && (
            <div className={styles.filterBar}>
              <div className={styles.filterGroup}>
                {(['all', 'active', 'paused', 'triggered'] as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`${styles.filterPill} ${statusFilter === s ? styles.filterPillActive : ''}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <select
                className={styles.select}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | AlertType)}
                aria-label="Filter by alert type"
              >
                <option value="all">All types</option>
                {typesPresent.map((t) => (
                  <option key={t} value={t}>
                    {alertTypeLabel(t)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                className={styles.input}
                placeholder="Filter by symbol…"
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
                aria-label="Filter by symbol"
              />
              {filtersActive && (
                <button type="button" className={styles.linkButton} onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          {filteredAlerts.length === 0 ? (
            <div className={styles.emptyCard}>
              <p className={styles.emptyTitle}>No alerts match these filters</p>
              <p className={styles.emptyText}>Try a different status, type, or symbol.</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {filteredAlerts.map((a) => {
            const status = alertStatusView(a);
            const isEditing = editingId === a.id;
            return (
              <li key={a.id} className={styles.card}>
                {isEditing ? (
                  <>
                    <p className={styles.formCardTitle}>Edit alert</p>
                    <AlertForm alert={a} onClose={() => setEditingId(null)} />
                  </>
                ) : (
                  <div className={styles.cardBody}>
                    <div className={styles.cardMain}>
                      <div className={styles.cardTopLine}>
                        <span className={`${styles.badge} ${styles[`badge_${status.tone}`]}`}>
                          {status.label}
                        </span>
                        <span className={styles.typeTag}>{alertTypeLabel(a.type)}</span>
                        {a.rearm && <span className={styles.typeTag}>Re-arms</span>}
                      </div>
                      <p className={styles.cardDesc}>{describeAlert(a)}</p>
                      {a.note && <p className={styles.cardNote}>{a.note}</p>}
                      <p className={styles.cardMeta}>
                        {a.lastEvaluatedAt
                          ? `Last checked ${relativeTime(a.lastEvaluatedAt)}`
                          : 'Not checked yet'}
                        {a.lastObservedValue !== null && (
                          <> · last value {a.lastObservedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</>
                        )}
                      </p>
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={busyId === a.id}
                        onClick={() => setEditingId(a.id)}
                      >
                        Edit
                      </button>
                      {a.status === 'active' ? (
                        <button type="button" className={styles.linkButton} disabled={busyId === a.id} onClick={() => setStatus(a, 'paused')}>
                          Pause
                        </button>
                      ) : (
                        <button type="button" className={styles.linkButton} disabled={busyId === a.id} onClick={() => setStatus(a, 'active')}>
                          {a.status === 'triggered' ? 'Re-activate' : 'Resume'}
                        </button>
                      )}
                      <button type="button" className={styles.linkButtonDanger} disabled={busyId === a.id} onClick={() => remove(a)}>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
