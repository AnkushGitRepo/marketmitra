import { listFunds } from '@/lib/funds/api';
import { fundsToCsv } from '@/lib/funds/csv';
import { badRequest, unavailable } from '@/lib/funds/http';
import { MAX_FUND_PAGE_SIZE, parseFundParams } from '@/lib/funds/params';
import type { FundSummary } from '@/lib/funds/types';

// Runaway guard, not a practical limit: even every plan of every scheme is below this.
const MAX_EXPORT_ROWS = 10_000;
// Pages fetched at once after the first, so a large export does not hammer the data service.
const PAGES_AT_ONCE = 6;

// GET /api/funds/export?<same filters as /api/funds> → text/csv of EVERY matching fund (not just one page). limit and
// offset are ignored; the filters and sort are honoured. Public and read-only like /api/funds. A failure on any page
// answers 503: a partial file would look complete and be wrong.
export async function GET(request: Request) {
  const parsed = parseFundParams(new URL(request.url).searchParams);
  if (!parsed.ok) return badRequest('invalid_filter', parsed.message);
  const { limit: _limit, offset: _offset, ...filters } = parsed.filters;
  void _limit;
  void _offset;

  const first = await listFunds({ ...filters, limit: MAX_FUND_PAGE_SIZE, offset: 0 });
  if (!first) return unavailable();

  const wanted = Math.min(first.total, MAX_EXPORT_ROWS);
  const offsets: number[] = [];
  for (let offset = first.items.length; offset < wanted; offset += MAX_FUND_PAGE_SIZE) offsets.push(offset);

  const funds: FundSummary[] = [...first.items];
  for (let i = 0; i < offsets.length; i += PAGES_AT_ONCE) {
    const pages = await Promise.all(offsets.slice(i, i + PAGES_AT_ONCE).map((offset) => listFunds({ ...filters, limit: MAX_FUND_PAGE_SIZE, offset })));
    if (pages.some((page) => page === null)) return unavailable();
    for (const page of pages) funds.push(...(page?.items ?? []));
  }

  const date = new Date().toISOString().slice(0, 10);
  const truncated = first.total > MAX_EXPORT_ROWS;
  return new Response(`\uFEFF${fundsToCsv(funds.slice(0, MAX_EXPORT_ROWS))}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="marketmitra-funds-${date}.csv"`,
      'Cache-Control': 'no-store',
      'X-Total-Count': String(first.total),
      ...(truncated ? { 'X-Export-Truncated': 'true' } : {}),
    },
  });
}
