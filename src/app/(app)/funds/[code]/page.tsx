import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DataUnavailable } from '@/components/common/DataUnavailable';
import { FundPeers } from '@/components/funds/FundPeers';
import { FundChartPanel } from '@/components/funds/FundChartPanel';
import { MetricsStrip } from '@/components/funds/MetricsStrip';
import { FundXRay } from '@/components/funds/FundXRay';
import { getUserAiConfig, resolveHasAiKey } from '@/lib/ai/userAiConfig';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getFund, getFundFacets, getFundNav, getFundPeers } from '@/lib/funds/api';
import { buildXray } from '@/lib/funds/xray';
import { currentWriteUp } from '@/lib/funds/xrayCache';
import { loadHoldings, xrayInputHash } from '@/lib/funds/xrayServer';
import { getCachedInsight } from '@/lib/insights';
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

  const userId = await getCurrentUserId();
  const [fund, navSeries, peerList, holdings, hasKey, cachedXray] = await Promise.all([
    getFund(code),
    getFundNav(code, '1y'),
    getFundPeers(code),
    // The X-Ray reads the signed-in user's holdings; if they are slow or cannot be read, the rest of the page still renders.
    userId ? loadHoldings(userId).catch(() => null) : Promise.resolve(null),
    userId ? resolveHasAiKey(getUserAiConfig(userId)) : Promise.resolve(false),
    userId ? getCachedInsight('fund_xray', String(code), userId).catch(() => null) : Promise.resolve(null),
  ]);
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

  // The Mitra write-up is shown only while it was made from these same findings.
  const xray = userId ? buildXray(fund, peers, holdings) : null;
  const writeUp = xray ? currentWriteUp(cachedXray?.content, xrayInputHash(xray.items)) : null;

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

      <div className={userId ? styles.top : undefined}>
        <FundChartPanel schemeCode={fund.scheme_code} initialSeries={nav} />
        {xray && (
          <FundXRay schemeCode={fund.scheme_code} fundName={fund.base_name} items={xray.items} initial={writeUp} hasKey={hasKey} />
        )}
      </div>
      <MetricsStrip fund={fund} />
      <FundPeers peers={peers} group={fund.peer_group} />

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
