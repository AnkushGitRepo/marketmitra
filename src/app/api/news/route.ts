import { NextResponse } from 'next/server';
import { getNews } from '@/lib/dashboard/newsApi';

// Thin same-origin proxy to fundamentals-api's GET /news, so the
// /news client can paginate ("load more") and switch the
// holdings filter without a round-trip through a full server render or
// exposing FUNDAMENTALS_API_URL to the browser. Same narrow exception as
// /api/search (ADR 0012). News is public — no auth.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get('symbols')?.split(',').filter(Boolean);
  const limitRaw = Number(searchParams.get('limit'));
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 50 ? limitRaw : 20;
  const cursor = searchParams.get('cursor');

  const page = await getNews({ symbols, limit, cursor });
  return NextResponse.json(page);
}
