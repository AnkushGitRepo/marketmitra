import Link from 'next/link';
import styles from './Hero.module.css';

export function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.badge}>
        <span className={styles.badgeDot} />
        Open source · self-host or use hosted
      </div>
      <h1 className={styles.headline}>See your whole portfolio clearly</h1>
      <p className={styles.subhead}>
        MarketMitra brings every holding into one dashboard, updates it in real time, and explains
        what actually moved your money today.
      </p>
      <div className={styles.ctaRow}>
        <Link href="/sign-up" className={styles.primary}>
          Get Started free
        </Link>
        <Link href="/dashboard" className={styles.secondary}>
          See the dashboard
        </Link>
      </div>
    </header>
  );
}
