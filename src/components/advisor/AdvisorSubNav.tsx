'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './advisor.module.css';

const LINKS = [
  { href: '/dashboard/advisor', label: 'This month' },
  { href: '/dashboard/advisor/screen', label: 'Screen' },
  { href: '/dashboard/advisor/research', label: 'Research' },
  { href: '/dashboard/advisor/journal', label: 'Journal' },
  { href: '/dashboard/advisor/policy', label: 'Policy' },
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
