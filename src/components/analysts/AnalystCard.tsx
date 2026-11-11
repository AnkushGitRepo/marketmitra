import { attentionReason, queueLabel, queueState, type RosterAnalyst } from '@/lib/analysts/desk';
import { agoLabel, statusView } from '@/lib/analysts/format';
import styles from './AnalystDesk.module.css';

interface AnalystCardProps {
  readonly analyst: RosterAnalyst;
  readonly all: readonly RosterAnalyst[];
  readonly usage: { used: number; cap: number };
  readonly now: Date;
  readonly busy: string | null;
  readonly onRead: (symbol: string) => void;
  readonly onChat: (symbol: string) => void;
  readonly onSetStatus: (symbol: string, status: 'active' | 'paused') => void;
  readonly onRemove: (symbol: string) => void;
}

const formatPrice = (n: number): string => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function AnalystCard({ analyst: a, all, usage, now, busy, onRead, onChat, onSetStatus, onRemove }: AnalystCardProps) {
  const attention = attentionReason(a, now);
  const queue = queueLabel(queueState(a, all, usage));
  const view = attention ? { label: 'Needs attention', tone: 'bad' as const } : queue ? { label: queue, tone: a.statusNote && /AI key/i.test(a.statusNote) ? ('bad' as const) : ('wait' as const) } : statusView(a.status, a.statusNote);
  const up = (a.quote?.changePct ?? 0) >= 0;
  return (
    <li className={styles.card} data-attention={attention ? 'true' : undefined}>
      <div className={styles.cardHead}>
        <span className={styles.symbol}>{a.symbol}</span>
        <span className={styles.source}>{a.source === 'holding' ? 'Holding' : 'Watcher'}</span>
        <span className={`${styles.status} ${styles[`tone_${view.tone}`]}`}>{view.label}</span>
        <span className={styles.checked}>Checked {agoLabel(a.lastCheckedAt, now)}</span>
      </div>
      <div className={styles.facts}>
        {a.quote && (
          <span className={styles.price}>
            {formatPrice(a.quote.price)}
            {a.quote.changePct !== null && (
              <span className={up ? styles.up : styles.down}>
                {' '}
                <span aria-hidden="true">{up ? '▲' : '▼'}</span> {up ? '+' : ''}
                {a.quote.changePct.toFixed(2)}%
              </span>
            )}
          </span>
        )}
        <span className={styles.events}>
          {a.eventCount} {a.eventCount === 1 ? 'event' : 'events'} logged
        </span>
      </div>
      {attention && <p className={styles.reason}>{attention}</p>}
      {a.summary && <p className={styles.summaryText}>{a.summary}</p>}
      {a.latest && !attention ? (
        <p className={styles.latest}>
          <span className={styles.latestLabel}>Latest entry</span> {a.latest.title}
        </p>
      ) : (
        !a.latest && !attention && <p className={styles.latest}>{a.statusNote ?? 'No journal entries yet.'}</p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.link} onClick={() => onRead(a.symbol)}>
          Read dossier
        </button>
        <button type="button" className={styles.link} onClick={() => onChat(a.symbol)}>
          Chat with analyst
        </button>
        {a.status === 'paused' || a.status === 'error' ? (
          <button type="button" className={styles.link} disabled={busy === `status-${a.symbol}`} onClick={() => onSetStatus(a.symbol, 'active')}>
            Resume
          </button>
        ) : (
          <button type="button" className={styles.link} disabled={busy === `status-${a.symbol}`} onClick={() => onSetStatus(a.symbol, 'paused')}>
            Pause
          </button>
        )}
        {a.source === 'watcher' && (
          <button type="button" className={styles.linkDanger} disabled={busy === `rm-${a.symbol}`} onClick={() => onRemove(a.symbol)}>
            Remove
          </button>
        )}
      </div>
    </li>
  );
}
