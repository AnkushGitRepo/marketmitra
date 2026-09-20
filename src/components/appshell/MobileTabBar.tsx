'use client';

import { usePathname, useRouter } from 'next/navigation';
import { DashboardIcon, PortfolioIcon, MarketsIcon, AlertsIcon, NewsIcon } from './NavIcons';
import styles from './MobileTabBar.module.css';

export function MobileTabBar() {
  const pathname = usePathname();
  const router = useRouter();

  const isDash = pathname === '/dashboard';
  const isPort = pathname.startsWith('/dashboard/portfolio');
  const isMarkets = pathname.startsWith('/dashboard/markets') || pathname.startsWith('/dashboard/stock');
  const isAlerts = pathname.startsWith('/dashboard/alerts');
  const isNews = pathname.startsWith('/dashboard/news');

  const tabClass = (active: boolean) => `${styles.tabItem} ${active ? styles.tabItemActive : ''}`;

  return (
    <nav className={styles.tabBar} aria-label="Dashboard navigation">
      <button className={tabClass(isDash)} onClick={() => router.push('/dashboard')} type="button">
        <DashboardIcon />
        <span className={styles.tabLabel}>Dashboard</span>
      </button>
      <button className={tabClass(isPort)} onClick={() => router.push('/dashboard/portfolio')} type="button">
        <PortfolioIcon />
        <span className={styles.tabLabel}>Portfolio</span>
      </button>
      <button className={tabClass(isMarkets)} onClick={() => router.push('/dashboard/markets')} type="button">
        <MarketsIcon />
        <span className={styles.tabLabel}>Markets</span>
      </button>
      <button className={tabClass(isAlerts)} onClick={() => router.push('/dashboard/alerts')} type="button">
        <AlertsIcon />
        <span className={styles.tabLabel}>Alerts</span>
      </button>
      <button className={tabClass(isNews)} onClick={() => router.push('/dashboard/news')} type="button">
        <NewsIcon />
        <span className={styles.tabLabel}>News</span>
      </button>
    </nav>
  );
}
