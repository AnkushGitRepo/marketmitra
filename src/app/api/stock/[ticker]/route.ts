import { NextResponse } from 'next/server';
import {
  getStockAggregate,
  STOCK_AGGREGATE_SECTIONS,
  type StockAggregateSection,
} from '@/lib/dashboard/stockAggregate';

// Public, read-only market data — no auth, same deliberate exception as
// GET /api/search and GET /api/news (ADR 0012/0024): a bare JSON body, not
// the {success,data,error} envelope most other routes use, since this is a
// pass-through aggregate of already-public data rather than a
// user-scoped/mutating resource.
//
// The screener.in-style "everything about this ticker" endpoint (ADR 0024)
// — company profile, live quote, ratios, shareholding, peers, documents, and
// financial statements in one call. The same aggregation also backs the MCP
// `get_company_fundamentals` tool (src/lib/mcp/tools.ts) via
// src/lib/dashboard/stockAggregate.ts, so the two never drift apart.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const { searchParams } = new URL(request.url);
  const sectionsParam = searchParams.get('sections');

  let sections: StockAggregateSection[] | undefined;
  if (sectionsParam) {
    const requested = sectionsParam.split(',').map((s) => s.trim());
    const invalid = requested.filter(
      (s) => !STOCK_AGGREGATE_SECTIONS.includes(s as StockAggregateSection)
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: 'invalid_sections',
          message: `Unknown section(s): ${invalid.join(', ')}. Valid: ${STOCK_AGGREGATE_SECTIONS.join(', ')}.`,
        },
        { status: 400 }
      );
    }
    sections = requested as StockAggregateSection[];
  }

  const result = await getStockAggregate(ticker, sections);
  return NextResponse.json(result, { status: result.found ? 200 : 404 });
}
