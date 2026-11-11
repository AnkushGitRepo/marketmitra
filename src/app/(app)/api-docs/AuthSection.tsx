import styles from './page.module.css';

const AUTH_MODES: Array<{ title: string; who: string; how: string }> = [
  {
    title: 'Public & MCP',
    who: 'Market data endpoints and every MCP tool',
    how: 'No key. Fair-use rate limited per client.',
  },
  {
    title: 'Session cookie',
    who: 'Endpoints marked "session" (watchlists, portfolio, alerts, notes, Mitra)',
    how: 'Hosted: your signed-in Clerk session. Self-host: open, single local user.',
  },
  {
    title: 'Cron bearer',
    who: 'Scheduled jobs under /api/cron',
    how: 'Authorization: Bearer <CRON_SECRET>. Operator-only.',
  },
  {
    title: 'Personal access tokens',
    who: 'Programmatic access to your own data',
    how: 'Not available yet — tracked in issue #91.',
  },
];

export function AuthSection() {
  return (
    <section className={styles.authSection} aria-label="Authentication">
      <h2 className={styles.authTitle}>Authentication</h2>
      <ul className={styles.authGrid}>
        {AUTH_MODES.map((m) => (
          <li key={m.title} className={styles.authItem}>
            <p className={styles.authItemTitle}>{m.title}</p>
            <p className={styles.authItemWho}>{m.who}</p>
            <p className={styles.authItemHow}>{m.how}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
