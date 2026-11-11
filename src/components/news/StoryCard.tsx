import type { NewsItem } from '@/lib/dashboard/newsApi';
import { relativeTime } from '@/lib/dashboard/relativeTime';
import { safeHref } from '@/lib/security/safeHref';
import { cleanExcerpt, TONE_VIEW } from '@/lib/news/feed';
import { classifyTopic, TOPIC_SHORT } from '@/lib/news/topics';
import { TickerPill } from './TickerPill';
import styles from './StoryCard.module.css';

const MAX_PILLS = 5;

interface StoryCardProps {
  readonly item: NewsItem;
  readonly heldSymbols: ReadonlySet<string>;
  /** The newest story, given larger type. */
  readonly hero?: boolean;
}

/** One headline with its excerpt, topic, source, time, tone badge and ticker pills. */
export function StoryCard({ item, heldSymbols, hero = false }: StoryCardProps) {
  const tone = TONE_VIEW[item.sentiment];
  const topic = classifyTopic(item);
  const excerpt = cleanExcerpt(item.summary, item.title, hero ? 320 : 200);

  return (
    <li className={`${styles.card} ${hero ? styles.hero : ''}`}>
      {hero && <p className={styles.kicker}>Latest</p>}
      <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className={styles.title}>
        {item.title}
      </a>
      {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
      <div className={styles.meta}>
        {topic && <span className={styles.topic}>{TOPIC_SHORT[topic]}</span>}
        <span>{item.source}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={item.published_at}>{relativeTime(item.published_at)}</time>
        <span className={`${styles.tone} ${styles[`tone_${item.sentiment}`]}`} title={tone.title}>
          <span aria-hidden="true">{tone.arrow}</span> {tone.label}
        </span>
      </div>
      {item.symbols.length > 0 && (
        <div className={styles.tickers}>
          {item.symbols.slice(0, MAX_PILLS).map((s) => (
            <TickerPill key={s} symbol={s} held={heldSymbols.has(s.toUpperCase())} />
          ))}
        </div>
      )}
    </li>
  );
}
