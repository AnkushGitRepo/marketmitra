import { DISCLAIMER_SHORT } from '@/lib/advisor/disclaimer';
import styles from './advisor.module.css';

/** Shown at the top of every advisor page. */
export function DisclaimerBanner() {
  return (
    <p className={styles.banner} role="note">
      {DISCLAIMER_SHORT}
    </p>
  );
}
