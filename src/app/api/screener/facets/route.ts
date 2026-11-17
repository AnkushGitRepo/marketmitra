import { NextResponse } from 'next/server';
import { getScreenerFacets } from '@/lib/dashboard/screener';
import { screenerFiltersSchema } from '@/lib/dashboard/screenerSchema';

// Public, read-only. `?sector=` narrows `industries` to that sector so the
// Screener's industry dropdown only offers industries that exist inside it.
// `?board=mainboard|sme|all` counts one listing board (default: main board).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sector = params.get('sector')?.trim().slice(0, 128);
  const board = screenerFiltersSchema.shape.board.safeParse(params.get('board') ?? undefined);
  return NextResponse.json(await getScreenerFacets(sector || undefined, board.success ? board.data : undefined));
}
