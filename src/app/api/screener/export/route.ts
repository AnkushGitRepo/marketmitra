import { runScreenerPage } from '@/lib/dashboard/screener';
import { NextResponse } from 'next/server';
import { MAX_PAGE_SIZE, parseScreenerParams } from '@/lib/screener/params';
import { toCsv } from '@/lib/screener/csv';
import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';

// Hard ceiling on exported rows — the whole NSE universe is ~2,600, so this
// is a runaway guard, not a practical limit.
const MAX_EXPORT_ROWS = 5000;

// GET /api/screener/export?<same filters as /api/screener> → text/csv of EVERY
// matching row (not just the visible page). limit/offset are ignored; the
// filters + sort are honoured. Public and read-only like /api/screener.
export async function GET(request: Request) {
  const parsed = parseScreenerParams(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'invalid_filter', message: parsed.message }, { status: 400 });
  }
  const { limit: _limit, offset: _offset, ...filters } = parsed.filters;
  void _limit;
  void _offset;

  const rows: ScreenerResultRow[] = [];
  while (rows.length < MAX_EXPORT_ROWS) {
    const page = await runScreenerPage({ ...filters, limit: MAX_PAGE_SIZE, offset: rows.length });
    rows.push(...page.rows);
    if (page.rows.length < MAX_PAGE_SIZE || rows.length >= page.total) break;
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${toCsv(rows)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="marketmitra-screener-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
