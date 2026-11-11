'use client';

import { useRouter } from 'next/navigation';
import { Suspense, use, useEffect, useMemo, useState } from 'react';
import { CompanyLogo } from '@/components/dashboard-charts/CompanyLogo';
import { AlertModal } from '@/components/alerts/AlertModal';
import Link from 'next/link';
import { DeepDive } from '@/components/stock/DeepDive';
import type { StatementKey } from '@/components/stock/FinancialsPanel';
import { KeyTiles } from '@/components/stock/KeyTiles';
import { MitraBrief, type BriefData } from '@/components/stock/MitraBrief';
import type { PromptMode } from '@/lib/ai/promptMode';
import type { StockSignals } from '@/lib/stock/signals';
import { RangeBar } from '@/components/stock/RangeBar';
import { StockChart } from '@/components/stock/StockChart';
import { WatchlistButton } from '@/components/stock/WatchlistButton';
import { useMask } from '@/lib/dashboard/MaskContext';
import { usePageContext } from '@/lib/dashboard/PageContext';
import { formatInr } from '@/lib/dashboard/format';
import type { CompanyOut, DocumentOut, PeerOut, PricePeriod, RatioOut } from '@/lib/dashboard/fundamentalsApi';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import type { Bar, RangeKey } from '@/lib/chart/bars';
import { stripCitationMarkers, type FinTable, type ShareholdingSeries } from '@/lib/dashboard/transforms';
import { buildKeyTiles } from '@/lib/stock/keyRatios';
import { resolveRange52 } from '@/lib/stock/range52';
import styles from './page.module.css';

const SOURCE_LABELS: Record<string, string> = {
  tier1_nse_bse: 'NSE/BSE',
  tier2_yfinance: 'Yahoo Finance',
  tier3_screener: 'Screener.in',
};

/** The chart's range tabs, mapped to the periods Mitra's page context knows. */
const CONTEXT_PERIOD: Record<RangeKey, PricePeriod> = {
  '1M': '1mo',
  '3M': '6mo',
  '6M': '6mo',
  YTD: '1y',
  '1Y': '1y',
  '5Y': '5y',
  ALL: '5y',
};

export interface HeaderQuote {
  latestClose: string | null;
  previousClose: string | null;
  week52High: string | null;
  week52Low: string | null;
}

interface StockPageClientProps {
  symbol: string;
  company: CompanyOut;
  ratios: RatioOut[];
  peers: PeerOut[];
  documents: DocumentOut[];
  news: NewsItem[];
  hasKey: boolean;
  brief: { mode: PromptMode; initial: BriefData | null };
  shareholding: ShareholdingSeries[];
  financials: Record<StatementKey, FinTable>;
  bars: Bar[];
  /** Resolves when the live quote does (or falls back to the EOD close). */
  quote: Promise<HeaderQuote>;
  /** The brief's data panel, resolved once the live quote is. */
  signals: Promise<StockSignals>;
}

interface LiveSectionProps {
  quote: Promise<HeaderQuote>;
  bars: Bar[];
  ratios: RatioOut[];
  peers: PeerOut[];
}

/** Price, day move, 52-week bar and the key-ratio tiles: everything that needs the live quote, so the rest of the page streams first. */
function LiveSection({ quote, bars, ratios, peers }: LiveSectionProps) {
  const { masked } = useMask();
  const q = use(quote);
  const price = q.latestClose !== null ? Number(q.latestClose) : null;
  const prev = q.previousClose !== null ? Number(q.previousClose) : null;
  const change = price !== null && prev !== null ? price - prev : null;
  const changePct = change !== null && prev ? (change / prev) * 100 : null;
  const up = (change ?? 0) >= 0;
  const range = useMemo(() => resolveRange52({ low: q.week52Low, high: q.week52High }, bars), [q.week52Low, q.week52High, bars]);
  const tiles = useMemo(() => buildKeyTiles({ ratios, peers, price }), [ratios, peers, price]);

  return (
    <>
      <div className={styles.liveRow}>
        <div>
          <p className={styles.price}>{price !== null ? formatInr(price, 2, masked) : '—'}</p>
          {change !== null && changePct !== null ? (
            <p className={styles.priceChg} style={{ color: up ? 'var(--app-gain)' : 'var(--app-loss)' }}>
              {up ? '▲ +' : '▼ '}
              {change.toFixed(2)} ({up ? '+' : ''}
              {changePct.toFixed(2)}%) today
            </p>
          ) : (
            <p className={styles.priceChg}>&nbsp;</p>
          )}
        </div>
        <RangeBar price={price} range={range} />
      </div>
      <KeyTiles tiles={tiles} />
    </>
  );
}

function BriefSection({ signals, ...rest }: Omit<React.ComponentProps<typeof MitraBrief>, 'signals'> & { signals: Promise<StockSignals> }) {
  return <MitraBrief {...rest} signals={use(signals)} />;
}

export function StockPageClient({
  symbol,
  company,
  ratios,
  peers,
  documents,
  news,
  hasKey,
  brief,
  shareholding,
  financials,
  bars,
  quote,
  signals,
}: StockPageClientProps) {
  const router = useRouter();
  const { setPageContext } = usePageContext();
  const [range, setRange] = useState<PricePeriod>('1y');
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertCreated, setAlertCreated] = useState(false);
  const alertHref = `/alerts?new=1&symbol=${encodeURIComponent(symbol)}`;

  // Publish what the user is looking at so Mitra (mounted as a shell sibling, not a child of this page)
  // can reference "this stock" / "this timeframe" accurately (ADR 0022).
  useEffect(() => {
    setPageContext({ page: 'stock', ticker: symbol, range });
    return () => setPageContext(null);
  }, [symbol, range, setPageContext]);

  const aboutText = company.about ? stripCitationMarkers(company.about) : null;
  const sourceLabel = company.source_tier ? SOURCE_LABELS[company.source_tier] ?? null : null;

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
              {symbol} · NSE{company.sector ? ` · ${company.sector}` : ''}
              {company.industry ? ` · ${company.industry}` : ''}
            </p>
          </div>
        </div>
        <div className={styles.actions}>
          <WatchlistButton symbol={symbol} />
          <button type="button" className={styles.setAlertButton} onClick={() => {
              setAlertCreated(false);
              setAlertOpen(true);
            }}
          >
            + Set alert
          </button>
          {alertCreated && (
            <span className={styles.alertNote} role="status">
              Alert created. <Link href="/alerts">View alerts</Link>
            </span>
          )}
        </div>
      </div>

      <Suspense
        fallback={
          <div className={styles.liveRow}>
            <p className={styles.price}>—</p>
          </div>
        }
      >
        <LiveSection quote={quote} bars={bars} ratios={ratios} peers={peers} />
      </Suspense>

      <div className={styles.chartRow}>
        <StockChart symbol={symbol} bars={bars} alertHref={alertHref} onAlert={() => { setAlertCreated(false); setAlertOpen(true); }} onRangeChange={(r) => setRange(CONTEXT_PERIOD[r])} />
      </div>

      <div className={styles.insightRow}>
        <Suspense fallback={<div className={styles.briefPlaceholder} aria-hidden="true" />}>
          <BriefSection
            symbol={symbol}
            hasKey={hasKey}
            mode={brief.mode}
            initial={brief.initial}
            signals={signals}
          />
        </Suspense>
      </div>

      {aboutText && (
        <div className={styles.cardPad}>
          <p className={styles.cardLabel} style={{ marginBottom: 10 }}>
            About
          </p>
          <p className={styles.aboutText}>{aboutText}</p>
          {sourceLabel && <p className={styles.sourceLine}>Source: {sourceLabel}</p>}
        </div>
      )}

      <AlertModal open={alertOpen} symbol={symbol} onCreated={() => setAlertCreated(true)} onClose={() => setAlertOpen(false)} />

      <DeepDive symbol={symbol} financials={financials} peers={peers} shareholding={shareholding} news={news} documents={documents} />
    </div>
  );
}
