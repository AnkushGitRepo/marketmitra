import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DataUnavailable } from '@/components/common/DataUnavailable';
import { FundPeers } from '@/components/funds/FundPeers';
import { FundStats } from '@/components/funds/FundStats';
import { NavChart } from '@/components/funds/NavChart';
import { getFund, getFundFacets, getFundNav, getFundPeers } from '@/lib/funds/api';
import { formatDate, formatNav } from '@/lib/funds/format';
import { parseSchemeCode } from '@/lib/funds/types';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface FundPageProps {
  readonly params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: FundPageProps): Promise<Metadata> {
  const code = parseSchemeCode((await params).code);
  const fund = code === null ? null : await getFund(code);
  return { title: fund ? `${fund.base_name} · Funds` : 'Fund' };
}

export default async function FundPage({ params }: FundPageProps) {
  const code = parseSchemeCode((await params).code);
  if (code === null) notFound();

  const [fund, navSeries, peerList] = await Promise.all([getFund(code), getFundNav(code, '1y'), getFundPeers(code)]);
  // A failed side request just leaves that block empty; the fund itself decides whether the page works.
  const nav = navSeries ?? [];
  const peers = peerList ?? [];
  if (!fund) {
    // The data service answers 404 for an unknown code and nothing at all when it is down; tell them apart.
    if ((await getFundFacets()).categories.length > 0) notFound();
    return (
      <div className={styles.pageRoot}>
        <Link href="/funds" className={styles.back}>← All funds</Link>
        <DataUnavailable>
          <p className={styles.unavailable}>This fund’s data did not load.</p>
        </DataUnavailable>
      </div>
    );
  }

  return (
    <div className={styles.pageRoot}>
      <Link href="/funds" className={styles.back}>← All funds</Link>

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{fund.fund_house}</p>
          <h1 className={styles.h1}>{fund.base_name}</h1>
          <div className={styles.badges}>
            <span className={styles.badge}>{fund.sub_category ?? fund.category}</span>
            {fund.sub_category && <span className={styles.badge}>{fund.category}</span>}
            <span className={styles.badge}>{fund.plan === 'direct' ? 'Direct' : 'Regular'} · {fund.option === 'growth' ? 'Growth' : fund.option === 'idcw' ? 'IDCW' : 'Other option'}</span>
          </div>
        </div>
        <div className={styles.navBox}>
          <p className={styles.nav}>{formatNav(fund.nav)}</p>
          <p className={styles.navDate}>NAV as of {formatDate(fund.nav_date)}</p>
        </div>
      </header>

      {!fund.is_active && (
        <p className={styles.dormant} role="status">
          This scheme has not reported a recent NAV; it may have been merged, wound up or closed. The figures below are from its last
          available data.
        </p>
      )}

      <NavChart schemeCode={fund.scheme_code} initialRange="1y" initialSeries={nav} />
      <FundStats fund={fund} />
      <FundPeers peers={peers} subCategory={fund.sub_category} />

      <p className={styles.ids}>
        AMFI scheme code {fund.scheme_code}
        {fund.isin_growth ? ` · ISIN ${fund.isin_growth}` : ''}
        {fund.isin_reinvest ? ` · ${fund.isin_reinvest} (reinvestment)` : ''}
      </p>
      <p className={styles.notice}>
        Past performance does not indicate future returns. This is reference data, not investment advice. NAVs come from AMFI; returns
        and ratios are our own calculation from daily NAV and can differ from a fund house or rating agency.
      </p>
    </div>
  );
}
