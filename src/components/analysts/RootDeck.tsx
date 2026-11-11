import { agoLabel } from '@/lib/analysts/format';
import { deskHeadline, type DeskSummary } from '@/lib/analysts/desk';
import styles from './RootDeck.module.css';

interface RootDeckProps {
  readonly summary: DeskSummary;
  readonly now: Date;
  readonly used: number;
  readonly cap: number;
  /** Analysts that cannot be built before tomorrow's AI budget opens. */
  readonly waitingTomorrow: number;
  readonly busy: boolean;
  readonly onChat: () => void;
  readonly onBrief: () => void;
  readonly onRetryAll: () => void;
}

/** The Root Agent ("Mitra Portfolio CIO"): a deterministic read of the whole desk. Rendering it never calls an AI. */
export function RootDeck({ summary, now, used, cap, waitingTomorrow, busy, onChat, onBrief, onRetryAll }: RootDeckProps) {
  return (
    <section className={styles.deck} aria-label="Mitra Portfolio CIO">
      <div className={styles.top}>
        <div>
          <p className={styles.role}>Root agent</p>
          <h2 className={styles.name}>Mitra Portfolio CIO</h2>
        </div>
        <p className={styles.usage}>
          AI calls today: {used} of {cap}
        </p>
      </div>
      <p className={styles.headline}>{deskHeadline(summary)}</p>
      {summary.attention.length > 0 && (
        <ul className={styles.attention}>
          {summary.attention.slice(0, 4).map((a) => (
            <li key={a.symbol}>
              <strong>{a.symbol}</strong> {a.reason}
            </li>
          ))}
          {summary.attention.length > 4 && <li>and {summary.attention.length - 4} more</li>}
        </ul>
      )}
      {waitingTomorrow > 0 && (
        <p className={styles.budget}>
          {waitingTomorrow} {waitingTomorrow === 1 ? 'analyst' : 'analysts'} will wait for tomorrow’s AI budget ({used} of {cap} calls used today). Use <strong>Analyze now</strong> on a card to choose which one goes next.
        </p>
      )}
      {summary.stalled > 0 && (
        <p className={styles.budget}>
          {summary.stalled} {summary.stalled === 1 ? 'analyst is' : 'analysts are'} stalled, usually after a temporary error. Retry them all and the next sweep rebuilds them one at a time.
        </p>
      )}
      {summary.latest && (
        <p className={styles.latest}>
          Latest note, {agoLabel(summary.latest.ts, now)}: <strong>{summary.latest.symbol}</strong> {summary.latest.title}
        </p>
      )}
      <div className={styles.cta}>
        <button type="button" className={styles.chat} onClick={onChat}>
          Chat with Root Agent
        </button>
        <button type="button" className={styles.secondary} onClick={onBrief}>
          Read morning brief
        </button>
        {summary.stalled > 0 && (
          <button type="button" className={styles.secondary} disabled={busy} onClick={onRetryAll}>
            {busy ? 'Re-queuing…' : `Retry all stalled (${summary.stalled})`}
          </button>
        )}
        <span className={styles.ctaNote}>Next brief at 08:30 AM IST</span>
      </div>
      <p className={styles.sub}>
        Each holding gets its own analyst. It checks the stock every evening for free and only uses your AI key when something material happens.
      </p>
    </section>
  );
}
