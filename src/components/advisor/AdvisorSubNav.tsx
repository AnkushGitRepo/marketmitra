'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './advisor.module.css';

const LINKS = [
  { href: '/advisor', label: 'This month' },
  { href: '/advisor/screen', label: 'Screen' },
  { href: '/advisor/research', label: 'Research' },
  { href: '/advisor/journal', label: 'Journal' },
  { href: '/advisor/performance', label: 'Performance' },
  { href: '/advisor/policy', label: 'Policy' },
] as const;

export function AdvisorSubNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.subNav} aria-label="Advisor sections">
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
