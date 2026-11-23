import { Logo } from '@/components/landing/Logo';
import { SparklesIcon } from './icons';
import styles from './Onboarding.module.css';

export const WIZARD_STEPS = ['Risk profile', 'Holdings', 'AI key'] as const;

interface WizardHeaderProps {
  /** 0-based index of the current step. */
  readonly step: number;
  readonly onSkipSetup: () => void;
  readonly onDemo: () => void;
  /** Jumps back to an earlier step; only offered for steps already done. */
  readonly onGoToStep: (step: number) => void;
  readonly busy: boolean;
}

/** Brand, the segmented progress bar (the first segment, "Account created", is already filled) and the two escape hatches. */
export function WizardHeader({ step, onSkipSetup, onDemo, onGoToStep, busy }: WizardHeaderProps) {
  const segments = ['Account created', ...WIZARD_STEPS];
  return (
    <header>
      <div className={styles.topbar}>
        <Logo />
        <div className={styles.topActions}>
          <button type="button" className={`${styles.secondary} ${styles.headerButton}`} onClick={onDemo} disabled={busy}>
            <SparklesIcon size={14} />
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
              {state === 'done' && !busy ? (
                <button type="button" className={styles.segmentButton} onClick={() => onGoToStep(Math.max(i - 1, 0))} aria-label={`Go back to ${label}`}>
                  <span className={styles.bar} />
                  <span>{label} ✓</span>
                </button>
              ) : (
                <>
                  <span className={styles.bar} />
                  <span>{label}{state === 'done' ? ' ✓' : ''}</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </header>
  );
}
