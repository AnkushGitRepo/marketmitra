import { RISK_PROFILE_IDS, RISK_PROFILES, type RiskProfileId } from '@/lib/onboarding/profiles';
import { ScaleIcon, ShieldCheckIcon, TrendingUpIcon } from './icons';
import styles from './Onboarding.module.css';

const ICONS: Record<RiskProfileId, () => React.JSX.Element> = {
  conservative: () => <ShieldCheckIcon size={20} />,
  balanced: () => <ScaleIcon size={20} />,
  aggressive: () => <TrendingUpIcon size={20} />,
};

interface RiskStepProps {
  readonly value: RiskProfileId;
  readonly onChange: (id: RiskProfileId) => void;
}

/** Step 1. Every figure shown here is one the app really applies (alert percentages, concentration warning). */
export function RiskStep({ value, onChange }: RiskStepProps) {
  return (
    <>
      <p className={styles.eyebrow}>Step 1 of 3</p>
      <h1 className={styles.title}>How do you approach risk?</h1>
      <p className={styles.lead}>
        This sets the default alerts we create for each stock you add, and when we flag one stock as too big a share of your portfolio. You can change it later.
      </p>
      <fieldset className={styles.cards}>
        <legend className={styles.srOnly}>Risk profile</legend>
        {RISK_PROFILE_IDS.map((id) => {
          const p = RISK_PROFILES[id];
          return (
            <label key={id} className={styles.choice}>
              <input type="radio" name="risk-profile" className={styles.radio} checked={value === id} onChange={() => onChange(id)} />
              <span className={`${styles.iconBadge} ${styles[`tone_${id}`]}`} aria-hidden="true">
                {ICONS[id]()}
              </span>
              <span className={styles.choiceTitle}>{p.label}</span>
              <span className={styles.note}>{p.summary}</span>
              <ul className={styles.choiceList}>
                <li>{p.trailPct}% trailing stop</li>
                <li>Drawdown alert at {p.drawdownPct}%</li>
                <li>Flag a stock above {p.maxPositionPct}% of the portfolio</li>
              </ul>
            </label>
          );
        })}
      </fieldset>
    </>
  );
}
