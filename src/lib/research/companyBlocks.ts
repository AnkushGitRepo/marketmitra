import type { PeerOut } from '@/lib/dashboard/fundamentalsApi';
import { compactBlocks, type DataTableBlock, type FinancialChartBlock, type KpiGridBlock, type ResearchBlock, type TableColumn } from './blocks';
import type { CompanyData } from './companyData';
import { buildFinancialPeriods } from './financialSeries';
import { formatCrore, formatNumber, formatPercent, median, toNumber } from './formatters';

const MIN_PEERS = 3;

const PEER_COLUMNS: readonly TableColumn[] = [
  { key: 'name', label: 'Company', format: 'text' },
  { key: 'market_cap', label: 'Market cap', format: 'crore' },
  { key: 'pe', label: 'P/E', format: 'number' },
  { key: 'roce', label: 'ROCE', format: 'percent', best: 'high' },
  { key: 'div_yield', label: 'Dividend yield', format: 'percent', best: 'high' },
  { key: 'sales_var', label: 'Sales growth (qtr YoY)', format: 'percent', best: 'high' },
];

export function peerMedianPe(peers: readonly PeerOut[]): number | null {
  const others = peers.filter((p) => !p.is_target).map((p) => toNumber(p.pe));
  const values = others.filter((v): v is number => v !== null && v > 0);
  return values.length >= MIN_PEERS ? median(values) : null;
}

export function companyKpis(data: CompanyData, peers: readonly PeerOut[]): KpiGridBlock {
  const pe = data.ratios['Stock P/E'] ?? null;
  const peerPe = peerMedianPe(peers);
  const change = data.fii.change;
  return {
    type: 'kpi_grid',
    items: [
      { label: 'Market cap', value: formatCrore(data.ratios['Market Cap'] ?? null) },
      { label: 'P/E', value: pe === null ? '—' : `${formatNumber(pe)}x`, note: peerPe === null ? undefined : `Peer median ${formatNumber(peerPe)}x` },
      { label: 'ROCE', value: formatPercent(data.ratios['ROCE'] ?? null), note: data.ratios['ROE'] == null ? undefined : `ROE ${formatPercent(data.ratios['ROE'])}` },
      {
        label: 'FII holding',
        value: formatPercent(data.fii.latest),
        note: change === null ? undefined : `${change >= 0 ? '+' : '−'}${formatNumber(Math.abs(change), 2)} pp vs last quarter`,
        tone: change === null || change === 0 ? 'neutral' : change > 0 ? 'positive' : 'negative',
      },
    ],
  };
}

function salesChart(data: CompanyData): FinancialChartBlock | null {
  if (data.annual.length === 0) return null;
  return { type: 'financial_chart', title: 'Sales and operating profit', unit: '₹ Cr', periods: buildFinancialPeriods(data.annual) };
}

export function peerTable(peers: readonly PeerOut[]): DataTableBlock | null {
  if (peers.length < 2) return null;
  return {
    type: 'data_table',
    title: 'Against its peers',
    columns: PEER_COLUMNS,
    rows: peers.map((p) => ({
      name: p.is_target ? `${p.name} (this company)` : p.name,
      market_cap: toNumber(p.market_cap),
      pe: toNumber(p.pe),
      roce: toNumber(p.roce_pct),
      div_yield: toNumber(p.div_yield),
      sales_var: toNumber(p.qtr_sales_var_pct),
    })),
  };
}

/** KPI cards, the sales chart and the peer table of one company. A missing series just leaves its block out. */
export function companyBlocks(data: CompanyData, peers: readonly PeerOut[] | null): ResearchBlock[] {
  const list = peers ?? [];
  return compactBlocks([companyKpis(data, list), salesChart(data), peerTable(list)]);
}

