import { Logo } from '@/components/landing/Logo';
import { completionHeadline, completionMessage, completionRecap, tickerStrip, type CompletionSummary } from '@/lib/onboarding/completion';
import type { RiskProfileId } from '@/lib/onboarding/profiles';
import type { AiProvider } from '@/lib/userSettings';
import { CheckIcon, KeyRoundIcon, ScaleIcon, UsersIcon } from './icons';
import styles from './Onboarding.module.css';

interface CompletionScreenProps {
  readonly summary: CompletionSummary;
  readonly risk: RiskProfileId | null;
  readonly provider: AiProvider | null;
  readonly symbols: readonly string[];
  readonly onNavigate: (href: string) => void;
}

const CARD_ICONS = [ScaleIcon, UsersIcon, KeyRoundIcon] as const;

/** The closing screen: what was configured, said plainly, and three places to go next. */
export function CompletionScreen({ summary, risk, provider, symbols, onNavigate }: CompletionScreenProps) {
  const cards = completionRecap(summary, risk, provider);
  const { shown, more } = tickerStrip(symbols);
  const hasHoldings = summary.holdings > 0;
  const go = (href: string, label: string, primary: boolean) => (
    <button type="button" className={primary ? styles.primary : styles.secondary} onClick={() => onNavigate(href)}>
      {label}
    </button>
  );

  return (
    <div className={styles.wizard}>
      <header className={styles.topbar}>
        <Logo />
        <span className={styles.doneChip}>
          <CheckIcon size={14} /> Setup complete
        </span>
      </header>
      <section className={`${styles.card} ${styles.doneCard}`} aria-live="polite">
        <span className={styles.doneBadge} aria-hidden="true">
          <CheckIcon size={26} />
        </span>
        <h1 className={styles.title}>{completionHeadline(summary)}</h1>
        <p className={styles.lead}>{completionMessage(summary)}</p>

        <ul className={styles.recap} aria-label="What you set up">
          {cards.map((card, i) => {
            const CardIcon = CARD_ICONS[i];
            return (
              <li key={card.title} className={styles.recapCard}>
                <span className={styles.recapTitle}>
                  <CardIcon size={14} /> {card.title}
                </span>
                <strong>{card.value}</strong>
                <ul className={styles.recapLines}>
                  {card.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>

        {hasHoldings && (
          <ul className={styles.tickers} aria-label="Your holdings">
            {shown.map((s) => (
              <li key={s} className={styles.tickerPill}>
                {s}
              </li>
            ))}
            {more > 0 && <li className={`${styles.tickerPill} ${styles.tickerMore}`}>+{more} more</li>}
          </ul>
        )}

        <div className={styles.launchBar}>
          {hasHoldings ? go('/agents', 'Open Analyst Desk', true) : go('/dashboard', 'Go to Dashboard', true)}
          {hasHoldings && go('/dashboard', 'Go to Dashboard', false)}
          {go('/portfolio', 'View Portfolio', false)}
        </div>
      </section>
    </div>
  );
}
