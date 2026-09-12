'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LineChart } from '@/components/dashboard-charts/LineChart';
import { PillTabs } from '@/components/dashboard-charts/PillTabs';
import { CompanyLogo } from '@/components/dashboard-charts/CompanyLogo';
import { NewsList } from '@/components/dashboard-charts/NewsList';
import { InsightCard } from '@/components/dashboard-charts/InsightCard';
import { useMask } from '@/lib/dashboard/MaskContext';
import { usePageContext } from '@/lib/dashboard/PageContext';
import { formatInr } from '@/lib/dashboard/format';
import type { CompanyOut, DocumentOut, PeerOut, PricePeriod, RatioOut } from '@/lib/dashboard/fundamentalsApi';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import type { RangeSeries } from '@/lib/dashboard/chartMath';
import { formatRatioValue, type FinTable, type ShareholdingSeries } from '@/lib/dashboard/transforms';
import styles from './page.module.css';

type StatementKey = 'profit_and_loss' | 'balance_sheet' | 'cash_flow';

const RANGE_OPTIONS: PricePeriod[] = ['1mo', '6mo', '1y', '5y'];
const RANGE_LABELS: Record<PricePeriod, string> = { '1mo': '1M', '6mo': '6M', '1y': '1Y', '5y': '5Y' };
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
  priceSeries: Record<PricePeriod, RangeSeries>;
  latestClose: string | null;
  previousClose: string | null;
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

const SH_TOP = 14;
const SH_BOTTOM = 186;
const SH_WIDTH = 600;

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
  priceSeries,
  latestClose,
  previousClose,
}: StockPageClientProps) {
  const router = useRouter();
  const { masked } = useMask();
  const { setPageContext } = usePageContext();
  const [range, setRange] = useState<PricePeriod>('1y');
  const [fin, setFin] = useState<StatementKey>('profit_and_loss');

  // Publish what the user is looking at so Mitra (mounted as a shell
  // sibling, not a child of this page) can reference "this stock" /
  // "this timeframe" accurately (ADR 0022).
  useEffect(() => {
    setPageContext({ page: 'stock', ticker: symbol, range });
    return () => setPageContext(null);
  }, [symbol, range, setPageContext]);

  const price = latestClose !== null ? Number(latestClose) : null;
  const prev = previousClose !== null ? Number(previousClose) : null;
  const change = price !== null && prev !== null ? price - prev : null;
  const changePct = change !== null && prev ? (change / prev) * 100 : null;
  const up = (change ?? 0) >= 0;

  const finTable = financials[fin];

  const quarters = [...new Set(shareholding.flatMap((s) => s.points.map((p) => p.quarterEnd)))].sort();
  const shMin = 0;
  const shMax = shareholding.length
    ? Math.ceil(Math.max(...shareholding.flatMap((s) => s.points.map((p) => p.percentage))) / 10) * 10
    : 50;
  const shX = (i: number) => (quarters.length <= 1 ? SH_WIDTH / 2 : 6 + (i * (SH_WIDTH - 12)) / (quarters.length - 1));
  const shY = (v: number) => SH_TOP + (1 - (v - shMin) / (shMax - shMin || 1)) * (SH_BOTTOM - SH_TOP);
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((shMin + f * (shMax - shMin)) / 5) * 5);

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
          <p className={styles.price}>{price !== null ? formatInr(price, 2, masked) : '—'}</p>
          {change !== null && changePct !== null && (
            <p className={styles.priceChg} style={{ color: up ? 'var(--app-gain)' : 'var(--app-loss)' }}>
              {up ? '+' : ''}
              {change.toFixed(2)} ({up ? '+' : ''}
              {changePct.toFixed(2)}%)
            </p>
          )}
          <button
            type="button"
            className={styles.setAlertButton}
            onClick={() => router.push(`/dashboard/alerts?new=1&symbol=${encodeURIComponent(symbol)}`)}
          >
            + Set alert
          </button>
        </div>
      </div>

      {company.about && (
        <div className={`${styles.cardPad} ${styles.aboutCard}`}>
          <p className={styles.cardLabel} style={{ marginBottom: 10 }}>
            About
          </p>
          <p className={styles.aboutText}>{company.about}</p>
        </div>
      )}

      <div className={styles.aboutCard}>
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

      <div className={styles.splitGrid}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <p className={styles.cardLabel}>Price history</p>
            <PillTabs options={RANGE_OPTIONS} value={range} onChange={setRange} labels={RANGE_LABELS} />
          </div>
          {priceSeries[range].v.length > 0 ? (
            <LineChart
              series={priceSeries[range]}
              height={210}
              formatValue={(v) => formatInr(v, 2, masked)}
              ariaLabel={`${symbol} price chart, ${RANGE_LABELS[range]}`}
            />
          ) : (
            <p className={styles.meta}>No price history available for this range.</p>
          )}
        </div>

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
                        <Link href={`/dashboard/stock/${p.symbol}`} className={styles.peerLink}>
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
            {quarters.length > 0 ? `Share of equity held, ${quarters.length} quarters` : 'No shareholding data available'}
          </p>
          {quarters.length > 0 ? (
            <>
              <div className={styles.shCardRow}>
                <div className={styles.shAxis}>
                  {gridValues.map((v) => (
                    <span key={v} className={styles.shAxisLabel} style={{ top: `${(shY(v) / 200) * 100}%` }}>
                      {v}%
                    </span>
                  ))}
                </div>
                <div className={styles.shChartCol}>
                  <div className={styles.shChartWrap}>
                    <svg
                      viewBox="0 0 600 200"
                      preserveAspectRatio="none"
                      className={styles.shSvg}
                      role="img"
                      aria-label={`${symbol} shareholding pattern over ${quarters.length} quarters`}
                    >
                      {gridValues.map((v) => (
                        <line key={v} x1="0" x2="600" y1={shY(v)} y2={shY(v)} stroke="#F1EDE3" strokeWidth={1} />
                      ))}
                      {shareholding.map((series) => {
                        const path = series.points
                          .map((p, i) => `${i ? 'L' : 'M'}${shX(i).toFixed(1)} ${shY(p.percentage).toFixed(1)}`)
                          .join(' ');
                        return (
                          <g key={series.category}>
                            <path
                              d={path}
                              fill="none"
                              stroke={series.color}
                              strokeWidth={2.4}
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              vectorEffect="non-scaling-stroke"
                              className={styles.shLinePath}
                            />
                            {series.points.map((p, i) => (
                              <circle
                                key={i}
                                cx={shX(i)}
                                cy={shY(p.percentage)}
                                r={3.6}
                                fill="var(--color-surface)"
                                stroke={series.color}
                                strokeWidth={2.2}
                                vectorEffect="non-scaling-stroke"
                              />
                            ))}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                  <div className={styles.shTicks}>
                    {quarters.map((q) => (
                      <span key={q} className={styles.shTick}>
                        {new Date(q).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.shLegend}>
                {shareholding.map((series) => {
                  const last = series.points[series.points.length - 1];
                  const first = series.points[0];
                  const delta = last.percentage - first.percentage;
                  const deltaColor = delta > 0 ? 'var(--app-gain)' : delta < 0 ? 'var(--app-loss)' : 'var(--app-text-subtle)';
                  return (
                    <div key={series.category} className={styles.legendCard}>
                      <span className={styles.legendDot} style={{ background: series.color }} />
                      <div style={{ minWidth: 0 }}>
                        <p className={styles.legendName}>{series.category}</p>
                        <p className={styles.legendMeta}>
                          {last.percentage.toFixed(1)}%{' '}
                          <span style={{ color: deltaColor }}>
                            {delta > 0 ? '+' : delta < 0 ? '' : '±'}
                            {delta.toFixed(1)}
                          </span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className={styles.meta}>No shareholding data available for this company right now.</p>
          )}
        </div>

        <div className={styles.cardPad}>
          <p className={styles.cardLabel} style={{ marginBottom: 16 }}>
            Documents
          </p>
          {documents.length > 0 ? (
            <div className={styles.docList}>
              {documents.map((doc) => (
                <a
                  key={doc.url}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.docRow}
                >
                  <span className={styles.docIcon} />
                  <div className={styles.docInfo}>
                    <p className={styles.docName}>{doc.title}</p>
                    <p className={styles.docMeta}>PDF, hosted on BSE</p>
                  </div>
                  <span className={styles.docOpen}>Open →</span>
                </a>
              ))}
            </div>
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
