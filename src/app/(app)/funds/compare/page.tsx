import type { Metadata } from 'next';
import Link from 'next/link';
import { DataUnavailable } from '@/components/common/DataUnavailable';
import { CompareSync } from '@/components/funds/CompareSync';
import { CompareTable } from '@/components/funds/CompareTable';
import { getFund, getFundFacets } from '@/lib/funds/api';
import { MAX_COMPARE, parseCompareCodes } from '@/lib/funds/compare';
import type { FundDetail } from '@/lib/funds/types';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Compare funds' };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CompareFundsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = (await searchParams).codes;
  const codes = parseCompareCodes(Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null));

  const found = codes.length >= 2 ? await Promise.all(codes.map((code) => getFund(code))) : [];
  const funds = found.flatMap((fund): FundDetail[] => (fund ? [fund] : []));
  const missing = codes.filter((_, i) => found[i] === null);
  // The data service answers 404 for an unknown code and nothing at all when it is down; tell them apart.
  const serviceDown = missing.length > 0 && (await getFundFacets()).categories.length === 0;

  return (
    <div className={styles.pageRoot}>
      <Link href="/funds" className={styles.back}>← All funds</Link>
      <p className={styles.eyebrow}>Funds</p>
      <h1 className={styles.h1}>Compare funds</h1>

      {codes.length < 2 ? (
        <p className={styles.empty}>
          Pick two or three funds on the <Link href="/funds">screener</Link> and choose Compare side by side, or open a link like{' '}
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
          <p className={styles.intro}>
            The best figure in each row is marked. A tie, or a figure only one fund has, is not marked. A young fund shows a
            dash for any period longer than its history.
          </p>
          {new Set(funds.map((f) => `${f.plan}/${f.option}`)).size > 1 && (
            <p className={styles.intro}>
              These funds are not all the same plan and option, so costs and returns are not like for like (a Regular plan
              charges more than the Direct plan of the same fund).
            </p>
          )}
          <CompareTable funds={funds} />
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
