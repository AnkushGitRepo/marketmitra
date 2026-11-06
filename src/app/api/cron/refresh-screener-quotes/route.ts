import { NextResponse } from 'next/server';
import { bearerMatches } from '@/lib/security/secrets';
import { refreshScreenerQuotes } from '@/lib/screener/bulkQuotes';
import { logEvent } from '@/lib/system/eventLog';

const SOURCE = 'cron:refresh-screener-quotes';
const DEFAULT_FUNDAMENTALS_API_URL = 'http://localhost:8420';

// Daily bulk price refresh for the screener (ADR 0033): quotes the whole NSE
// main-board universe from Yahoo in 100-symbol chunks (~26 requests) and posts
// market cap / price / P/E / P/B / dividend yield to fundamentals-api. Invoked
// by the `refresh-screener-quotes` GitHub Actions schedule with
// `Authorization: Bearer <CRON_SECRET>`, like the other cron routes.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ success: false, error: 'CRON_SECRET is not configured' }, { status: 503 });
    }
  } else if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.SCREENER_INGEST_TOKEN;
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'SCREENER_INGEST_TOKEN is not configured' },
      { status: 503 }
    );
  }
  const baseUrl = (process.env.FUNDAMENTALS_API_URL ?? DEFAULT_FUNDAMENTALS_API_URL).replace(/\/$/, '');

  const started = Date.now();
  try {
    const result = await refreshScreenerQuotes({ baseUrl, token });
    const ms = Date.now() - started;
    void logEvent({ level: 'info', source: SOURCE, message: 'Screener quote refresh completed', durationMs: ms, meta: { ...result } });
    return NextResponse.json({ success: true, data: { ...result, ms } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'quote refresh failed';
    void logEvent({ level: 'error', source: SOURCE, message: `Screener quote refresh failed: ${message}`, durationMs: Date.now() - started });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
