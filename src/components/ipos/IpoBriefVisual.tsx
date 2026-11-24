import type { IpoBriefFacts } from '@/lib/dashboard/ipoBriefFacts';
import styles from './IpoBriefVisual.module.css';

interface IpoBriefVisualProps {
  readonly facts: IpoBriefFacts;
}

/** Fact tiles and subscription bars above the AI's sentences (#328). Every figure comes from the IPO record, none from the model. */
export function IpoBriefVisual({ facts }: IpoBriefVisualProps) {
  if (facts.tiles.length === 0 && facts.bars.length === 0) return null;
  return (
    <div className={styles.root}>
      {facts.tiles.length > 0 && (
        <dl className={styles.tiles}>
          {facts.tiles.map((t) => (
            <div key={t.key} className={`${styles.tile} ${t.tone ? styles[`tile_${t.tone}`] : ''}`}>
              <dt className={styles.label}>{t.label}</dt>
              <dd className={styles.value}>{t.value}</dd>
              {t.sub && <dd className={styles.sub}>{t.sub}</dd>}
            </div>
          ))}
        </dl>
      )}

      {facts.bars.length > 0 && (
        <div className={styles.bars} role="group" aria-label="Subscription by category, times the shares on offer">
          <p className={styles.barsTitle}>Subscription by category</p>
          {facts.bars.map((b) => (
            <div key={b.key} className={styles.barRow}>
              <span className={styles.barLabel}>{b.label}</span>
              <span className={styles.track} role="img" aria-label={`${b.label} ${b.display}${b.full ? ', fully subscribed' : ', not yet fully subscribed'}`}>
                <span className={`${styles.fill} ${b.full ? styles.fillFull : styles.fillOpen}`} style={{ width: `${Math.max(b.widthPct, 2)}%` }} />
                {facts.fullMarkPct !== null && <span className={styles.mark} style={{ left: `${facts.fullMarkPct}%` }} aria-hidden="true" />}
              </span>
              <span className={styles.barValue}>{b.display}</span>
            </div>
          ))}
          <p className={styles.barsNote}>The line marks 1x: every share in the category bid for once.</p>
        </div>
      )}
    </div>
  );
}
