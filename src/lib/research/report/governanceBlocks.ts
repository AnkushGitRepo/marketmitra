import type { AnnouncementCategory, AnnouncementOut, ShareholdingOut } from '@/lib/dashboard/fundamentalsApi';
import { compactBlocks, type DataTableBlock, type KpiGridBlock, type KpiItem, type ResearchBlock } from '../blocks';
import { formatNumber, formatPercent, periodLabel, toNumber } from '../formatters';

const QUARTERS = 5;
const MAX_EVENTS = 12;

const CATEGORIES = [
  ['promoters', /promoter/i],
  ['fii', /fii|foreign/i],
  ['dii', /dii|domestic/i],
  ['public', /public/i],
] as const;
type Holder = (typeof CATEGORIES)[number][0];

/** quarter end → holder → percentage, for the last few quarters, oldest first. */
function holdingByQuarter(rows: readonly ShareholdingOut[]): { quarter: string; shares: Partial<Record<Holder, number>> }[] {
  const byQuarter = new Map<string, Partial<Record<Holder, number>>>();
  for (const r of rows) {
    const holder = CATEGORIES.find(([, pattern]) => pattern.test(r.category))?.[0];
    const pct = toNumber(r.percentage);
    if (!holder || pct === null) continue;
    byQuarter.set(r.quarter_end, { ...byQuarter.get(r.quarter_end), [holder]: pct });
  }
  return [...byQuarter].sort(([a], [b]) => a.localeCompare(b)).slice(-QUARTERS).map(([quarter, shares]) => ({ quarter, shares }));
}

const points = (v: number): string => `${v >= 0 ? '+' : '−'}${formatNumber(Math.abs(v), 2)} pp`;

function ownershipKpis(history: ReturnType<typeof holdingByQuarter>, pledge: number | null): KpiGridBlock | null {
  const latest = history.at(-1);
  const prior = history.at(-2);
  const holding = (label: string, holder: Holder): KpiItem | null => {
    const now = latest?.shares[holder];
    if (now === undefined) return null;
    const before = prior?.shares[holder];
    const change = before === undefined ? null : now - before;
    return { label, value: formatPercent(now), note: change === null ? undefined : `${points(change)} vs last quarter`, tone: change === null || change === 0 ? 'neutral' : change > 0 ? 'positive' : 'negative' };
  };
  const items: (KpiItem | null)[] = [
    holding('Promoters', 'promoters'),
    holding('Foreign institutions', 'fii'),
    holding('Domestic institutions', 'dii'),
    // Screener states a pledge only when there is one, so "none flagged" is not "zero".
    pledge === null
      ? { label: 'Promoter pledge', value: 'None flagged', note: 'Screener flags no pledge' }
      : { label: 'Promoter pledge', value: formatPercent(pledge), note: 'Of the promoters’ holding', tone: 'negative' },
  ];
  const shown = items.filter((i): i is KpiItem => i !== null);
  return latest || pledge !== null ? { type: 'kpi_grid', items: shown } : null;
}

function ownershipTable(history: ReturnType<typeof holdingByQuarter>): DataTableBlock | null {
  if (history.length === 0) return null;
  return {
    type: 'data_table',
    title: 'Who owns the company, by quarter',
    columns: [
      { key: 'quarter', label: 'Quarter', format: 'text' },
      { key: 'promoters', label: 'Promoters', format: 'percent' },
      { key: 'fii', label: 'Foreign institutions', format: 'percent' },
      { key: 'dii', label: 'Domestic institutions', format: 'percent' },
      { key: 'public', label: 'Public', format: 'percent' },
    ],
    rows: history.map(({ quarter, shares }) => ({ quarter: periodLabel(quarter), promoters: shares.promoters ?? null, fii: shares.fii ?? null, dii: shares.dii ?? null, public: shares.public ?? null })),
  };
}

/** Ownership by quarter and the promoter pledge. `pledge` is the percentage Screener flags, or null when it flags none. */
export function ownershipBlocks(rows: readonly ShareholdingOut[] | null, pledge: number | null): ResearchBlock[] {
  const history = holdingByQuarter(rows ?? []);
  return compactBlocks([ownershipKpis(history, pledge), ownershipTable(history)]);
}

const GOVERNANCE_TYPES: Readonly<Partial<Record<AnnouncementCategory, string>>> = {
  litigation: 'Litigation or penalty',
  auditor: 'Auditor',
  pledge: 'Pledge',
  management: 'Management change',
  credit_rating: 'Credit rating',
  clarification: 'Exchange clarification',
  related_party: 'Related party',
  restructuring: 'Restructuring',
};

const dateText = (iso: string | null): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${periodLabel(`${y}-${m}`).split(' ')[0]} ${y.slice(2)}`;
};

/** The recent exchange announcements that bear on governance, newest first, with a count by type. */
export function announcementBlocks(announcements: readonly AnnouncementOut[] | null): ResearchBlock[] {
  const events = (announcements ?? []).filter((a) => a.category in GOVERNANCE_TYPES);
  if (events.length === 0) return [];
  const count = (category: AnnouncementCategory) => events.filter((e) => e.category === category).length;
  const kpi: KpiGridBlock = {
    type: 'kpi_grid',
    items: [
      { label: 'Litigation or penalty notices', value: String(count('litigation')), tone: count('litigation') > 0 ? 'negative' : 'neutral' },
      { label: 'Auditor and management changes', value: String(count('auditor') + count('management')) },
      { label: 'Exchange clarifications sought', value: String(count('clarification')) },
      { label: 'Credit rating filings', value: String(count('credit_rating')) },
    ],
  };
  const table: DataTableBlock = {
    type: 'data_table',
    title: 'Recent exchange announcements that bear on governance',
    note: 'The latest filings listed by the exchange, as read from the company page; the type is assigned by rules over the title.',
    columns: [
      { key: 'date', label: 'Date', format: 'text' },
      { key: 'type', label: 'Type', format: 'text' },
      { key: 'event', label: 'Announcement', format: 'text' },
    ],
    rows: events.slice(0, MAX_EVENTS).map((e) => ({ date: dateText(e.announced_on), type: GOVERNANCE_TYPES[e.category] ?? e.category, event: e.summary ? `${e.title}: ${e.summary}` : e.title })),
  };
  return [kpi, table];
}
