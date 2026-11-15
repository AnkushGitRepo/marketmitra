'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './advisor.module.css';

const LINKS = [
  { href: '/advisor/screen', label: 'Screen' },
  { href: '/advisor/research', label: 'Research' },
  { href: '/advisor/journal', label: 'Journal' },
  { href: '/advisor/performance', label: 'Performance' },
  { href: '/advisor/policy', label: 'Policy' },
] as const;

/** The overview page links to the deeper tools itself; on those tools this is the way back. */
export function AdvisorSubNav() {
  const pathname = usePathname();
  if (pathname === '/advisor') return null;
  return (
    <nav className={styles.subNav} aria-label="Advisor sections">
      <Link href="/advisor" className={styles.subLink}>
        ← Advisor
      </Link>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`${styles.subLink} ${pathname === l.href ? styles.subLinkActive : ''}`}
          aria-current={pathname === l.href ? 'page' : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
