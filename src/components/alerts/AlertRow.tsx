'use client';

import { alertGroup, alertFacts, alertTitle } from '@/app/(app)/alerts/alertView';
import { alertStatusView, alertTypeLabel } from '@/app/(app)/alerts/alertText';
import { KebabMenu } from '@/components/common/KebabMenu';
import type { Alert } from '@/lib/alerts/types';
import styles from './AlertRow.module.css';

export type RowKind = 'attention' | 'monitoring' | 'paused' | 'resolved';

interface AlertRowProps {
  readonly alert: Alert;
  readonly kind: RowKind;
  readonly busy: boolean;
  readonly onEdit: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onDelete: () => void;
}

const BADGE_LABEL: Record<RowKind, string> = { attention: 'Triggered', monitoring: 'Active', paused: 'Paused', resolved: 'Triggered' };

/** One alert as a compact row (a card on phones): status and title, the numbers, and the actions. */
export function AlertRow({ alert, kind, busy, onEdit, onPause, onResume, onDelete }: AlertRowProps) {
  const facts = alertFacts(alert);
  const status = alertStatusView(alert);
  const isStop = alertGroup(alert) === 'stop';
  const badge = kind === 'monitoring' && status.label === 'Cooling down' ? 'Cooling down' : BADGE_LABEL[kind];

  return (
    <li className={`${styles.row} ${styles[kind]} ${kind === 'attention' && isStop ? styles.attentionStop : ''}`}>
      <div className={styles.main}>
        <div className={styles.top}>
          <span className={`${styles.badge} ${styles[`badge_${kind}`]}`}>{badge}</span>
          <span className={styles.tag}>{alertTypeLabel(alert.type)}</span>
          {alert.rearm && <span className={styles.tag}>Re-arms</span>}
        </div>
        <p className={styles.title}>{alertTitle(alert)}</p>
        {alert.note && <p className={styles.note}>{alert.note}</p>}
      </div>

      <dl className={styles.facts}>
        {facts.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.actions}>
        {alert.status === 'triggered' ? (
          <button type="button" className={styles.primary} disabled={busy} onClick={onResume}>
            Re-activate
          </button>
        ) : alert.status === 'active' ? (
          <button type="button" className={styles.secondary} disabled={busy} onClick={onPause}>
            Pause
          </button>
        ) : (
          <button type="button" className={styles.primary} disabled={busy} onClick={onResume}>
            Resume
          </button>
        )}
        <KebabMenu
          label={`More actions for ${alertTitle(alert)}`}
          disabled={busy}
          items={[
            { label: 'Edit', onSelect: onEdit },
            { label: 'Delete', onSelect: onDelete, danger: true },
          ]}
        />
      </div>
    </li>
  );
}
