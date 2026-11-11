'use client';

import { useState } from 'react';
import { AnalystChatButton } from '@/components/analysts/AnalystChatButton';
import { DossierReader } from '@/components/analysts/DossierReader';
import { FileTypeIcon } from '@/components/dashboard-charts/FileTypeIcon';
import { NewsList } from '@/components/dashboard-charts/NewsList';
import { ShareholdingBarChart } from '@/components/dashboard-charts/ShareholdingBarChart';
import type { DocumentOut, PeerOut } from '@/lib/dashboard/fundamentalsApi';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import type { FinTable, ShareholdingSeries } from '@/lib/dashboard/transforms';
import { safeHref } from '@/lib/security/safeHref';
import { FinancialsPanel, type StatementKey } from './FinancialsPanel';
import { PeersPanel } from './PeersPanel';
import styles from './DeepDive.module.css';

type TabId = 'financials' | 'peers' | 'shareholding' | 'news' | 'filings' | 'journal';

interface DeepDiveProps {
  readonly symbol: string;
  readonly financials: Record<StatementKey, FinTable>;
  readonly peers: PeerOut[];
  readonly shareholding: ShareholdingSeries[];
  readonly news: NewsItem[];
  readonly documents: DocumentOut[];
}

const DOCS_COLLAPSED_COUNT = 4;

/** Financials, peers, shareholding, news and filings under one sticky tab bar, so a phone never scrolls through all five. */
export function DeepDive({ symbol, financials, peers, shareholding, news, documents }: DeepDiveProps) {
  const [tab, setTab] = useState<TabId>('financials');
  const [showAllDocs, setShowAllDocs] = useState(false);
  const quarters = new Set(shareholding.flatMap((s) => s.points.map((p) => p.quarterEnd))).size;
  const visibleDocs = showAllDocs ? documents : documents.slice(0, DOCS_COLLAPSED_COUNT);

  const tabs: ReadonlyArray<{ id: TabId; label: string; count?: number }> = [
    { id: 'financials', label: 'Financials' },
    { id: 'peers', label: 'Peers', count: peers.length },
    { id: 'shareholding', label: 'Shareholding' },
    { id: 'news', label: 'News', count: news.length },
    { id: 'filings', label: 'Filings', count: documents.length },
    { id: 'journal', label: 'Agent journal' },
  ];

  return (
    <section className={styles.root} aria-label="Deep dive">
      <div className={styles.tabBar} role="tablist" aria-label="Stock details">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`dd-tab-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls={`dd-panel-${t.id}`}
            className={`${styles.tab} ${t.id === tab ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count ? <span className={styles.count}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`dd-panel-${tab}`} aria-labelledby={`dd-tab-${tab}`} className={styles.panel}>
        {tab === 'financials' && <FinancialsPanel financials={financials} />}
        {tab === 'peers' && <PeersPanel peers={peers} />}
        {tab === 'shareholding' &&
          (quarters > 0 ? (
            <>
              <p className={styles.note}>Share of equity held, {quarters} quarters</p>
              <ShareholdingBarChart series={shareholding} ariaLabel={`${symbol} shareholding pattern over ${quarters} quarters`} />
            </>
          ) : (
            <p className={styles.note}>No shareholding data available for this company right now.</p>
          ))}
        {tab === 'journal' && (
          <>
            <AnalystChatButton symbol={symbol} />
            <DossierReader symbol={symbol} />
          </>
        )}
        {tab === 'news' && <NewsList items={news} emptyText="No recent news for this stock." />}
        {tab === 'filings' &&
          (documents.length > 0 ? (
            <>
              <div className={styles.docList}>
                {visibleDocs.map((doc) => (
                  <a key={doc.url} href={safeHref(doc.url)} target="_blank" rel="noopener noreferrer" className={styles.docRow}>
                    <FileTypeIcon url={doc.url} />
                    <span className={styles.docInfo}>
                      <span className={styles.docName}>{doc.title}</span>
                      <span className={styles.note}>PDF, hosted on BSE</span>
                    </span>
                    <span className={styles.docOpen}>Open →</span>
                  </a>
                ))}
              </div>
              {documents.length > DOCS_COLLAPSED_COUNT && (
                <button type="button" className={styles.linkBtn} onClick={() => setShowAllDocs((v) => !v)}>
                  {showAllDocs ? 'Show less' : `View all (${documents.length})`}
                </button>
              )}
            </>
          ) : (
            <p className={styles.note}>No annual reports found for this company yet.</p>
          ))}
      </div>
    </section>
  );
}
