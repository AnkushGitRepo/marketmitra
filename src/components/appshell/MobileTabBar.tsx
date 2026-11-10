'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChatIcon, DashboardIcon, MarketsIcon, MoreIcon, PortfolioIcon } from './NavIcons';
import { MoreSheet } from './MoreSheet';
import { isMoreActive } from './mobileNav';
import styles from './MobileTabBar.module.css';

/** Five slots: Dashboard, Portfolio, Mitra chat (elevated centre), Markets, More. Everything else is in the More sheet. */
export function MobileTabBar({ advisorEnabled = false }: { advisorEnabled?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const isDash = pathname === '/dashboard';
  const isPort = pathname.startsWith('/portfolio');
  const isChat = pathname === '/mitra';
  const isMarkets = pathname.startsWith('/markets') || pathname.startsWith('/stock');
  const isMore = isMoreActive(pathname, advisorEnabled);

  const tabClass = (active: boolean) => `${styles.tabItem} ${active ? styles.tabItemActive : ''}`;
  const go = (href: string) => () => router.push(href);

  return (
    <>
      <nav className={styles.tabBar} aria-label="Dashboard navigation">
        <button className={tabClass(isDash)} onClick={go('/dashboard')} type="button" aria-current={isDash ? 'page' : undefined}>
          <DashboardIcon />
          <span className={styles.tabLabel}>Dashboard</span>
        </button>
        <button className={tabClass(isPort)} onClick={go('/portfolio')} type="button" aria-current={isPort ? 'page' : undefined}>
          <PortfolioIcon />
          <span className={styles.tabLabel}>Portfolio</span>
        </button>
        <button
          className={`${styles.tabItem} ${styles.chatTab} ${isChat ? styles.chatTabActive : ''}`}
          onClick={go('/mitra')}
          type="button"
          aria-current={isChat ? 'page' : undefined}
          aria-label="Mitra chat"
        >
          <span className={styles.chatOrb}>
            <ChatIcon />
          </span>
          <span className={styles.tabLabel}>Mitra</span>
        </button>
        <button className={tabClass(isMarkets)} onClick={go('/markets')} type="button" aria-current={isMarkets ? 'page' : undefined}>
          <MarketsIcon />
          <span className={styles.tabLabel}>Markets</span>
        </button>
        <button className={tabClass(isMore || moreOpen)} onClick={() => setMoreOpen(true)} type="button" aria-haspopup="dialog" aria-expanded={moreOpen}>
          <MoreIcon />
          <span className={styles.tabLabel}>More</span>
        </button>
      </nav>
      <MoreSheet open={moreOpen} pathname={pathname} advisorEnabled={advisorEnabled} onClose={() => setMoreOpen(false)} />
    </>
  );
}
