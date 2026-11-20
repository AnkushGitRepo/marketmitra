import type { Metadata } from 'next';
import Link from 'next/link';
import { DataUnavailable } from '@/components/common/DataUnavailable';
import { CompareAdd } from '@/components/funds/CompareAdd';
import { CompareSummaryCard } from '@/components/funds/CompareSummaryCard';
import { CompareSync } from '@/components/funds/CompareSync';
import { CompareTable } from '@/components/funds/CompareTable';
import { GrowthRace } from '@/components/funds/GrowthRace';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getFund, getFundFacets } from '@/lib/funds/api';
import { MAX_COMPARE, parseCompareCodes } from '@/lib/funds/compare';
import { portfolioFits } from '@/lib/funds/compareFit';
import { compareSummary } from '@/lib/funds/compareSummary';
import type { FundDetail } from '@/lib/funds/types';
import { loadHoldings } from '@/lib/funds/xrayServer';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Compare funds' };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CompareFundsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = (await searchParams).codes;
  const codes = parseCompareCodes(Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null));

  const userId = await getCurrentUserId();
  const [found, holdings] = await Promise.all([
    codes.length >= 1 ? Promise.all(codes.map((code) => getFund(code))) : Promise.resolve([]),
    // The fit reads the signed-in user's holdings; if they are slow or cannot be read, the rest of the page still renders.
    userId && codes.length >= 2 ? loadHoldings(userId).catch(() => null) : Promise.resolve(null),
  ]);
  const funds = found.flatMap((fund): FundDetail[] => (fund ? [fund] : []));
  const missing = codes.filter((_, i) => found[i] === null);
  // The data service answers 404 for an unknown code and nothing at all when it is down; tell them apart.
  const serviceDown = missing.length > 0 && (await getFundFacets()).categories.length === 0;
  const ready = codes.length >= 2 && !serviceDown && missing.length === 0;

  const fits = ready ? portfolioFits(funds, holdings) : null;
  const summary = ready ? compareSummary(funds, fits) : [];
  // New funds are searched in the same plan and option as the ones already compared, so the comparison is like for like.
  const first = funds[0];
  const add = (
    <CompareAdd codes={ready ? codes : funds.map((f) => f.scheme_code)} plan={first?.plan ?? 'direct'} option={first?.option ?? 'growth'} />
  );

  return (
    <div className={styles.pageRoot}>
      <Link href="/funds" className={styles.back}>← All funds</Link>
      <div className={styles.titleRow}>
        <div>
          <p className={styles.eyebrow}>Funds · {Math.max(codes.length, funds.length)} of {MAX_COMPARE}</p>
          <h1 className={styles.h1}>Compare funds</h1>
        </div>
        {add}
      </div>

      {codes.length < 2 ? (
        <p className={styles.empty}>
          Add a fund with the button above, or pick funds on the <Link href="/funds">screener</Link>. A link looks like{' '}
          <code>/funds/compare?codes=122639,149329</code>. Up to {MAX_COMPARE} funds fit.
        </p>
      ) : serviceDown ? (
        <DataUnavailable>
          <p className={styles.empty}>The mutual fund data did not load.</p>
        </DataUnavailable>
      ) : missing.length > 0 ? (
        <p className={styles.empty}>No mutual fund with scheme code {missing.join(', ')}. Check the link, or pick funds on the <Link href="/funds">screener</Link>.</p>
      ) : (
        <>
          <CompareSummaryCard items={summary} />
          {/* Remounts when the funds change, so a new fund never shows the previous funds' chart. */}
          <GrowthRace key={codes.join(',')} funds={funds.map((f) => ({ code: f.scheme_code, name: f.base_name }))} />
          {new Set(funds.map((f) => `${f.plan}/${f.option}`)).size > 1 && (
            <p className={styles.intro}>
              These funds are not all the same plan and option, so costs and returns are not like for like (a Regular plan
              charges more than the Direct plan of the same fund).
            </p>
          )}
          <p className={styles.intro}>
            The best figure in each row is marked. A tie, or a figure only one fund has, is not marked. A young fund shows a
            dash for any period longer than its history.
          </p>
          <CompareTable funds={funds} fits={fits} addSlot={funds.length < MAX_COMPARE ? add : undefined} />
          <CompareSync items={funds.map((f) => ({ scheme_code: f.scheme_code, name: f.base_name }))} />
        </>
      )}

      <p className={styles.notice}>
        Past performance does not indicate future returns. This is reference data, not investment advice. Returns and ratios
        are our own calculation from the daily NAV AMFI publishes.
      </p>
    </div>
  );
}
