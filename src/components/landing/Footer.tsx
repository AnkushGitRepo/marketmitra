import Link from 'next/link';
import { isHosted } from '@/lib/deployment-mode';
import { Logo } from './Logo';
import styles from './Footer.module.css';

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.34c-2.23.49-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.52.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

const REPO = 'https://github.com/AnkushGitRepo/marketmitra';

const COLUMNS = [
  {
    label: 'Product',
    links: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '#features', label: 'Features' },
      { href: '#pricing', label: 'Hosted or self-host' },
      { href: `${REPO}/commits/main`, label: 'Changelog', external: true },
    ],
  },
  {
    label: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
  {
    label: 'Resources',
    links: [
      { href: `${REPO}#getting-started`, label: 'Getting started', external: true },
      { href: `${REPO}/tree/main/docs`, label: 'Docs', external: true },
      { href: '/dashboard/api', label: 'API reference' },
      { href: '/status', label: 'System status' },
      { href: '#faq', label: 'FAQ' },
      { href: `${REPO}/issues`, label: 'Support', external: true },
    ],
  },
  {
    label: 'Open source',
    links: [
      { href: REPO, label: 'GitHub repo', external: true },
      { href: '#pricing', label: 'Self-host it free' },
      { href: `${REPO}/issues`, label: 'Issues', external: true },
      { href: `${REPO}/blob/main/CONTRIBUTING.md`, label: 'Contributing', external: true },
      { href: `${REPO}/blob/main/LICENSE`, label: 'Licence', external: true },
      { href: `${REPO}/discussions`, label: 'Discussions', external: true },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  const hosted = isHosted();
  // #pricing and #faq only exist on the page in hosted mode — drop links to
  // them here rather than shipping dead anchors in selfhost mode.
  const columns = hosted
    ? COLUMNS
    : COLUMNS.map((col) => ({
        ...col,
        links: col.links.filter((link) => link.href !== '#pricing' && link.href !== '#faq'),
      }));

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.columns}>
          <div className={styles.brandCol}>
            <Logo size={28} onDark />
            <p>An open-source dashboard for people who want to understand their own investments.</p>
            <a href={REPO} target="_blank" rel="noreferrer" className={styles.repoLink}>
              <GitHubIcon />
              github.com/AnkushGitRepo/marketmitra
            </a>
          </div>
          {columns.map((col) => (
            <div key={col.label}>
              <div className={styles.colLabel}>{col.label}</div>
              <div className={styles.linkList}>
                {col.links.map((link) =>
                  'external' in link && link.external ? (
                    <a href={link.href} key={link.label} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  ) : link.href.startsWith('/') ? (
                    <Link href={link.href} key={link.label}>
                      {link.label}
                    </Link>
                  ) : (
                    <a href={link.href} key={link.label}>
                      {link.label}
                    </a>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.bottomBar}>
          <div>© {year} MarketMitra. MIT licensed. Not investment advice.</div>
          <div className={styles.socials}>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
