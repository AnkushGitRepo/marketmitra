'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LineChart } from '@/components/dashboard-charts/LineChart';
import { PillTabs } from '@/components/dashboard-charts/PillTabs';
import { InsightCard } from '@/components/dashboard-charts/InsightCard';
import { NewsList } from '@/components/dashboard-charts/NewsList';
import { ActivityCard } from '@/components/dashboard-charts/ActivityCard';
import { useMask } from '@/lib/dashboard/MaskContext';
import { formatInr } from '@/lib/dashboard/format';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import type { PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import type { RangeSeries } from '@/lib/dashboard/chartMath';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import type { Notification } from '@/lib/notifications/types';
import { AddHoldingForm } from './AddHoldingForm';
import { HoldingRow } from './HoldingRow';
import styles from './page.module.css';

const RANGE_OPTIONS: PricePeriod[] = ['1mo', '6mo', '1y', '5y'];
const RANGE_LABELS: Record<PricePeriod, string> = { '1mo': '1M', '6mo': '6M', '1y': '1Y', '5y': '5Y' };

const SECTOR_COLORS = [
  '#0C8A6C', '#17C39A', '#3FD0AB', '#7FDFC2', '#A6E8D3', '#C9AF7E', '#E2DED2', '#D9917F',
];

interface PortfolioPageClientProps {
  holdings: EnrichedHolding[];
  history: Record<PricePeriod, RangeSeries>;
  aiInsight: { hasKey: boolean; initial: { content: string; generatedAt: string } | null };
  news: NewsItem[];
  activity: Notification[];
}

function exportCsv(holdings: EnrichedHolding[]) {
  const header = ['Symbol', 'Quantity', 'Avg Price', 'LTP', 'Value', 'Unrealized P&L'];
  const rows = holdings.map((h) => {
    const value = h.ltp !== null ? h.quantity * h.ltp : '';
    const pl = h.ltp !== null ? h.quantity * (h.ltp - h.avgPrice) : '';
    return [h.symbol, h.quantity, h.avgPrice, h.ltp ?? '', value, pl].join(',');
  });
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'marketmitra-holdings.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function PortfolioPageClient({ holdings, history, aiInsight, news, activity }: PortfolioPageClientProps) {
  const router = useRouter();
  const { masked } = useMask();
  const [range, setRange] = useState<PricePeriod>('1y');
  const [showAddForm, setShowAddForm] = useState(holdings.length === 0);

  const priced = holdings.filter((h) => h.ltp !== null);
  const totalValue = priced.reduce((sum, h) => sum + h.quantity * h.ltp!, 0);
  const invested = holdings.reduce((sum, h) => sum + h.quantity * h.avgPrice, 0);

  const bySector = new Map<string, number>();
  for (const h of priced) {
    const sector = h.sector ?? 'Unknown';
    bySector.set(sector, (bySector.get(sector) ?? 0) + h.quantity * h.ltp!);
  }
  const sectors = [...bySector.entries()]
    .map(([name, value], i) => ({ name, pct: totalValue ? (value / totalValue) * 100 : 0, color: SECTOR_COLORS[i % SECTOR_COLORS.length] }))
    .sort((a, b) => b.pct - a.pct);

  const contributors = [...priced]
    .map((h) => ({ ...h, pl: h.quantity * (h.ltp! - h.avgPrice) }))
    .sort((a, b) => b.pl - a.pl);
  const maxContrib = Math.max(1, ...contributors.map((c) => Math.abs(c.pl)));

  const sortedByValue = [...priced].sort((a, b) => b.quantity * b.ltp! - a.quantity * a.ltp!);
  const top3Value = sortedByValue.slice(0, 3).reduce((sum, h) => sum + h.quantity * h.ltp!, 0);
  const top3Concentration = totalValue ? (top3Value / totalValue) * 100 : 0;
  const largest = sortedByValue[0];

  if (holdings.length === 0) {
    return (
      <div className={styles.pageRoot}>
        <div className={styles.headRow}>
          <div>
            <p className={styles.eyebrow}>Your holdings</p>
            <h1 className={styles.h1}>Portfolio</h1>
          </div>
        </div>
        <ActivityCard items={activity} />
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>No holdings yet</p>
          <p className={styles.chartSub}>Add your first position to see live value, allocation, and P&amp;L.</p>
          <AddHoldingForm onDone={() => router.refresh()} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Your holdings · live prices</p>
          <h1 className={styles.h1}>Portfolio</h1>
        </div>
        <div className={styles.headActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => exportCsv(holdings)}>
            Export CSV
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => setShowAddForm((s) => !s)}>
            {showAddForm ? 'Cancel' : 'Add position'}
          </button>
        </div>
      </div>

      {showAddForm && <AddHoldingForm onDone={() => setShowAddForm(false)} />}

      <ActivityCard items={activity} />

      <div className={styles.splitGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartHead}>
            <div>
              <p className={styles.chartLabel}>Current value</p>
              <p className={styles.chartValue}>{formatInr(totalValue, 0, masked)}</p>
              <p className={styles.chartSub}>Invested {formatInr(invested, 0, masked)}</p>
            </div>
            <PillTabs options={RANGE_OPTIONS} value={range} onChange={setRange} labels={RANGE_LABELS} />
          </div>
          {history[range].v.length > 0 ? (
            <LineChart
              series={history[range]}
              height={210}
              formatValue={(v) => formatInr(v, 0, masked)}
              ariaLabel={`Portfolio value chart, ${RANGE_LABELS[range]}`}
            />
          ) : (
            <p className={styles.chartSub}>Not enough price history yet for this range.</p>
          )}
          <p className={styles.historyNote}>
            Approximate: current holdings&rsquo; quantities applied to real historical prices, not a
            transaction-by-transaction history.
          </p>
        </div>

        <div className={styles.sideCol}>
          <div className={styles.sideCard}>
            <p className={styles.sideLabel}>Allocation by sector</p>
            <div className={styles.allocRow}>
              {sectors.map((s) => (
                <div key={s.name}>
                  <div className={styles.allocLine}>
                    <span>{s.name}</span>
                    <span className={styles.allocPct}>{s.pct.toFixed(1)}%</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${s.pct}%`, background: s.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.holdingsCard}>
        <div className={styles.holdingsHead}>
          <p className={styles.holdingsCount}>Holdings · {holdings.length} instruments</p>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={`${styles.th} ${styles.thLeft}`}>Company</th>
                <th className={`${styles.th} ${styles.thRight}`}>Qty</th>
                <th className={`${styles.th} ${styles.thRight}`}>Avg. price</th>
                <th className={`${styles.th} ${styles.thRight}`}>LTP</th>
                <th className={`${styles.th} ${styles.thRight}`}>Value / P&amp;L</th>
                <th className={`${styles.th} ${styles.thRight}`}>Allocation</th>
                <th className={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <HoldingRow key={h.id} holding={h} totalValue={totalValue} masked={masked} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.sectionHeadRow}>
        <h2 className={styles.h2}>Portfolio analysis</h2>
      </div>

      {holdings.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <InsightCard
            label="Portfolio insight"
            endpoint="/api/insights/portfolio"
            body={{}}
            initial={aiInsight.initial}
            hasKey={aiInsight.hasKey}
          />
        </div>
      )}

      <div className={styles.splitGridWide}>
        <div className={styles.diversCard}>
          <p className={styles.sideLabel}>Concentration</p>
          <div className={styles.factRow}>
            <div className={styles.fact}>
              <span className={styles.factLabel}>Top 3 positions</span>
              <span className={styles.factValue}>{top3Concentration.toFixed(1)}% of value</span>
            </div>
            {largest && (
              <div className={styles.fact}>
                <span className={styles.factLabel}>Largest single name</span>
                <span className={styles.factValue}>
                  {largest.symbol} · {totalValue ? ((largest.quantity * largest.ltp! / totalValue) * 100).toFixed(1) : '0'}%
                </span>
              </div>
            )}
            <div className={styles.fact}>
              <span className={styles.factLabel}>Sectors held</span>
              <span className={styles.factValue}>{sectors.length}</span>
            </div>
          </div>
        </div>

        <div className={styles.contribCard}>
          <p className={styles.contribLabel}>Unrealized gain / loss by holding</p>
          <p className={styles.contribSub}>Since purchase, at current price</p>
          <div className={styles.contribRows}>
            {contributors.map((c) => {
              const positive = c.pl >= 0;
              const width = `${(Math.abs(c.pl) / maxContrib) * 100}%`;
              return (
                <div key={c.id} className={styles.contribRow}>
                  <div className={styles.contribName}>
                    <p className={styles.contribNameText}>{c.name}</p>
                    <p className={styles.contribTicker}>{c.symbol}</p>
                  </div>
                  <div className={styles.contribBarWrap}>
                    <div className={styles.contribBarHalfEnd}>
                      {!positive && <div className={styles.contribBarNeg} style={{ width }} />}
                    </div>
                    <div className={styles.contribDivider} />
                    <div className={styles.contribBarHalf}>
                      {positive && <div className={styles.contribBarPos} style={{ width }} />}
                    </div>
                  </div>
                  <span className={styles.contribValue} style={{ color: positive ? 'var(--app-gain)' : 'var(--app-loss)' }}>
                    {positive ? '+' : '-'}
                    {formatInr(Math.abs(c.pl), 0, masked)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.sectionHeadRow}>
        <h2 className={styles.h2}>News for your holdings</h2>
        <Link href="/dashboard/news" className={styles.btnSecondary}>
          View all news
        </Link>
      </div>
      <div className={styles.holdingsCard}>
        <NewsList
          items={news}
          showSymbols
          emptyText="No recent news for your current holdings."
        />
      </div>
    </div>
  );
}
