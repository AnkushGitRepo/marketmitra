import { describe, expect, it } from 'vitest';
import type { AnnouncementOut, ShareholdingOut } from '@/lib/dashboard/fundamentalsApi';
import { announcementBlocks, ownershipBlocks } from './governanceBlocks';

const sh = (category: string, quarter_end: string, percentage: string): ShareholdingOut => ({ category, quarter_end, percentage, source_tier: 't' });
const rows = [
  sh('Promoters', '2026-09-30', '50.44'), sh('FIIs', '2026-09-30', '16.67'), sh('DIIs', '2026-09-30', '21.62'), sh('Public', '2026-09-30', '11.08'),
  sh('Promoters', '2026-06-30', '50.44'), sh('FIIs', '2026-06-30', '17.19'), sh('DIIs', '2026-06-30', '21.1'), sh('Public', '2026-06-30', '11.27'),
];

describe('ownershipBlocks', () => {
  it('shows each holder with its change on the quarter before, and a table oldest first', () => {
    const [kpi, table] = ownershipBlocks(rows, null);
    if (kpi.type !== 'kpi_grid' || table.type !== 'data_table') throw new Error();
    const fii = kpi.items.find((i) => i.label === 'Foreign institutions');
    expect(fii).toMatchObject({ value: '16.7%', note: '−0.52 pp vs last quarter', tone: 'negative' });
    expect(table.rows.map((r) => r.quarter)).toEqual(['Jun 26', 'Sep 26']);
    expect(table.rows[1]).toMatchObject({ promoters: 50.44, fii: 16.67 });
  });

  it('says "none flagged", not zero, when Screener flags no pledge', () => {
    const kpi = ownershipBlocks(rows, null)[0];
    if (kpi.type !== 'kpi_grid') throw new Error();
    expect(kpi.items.at(-1)).toMatchObject({ label: 'Promoter pledge', value: 'None flagged', note: 'Screener flags no pledge' });
  });

  it('shows a flagged pledge as a share of the promoters’ holding', () => {
    const kpi = ownershipBlocks(rows, 73)[0];
    if (kpi.type !== 'kpi_grid') throw new Error();
    expect(kpi.items.at(-1)).toMatchObject({ value: '73.0%', tone: 'negative' });
  });

  it('copes with no shareholding data, and keeps only the last five quarters', () => {
    expect(ownershipBlocks(null, null)).toEqual([]);
    const many = Array.from({ length: 8 }, (_, i) => sh('Promoters', `202${4 + Math.floor(i / 4)}-${['03', '06', '09', '12'][i % 4]}-30`, String(50 + i)));
    const table = ownershipBlocks(many, null).find((b) => b.type === 'data_table');
    if (table?.type !== 'data_table') throw new Error();
    expect(table.rows).toHaveLength(5);
  });
});

const ann = (title: string, category: AnnouncementOut['category'], announced_on: string | null, summary: string | null = null): AnnouncementOut => ({ title, category, announced_on, summary, url: 'https://x.test', source_tier: 't' });

describe('announcementBlocks', () => {
  const list = [
    ann('Disclosure of material litigation', 'litigation', '2026-09-05', 'Order from NCLT'),
    ann('Resignation of CFO', 'management', '2026-09-01'),
    ann('Newspaper publication', 'other', '2026-08-30'),
    ann('Credit Rating', 'credit_rating', null),
  ];

  it('counts the governance events and lists them newest first with their type', () => {
    const [kpi, table] = announcementBlocks(list);
    if (kpi.type !== 'kpi_grid' || table.type !== 'data_table') throw new Error();
    expect(kpi.items[0]).toMatchObject({ label: 'Litigation or penalty notices', value: '1', tone: 'negative' });
    expect(kpi.items[1].value).toBe('1');
    expect(table.rows.map((r) => r.type)).toEqual(['Litigation or penalty', 'Management change', 'Credit rating']);
    expect(table.rows[0]).toMatchObject({ date: '5 Sep 26', event: 'Disclosure of material litigation: Order from NCLT' });
    expect(table.rows[2].date).toBe('—');
  });

  it('leaves routine announcements out, and returns nothing when none bear on governance', () => {
    expect(announcementBlocks([ann('Newspaper publication', 'other', '2026-08-30')])).toEqual([]);
    expect(announcementBlocks(null)).toEqual([]);
  });
});
