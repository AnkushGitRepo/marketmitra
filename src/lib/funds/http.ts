import { NextResponse } from 'next/server';
import { parseSchemeCode } from './types';

// Public, read-only market data, same deliberate bare-JSON exception as
// GET /api/screener and GET /api/search (ADR 0012/0025): a pass-through of
// already-public data, so errors are `{ error, message }`, not the envelope.

export function badRequest(error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status: 400 });
}

export function unavailable(): NextResponse {
  return NextResponse.json(
    { error: 'data_unavailable', message: 'The mutual fund data service did not answer. Try again shortly.' },
    { status: 503 },
  );
}

export function notFound(): NextResponse {
  return NextResponse.json({ error: 'not_found', message: 'No mutual fund with that scheme code.' }, { status: 404 });
}

/** Resolve the `[code]` segment, or the 400 to return. */
export async function resolveSchemeCode(
  params: Promise<{ code: string }>,
): Promise<{ code: number } | { response: NextResponse }> {
  const raw = (await params).code;
  const code = parseSchemeCode(raw);
  return code === null
    ? { response: badRequest('invalid_scheme_code', `scheme code must be a positive integer, got "${raw.slice(0, 20)}"`) }
    : { code };
}
