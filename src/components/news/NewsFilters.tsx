import { NEWS_TOPICS, TOPIC_LABEL, type NewsTopic } from '@/lib/news/topics';
import styles from './NewsFilters.module.css';

export type NewsView = 'all' | 'holdings';

interface NewsFiltersProps {
  readonly view: NewsView;
  readonly topic: NewsTopic | null;
  readonly holdingsCount: number;
  readonly onView: (view: NewsView) => void;
  readonly onTopic: (topic: NewsTopic | null) => void;
}

/** View tabs (all markets / my holdings) and topic chips in one compact block. */
export function NewsFilters({ view, topic, holdingsCount, onView, onTopic }: NewsFiltersProps) {
  return (
    <div className={styles.root}>
      <div className={styles.tabs} role="tablist" aria-label="News view">
        <button type="button" role="tab" aria-selected={view === 'all'} className={`${styles.tab} ${view === 'all' ? styles.active : ''}`} onClick={() => onView('all')}>
          All markets
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'holdings'}
          className={`${styles.tab} ${view === 'holdings' ? styles.active : ''}`}
          disabled={holdingsCount === 0}
          title={holdingsCount === 0 ? 'Add holdings to filter news to your portfolio' : undefined}
          onClick={() => onView('holdings')}
        >
          My holdings{holdingsCount > 0 ? ` (${holdingsCount})` : ''}
        </button>
      </div>
      <div className={styles.chips} role="group" aria-label="Topic">
        <button type="button" aria-pressed={topic === null} className={`${styles.chip} ${topic === null ? styles.chipActive : ''}`} onClick={() => onTopic(null)}>
          All
        </button>
        {NEWS_TOPICS.map((t) => (
          <button key={t} type="button" aria-pressed={topic === t} className={`${styles.chip} ${topic === t ? styles.chipActive : ''}`} onClick={() => onTopic(t)}>
            {TOPIC_LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
