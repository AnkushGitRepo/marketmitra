import { NextResponse } from 'next/server';
import { getFund, getFundFacets } from '@/lib/funds/api';
import { bestByRow, MAX_COMPARE, parseCompareCodes } from '@/lib/funds/compare';
import { badRequest, unavailable } from '@/lib/funds/http';

// Public, read-only. Two or three funds side by side: each fund's detail, in the order asked,
// plus the winner of every comparison row (a tie or a missing figure never wins).
export async function GET(request: Request) {
  const codes = parseCompareCodes(new URL(request.url).searchParams.get('codes'));
  if (codes.length < 2) {
    return badRequest('invalid_codes', `codes must list 2 to ${MAX_COMPARE} different scheme codes, like codes=122639,149329`);
  }

  const found = await Promise.all(codes.map((code) => getFund(code)));
  const missing = codes.filter((_, i) => found[i] === null);
  if (missing.length > 0) {
    // The data service answers 404 for an unknown code and nothing at all when it is down; tell them apart.
    if ((await getFundFacets()).categories.length === 0) return unavailable();
    return NextResponse.json(
      { error: 'not_found', message: `No mutual fund with scheme code ${missing.join(', ')}.` },
      { status: 404 },
    );
  }

  const funds = found.flatMap((fund) => (fund ? [fund] : []));
  return NextResponse.json({ funds, best: bestByRow(funds) });
}
