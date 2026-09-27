'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Show } from '@clerk/nextjs';
import { isHosted } from '@/lib/deployment-mode';
import { Logo } from './Logo';
import styles from './Navbar.module.css';

const ALL_SCROLL_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
];

const GITHUB_REPO_URL = 'https://github.com/AnkushGitRepo/marketmitra';

function HostedNavCta() {
  return (
    <>
      <Show when="signed-out">
        <Link href="/sign-up" className={styles.cta}>
          Get Started
        </Link>
      </Show>
      <Show when="signed-in">
        <Link href="/dashboard" className={styles.cta}>
          Dashboard
        </Link>
      </Show>
    </>
  );
}

function GitHubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.34c-2.23.49-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.52.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hosted = isHosted();
  const scrollLinks = hosted ? ALL_SCROLL_LINKS : ALL_SCROLL_LINKS.filter((link) => link.href !== '#faq');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className={styles.outer}>
      <nav className={`${styles.inner} ${scrolled ? styles.scrolled : ''}`}>
        <Logo size={28} animated />
        <div className={styles.links}>
          <Link href="/dashboard">Dashboard</Link>
          {scrollLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>
        <div className={styles.actions}>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className={styles.ghost}
            aria-label="GitHub repository (opens in a new tab)"
          >
            <GitHubIcon />
            <span className={styles.ghostLabel} aria-hidden="true">
              GitHub
            </span>
          </a>
          {hosted ? (
            <HostedNavCta />
          ) : (
            <Link href="/dashboard" className={styles.cta}>
              Dashboard
            </Link>
          )}
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>
      <div className={`${styles.mobilePanel} ${menuOpen ? styles.open : ''}`}>
        <Link href="/dashboard" onClick={() => setMenuOpen(false)}>
          Dashboard
        </Link>
        {scrollLinks.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
