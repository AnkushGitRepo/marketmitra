import styles from './Onboarding.module.css';

export const WIZARD_STEPS = ['Risk profile', 'Holdings', 'AI key'] as const;

interface WizardHeaderProps {
  /** 0-based index of the current step. */
  readonly step: number;
  readonly onSkipSetup: () => void;
  readonly onDemo: () => void;
  readonly busy: boolean;
}

/** Brand, the segmented progress bar (the first segment, "Account created", is already filled) and the two escape hatches. */
export function WizardHeader({ step, onSkipSetup, onDemo, busy }: WizardHeaderProps) {
  const segments = ['Account created', ...WIZARD_STEPS];
  return (
    <header>
      <div className={styles.topbar}>
        <span className={styles.brand}>MarketMitra</span>
        <div className={styles.topActions}>
          <button type="button" className={styles.secondary} onClick={onDemo} disabled={busy}>
            Explore demo portfolio
          </button>
          <button type="button" className={styles.link} onClick={onSkipSetup} disabled={busy}>
            Skip setup
          </button>
        </div>
      </div>
      <ol className={styles.progress} aria-label={`Setup progress, step ${step + 1} of ${WIZARD_STEPS.length}`}>
        {segments.map((label, i) => {
          const state = i === 0 || i <= step ? 'done' : i === step + 1 ? 'current' : 'todo';
          const cls = [styles.segment, state === 'done' ? styles.segmentDone : '', state === 'current' ? styles.segmentCurrent : ''].join(' ');
          return (
            <li key={label} className={cls} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={styles.bar} />
              <span>{label}{state === 'done' ? ' ✓' : ''}</span>
            </li>
          );
        })}
      </ol>
    </header>
  );
}
