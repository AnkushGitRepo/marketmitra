'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Suspense, use, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { PillTabs } from '@/components/dashboard-charts/PillTabs';
import { CompanyLogo } from '@/components/dashboard-charts/CompanyLogo';
import { NewsList } from '@/components/dashboard-charts/NewsList';
import { InsightCard } from '@/components/dashboard-charts/InsightCard';
import { ShareholdingBarChart } from '@/components/dashboard-charts/ShareholdingBarChart';
import { FileTypeIcon } from '@/components/dashboard-charts/FileTypeIcon';
import { useMask } from '@/lib/dashboard/MaskContext';
import { usePageContext } from '@/lib/dashboard/PageContext';
import { formatInr } from '@/lib/dashboard/format';
import type { CompanyOut, DocumentOut, PeerOut, PricePeriod, RatioOut } from '@/lib/dashboard/fundamentalsApi';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import type { Bar, RangeKey } from '@/lib/chart/bars';
import { formatRatioValue, stripCitationMarkers, type FinTable, type ShareholdingSeries } from '@/lib/dashboard/transforms';
import styles from './page.module.css';
import { safeHref } from '@/lib/security/safeHref';

const DOCS_COLLAPSED_COUNT = 4;

const SOURCE_LABELS: Record<string, string> = {
  tier1_nse_bse: 'NSE/BSE',
  tier2_yfinance: 'Yahoo Finance',
  tier3_screener: 'Screener.in',
};

type StatementKey = 'profit_and_loss' | 'balance_sheet' | 'cash_flow';

/** The chart's range tabs, mapped to the periods Mitra's page context knows. */
// Canvas chart: browser-only, so it's kept out of the server render + bundle.
const ProChart = dynamic(() => import('@/components/pro-chart/ProChart').then((m) => m.ProChart), {
  ssr: false,
  loading: () => <div className={styles.chartPlaceholder} aria-hidden="true" />,
});

const CONTEXT_PERIOD: Record<RangeKey, PricePeriod> = {
  '1M': '1mo',
  '3M': '6mo',
  '6M': '6mo',
  YTD: '1y',
  '1Y': '1y',
  '5Y': '5y',
  ALL: '5y',
};
const FIN_TABS: StatementKey[] = ['profit_and_loss', 'balance_sheet', 'cash_flow'];
const FIN_LABELS: Record<StatementKey, string> = {
  profit_and_loss: 'P&L',
  balance_sheet: 'Balance sheet',
  cash_flow: 'Cash flow',
};

interface StockPageClientProps {
  symbol: string;
  company: CompanyOut;
  ratios: RatioOut[];
  peers: PeerOut[];
  documents: DocumentOut[];
  news: NewsItem[];
  aiInsight: { hasKey: boolean; initial: { content: string; generatedAt: string } | null };
  shareholding: ShareholdingSeries[];
  financials: Record<StatementKey, FinTable>;
  bars: Bar[];
  /** Resolves when the live quote does (or falls back to the EOD close). */
  quote: Promise<HeaderQuote>;
}

function formatPeerValue(value: string | null, kind: 'inr' | 'inr_cr' | 'pct' | 'x'): string {
  if (value === null) return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  if (kind === 'inr') return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  if (kind === 'inr_cr') return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
  if (kind === 'x') return `${num.toFixed(1)}x`;
  return `${num.toFixed(2)}%`;
}

export interface HeaderQuote {
  latestClose: string | null;
  previousClose: string | null;
}

function LivePrice({ quote }: { quote: Promise<HeaderQuote> }) {
  const { masked } = useMask();
  const { latestClose, previousClose } = use(quote);
  const price = latestClose !== null ? Number(latestClose) : null;
  const prev = previousClose !== null ? Number(previousClose) : null;
  const change = price !== null && prev !== null ? price - prev : null;
  const changePct = change !== null && prev ? (change / prev) * 100 : null;
  const up = (change ?? 0) >= 0;

  return (
    <>
      <p className={styles.price}>{price !== null ? formatInr(price, 2, masked) : '—'}</p>
      {change !== null && changePct !== null ? (
        <p className={styles.priceChg} style={{ color: up ? 'var(--app-gain)' : 'var(--app-loss)' }}>
          {up ? '+' : ''}
          {change.toFixed(2)} ({up ? '+' : ''}
          {changePct.toFixed(2)}%)
        </p>
      ) : (
        <p className={styles.priceChg}>&nbsp;</p>
      )}
    </>
  );
}

export function StockPageClient({
  symbol,
  company,
  ratios,
  peers,
  documents,
  news,
  aiInsight,
  shareholding,
  financials,
  bars,
  quote,
}: StockPageClientProps) {
  const router = useRouter();
  const { setPageContext } = usePageContext();
  const [range, setRange] = useState<PricePeriod>('1y');
  const [fin, setFin] = useState<StatementKey>('profit_and_loss');
  const [showAllDocs, setShowAllDocs] = useState(false);

  // Publish what the user is looking at so Mitra (mounted as a shell
  // sibling, not a child of this page) can reference "this stock" /
  // "this timeframe" accurately (ADR 0022).
  useEffect(() => {
    setPageContext({ page: 'stock', ticker: symbol, range });
    return () => setPageContext(null);
  }, [symbol, range, setPageContext]);

  const finTable = financials[fin];

  const shQuarterCount = new Set(shareholding.flatMap((s) => s.points.map((p) => p.quarterEnd))).size;
  const aboutText = company.about ? stripCitationMarkers(company.about) : null;
  const sourceLabel = company.source_tier ? SOURCE_LABELS[company.source_tier] ?? null : null;
  const visibleDocuments = showAllDocs ? documents : documents.slice(0, DOCS_COLLAPSED_COUNT);

  return (
    <div className={styles.pageRoot}>
      <button type="button" className={styles.backButton} onClick={() => router.back()}>
        ← Back
      </button>

      <div className={styles.headRow}>
        <div className={styles.identity}>
          <div className={styles.logo}>
            <CompanyLogo symbol={symbol} size={40} />
          </div>
          <div>
            <h1 className={styles.h1}>{company.name}</h1>
            <p className={styles.meta}>
              {symbol} · NSE{company.industry ? ` · ${company.industry}` : ''}
            </p>
          </div>
        </div>
        <div className={styles.priceCol}>
          <Suspense
            fallback={
              <>
                <p className={styles.price}>—</p>
                <p className={styles.priceChg}>&nbsp;</p>
              </>
            }
          >
            <LivePrice quote={quote} />
          </Suspense>
          <button
            type="button"
            className={styles.setAlertButton}
            onClick={() => router.push(`/alerts?new=1&symbol=${encodeURIComponent(symbol)}`)}
          >
            + Set alert
          </button>
        </div>
      </div>

      <div className={styles.splitGrid}>
        {aboutText && (
          <div className={styles.cardPad}>
            <p className={styles.cardLabel} style={{ marginBottom: 10 }}>
              About
            </p>
            <p className={styles.aboutText}>{aboutText}</p>
            {sourceLabel && <p className={styles.sourceLine}>Source: {sourceLabel}</p>}
          </div>
        )}

        <div className={styles.cardPad}>
          <p className={styles.cardLabel} style={{ marginBottom: 14 }}>
            Key ratios
          </p>
          {ratios.length > 0 ? (
            <div className={styles.ratiosGrid}>
              {ratios.map((r) => (
                <div key={r.name} className={styles.ratio}>
                  <p className={styles.ratioLabel}>{r.name}</p>
                  <p className={styles.ratioValue}>{formatRatioValue(r.value, r.unit)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.meta}>Ratios aren&rsquo;t available for this company right now.</p>
          )}
        </div>
      </div>

      <div className={styles.chartRow}>
        <ProChart
          key={symbol}
          symbol={symbol}
          bars={bars}
          alertHref={`/alerts?new=1&symbol=${encodeURIComponent(symbol)}`}
          onRangeChange={(r) => setRange(CONTEXT_PERIOD[r])}
        />
      </div>

      <div className={styles.insightRow}>
        <InsightCard
          label="AI read"
          endpoint="/api/insights/stock"
          body={{ symbol }}
          initial={aiInsight.initial}
          hasKey={aiInsight.hasKey}
        />
      </div>

      {news.length > 0 && (
        <div className={`${styles.cardPad} ${styles.aboutCard}`}>
          <p className={styles.cardLabel} style={{ marginBottom: 6 }}>
            Recent news
          </p>
          <NewsList items={news} emptyText="No recent news for this stock." />
        </div>
      )}

      <div className={`${styles.cardPad} ${styles.finCard}`}>
        <div className={styles.finHead}>
          <p className={styles.cardLabel}>Historical financials · ₹ crore</p>
          <PillTabs options={FIN_TABS} value={fin} onChange={setFin} labels={FIN_LABELS} />
        </div>
        {finTable.rows.length > 0 ? (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {finTable.cols.map((label, i) => (
                    <th key={i} className={`${styles.th} ${i === 0 ? styles.thLeft : styles.thRight}`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {finTable.rows.map((row) => (
                  <tr key={row.label} className={styles.row}>
                    <td className={styles.rowLabel}>{row.label}</td>
                    {row.cells.map((cell, i) => (
                      <td key={i} className={styles.rowCell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.meta}>
            No {FIN_LABELS[fin].toLowerCase()} data available for this company yet — the fundamentals
            service&rsquo;s filing-based ingestion for this statement is still a tracked gap (see ROADMAP.md).
          </p>
        )}
      </div>

      <div className={`${styles.cardPad} ${styles.finCard}`}>
        <p className={styles.cardLabel} style={{ marginBottom: 14 }}>
          Peer comparison
        </p>
        {peers.length > 0 ? (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={`${styles.th} ${styles.thLeft}`}>Company</th>
                  <th className={`${styles.th} ${styles.thRight}`}>CMP</th>
                  <th className={`${styles.th} ${styles.thRight}`}>P/E</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Mar Cap</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Div Yld</th>
                  <th className={`${styles.th} ${styles.thRight}`}>NP Qtr</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Qtr Profit Var</th>
                  <th className={`${styles.th} ${styles.thRight}`}>ROCE</th>
                </tr>
              </thead>
              <tbody>
                {peers.map((p) => (
                  <tr
                    key={p.symbol}
                    className={styles.row}
                    style={p.is_target ? { fontWeight: 600 } : undefined}
                  >
                    <td className={styles.rowLabel} style={{ textAlign: 'left' }}>
                      {p.is_target ? (
                        p.name
                      ) : (
                        <Link href={`/stock/${p.symbol}`} className={styles.peerLink}>
                          {p.name}
                        </Link>
                      )}
                      {p.is_target && <span className={styles.docMeta}> · this stock</span>}
                    </td>
                    <td className={styles.rowCell}>{formatPeerValue(p.cmp, 'inr')}</td>
                    <td className={styles.rowCell}>{formatPeerValue(p.pe, 'x')}</td>
                    <td className={styles.rowCell}>{formatPeerValue(p.market_cap, 'inr_cr')}</td>
                    <td className={styles.rowCell}>{formatPeerValue(p.div_yield, 'pct')}</td>
                    <td className={styles.rowCell}>{formatPeerValue(p.net_profit_qtr, 'inr_cr')}</td>
                    <td className={styles.rowCell}>{formatPeerValue(p.qtr_profit_var_pct, 'pct')}</td>
                    <td className={styles.rowCell}>{formatPeerValue(p.roce_pct, 'pct')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.meta}>Peer comparison isn&rsquo;t available for this company right now.</p>
        )}
      </div>

      <div className={styles.splitGridAlt}>
        <div className={styles.cardPad}>
          <p className={styles.cardLabel} style={{ marginBottom: 4 }}>
            Shareholding pattern
          </p>
          <p className={styles.docMeta} style={{ marginBottom: 12 }}>
            {shQuarterCount > 0
              ? `Share of equity held, ${shQuarterCount} quarters`
              : 'No shareholding data available'}
          </p>
          {shQuarterCount > 0 ? (
            <ShareholdingBarChart
              series={shareholding}
              ariaLabel={`${symbol} shareholding pattern over ${shQuarterCount} quarters`}
            />
          ) : (
            <p className={styles.meta}>No shareholding data available for this company right now.</p>
          )}
        </div>

        <div className={styles.cardPad}>
          <p className={styles.cardLabel} style={{ marginBottom: 16 }}>
            Documents
          </p>
          {documents.length > 0 ? (
            <>
              <div className={styles.docList}>
                {visibleDocuments.map((doc) => (
                  <a
                    key={doc.url}
                    href={safeHref(doc.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.docRow}
                  >
                    <FileTypeIcon url={doc.url} />
                    <div className={styles.docInfo}>
                      <p className={styles.docName}>{doc.title}</p>
                      <p className={styles.docMeta}>PDF, hosted on BSE</p>
                    </div>
                    <span className={styles.docOpen}>Open →</span>
                  </a>
                ))}
              </div>
              {documents.length > DOCS_COLLAPSED_COUNT && (
                <button type="button" className={styles.viewAllButton} onClick={() => setShowAllDocs((v) => !v)}>
                  {showAllDocs ? 'Show less' : `View all (${documents.length})`}
                </button>
              )}
            </>
          ) : (
            <p className={styles.meta}>
              No annual reports found for this company yet — other document types (XBRL filings, credit
              ratings) aren&rsquo;t wired up (see ROADMAP.md, Phase 4).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
