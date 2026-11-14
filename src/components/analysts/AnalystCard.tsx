import Link from 'next/link';
import { attentionReason, isStalled, menuActions, primaryAction, queueLabel, queueState, type RosterAnalyst } from '@/lib/analysts/desk';
import { agoLabel, statusView } from '@/lib/analysts/format';
import { CardMenu } from './CardMenu';
import styles from './AnalystDesk.module.css';

interface AnalystCardProps {
  readonly analyst: RosterAnalyst;
  readonly all: readonly RosterAnalyst[];
  readonly usage: { used: number; cap: number };
  readonly now: Date;
  readonly busy: string | null;
  readonly onRead: (symbol: string) => void;
  readonly onChat: (symbol: string) => void;
  readonly onAnalyze: (symbol: string) => void;
  readonly onSetStatus: (symbol: string, status: 'active' | 'paused') => void;
  readonly onRemove: (symbol: string) => void;
  /** When false, a card without a dossier offers Generate dossier instead of waiting on the schedule. */
  readonly auto: boolean;
}

const formatPrice = (n: number): string => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function AnalystCard({ analyst: a, all, usage, now, busy, auto, onRead, onChat, onAnalyze, onSetStatus, onRemove }: AnalystCardProps) {
  const attention = attentionReason(a, now);
  const queue = queueLabel(queueState(a, all, usage, auto));
  const stalled = isStalled(a);
  const needsKey = queue === 'Waiting for an AI key';
  const view = stalled
    ? { label: 'Dossier stalled', tone: 'warn' as const }
    : attention
      ? { label: 'Needs attention', tone: 'bad' as const }
      : queue
        ? { label: queue, tone: needsKey ? ('bad' as const) : queue.startsWith('Scheduled') || queue.startsWith('Daily') ? ('warn' as const) : ('wait' as const) }
        : statusView(a.status, a.statusNote);
  const primary = primaryAction(a, auto);
  const primaryBusy = busy === `analyze-${a.symbol}` || (primary.kind === 'resume' && busy === `status-${a.symbol}`);
  const runPrimary = () => {
    if (primary.kind === 'dossier') onRead(a.symbol);
    else if (primary.kind === 'resume') onSetStatus(a.symbol, 'active');
    else onAnalyze(a.symbol);
  };
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
        {primary.kind === 'key' ? (
          <Link href="/settings" className={styles.primary}>
            {primary.label}
          </Link>
        ) : (
          <button type="button" className={primary.kind === 'dossier' ? styles.outline : styles.primary} disabled={primaryBusy} onClick={runPrimary}>
            {primaryBusy ? 'Working…' : primary.label}
          </button>
        )}
        <button type="button" className={styles.outline} onClick={() => onChat(a.symbol)}>
          Chat
        </button>
        <CardMenu
          label={`More actions for ${a.symbol}`}
          items={menuActions(a)}
          disabled={busy === `status-${a.symbol}` || busy === `rm-${a.symbol}`}
          onSelect={(id) => (id === 'remove' ? onRemove(a.symbol) : onSetStatus(a.symbol, id === 'resume' ? 'active' : 'paused'))}
        />
      </div>
    </li>
  );
}
