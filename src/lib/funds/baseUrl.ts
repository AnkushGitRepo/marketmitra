// Which data service the mutual fund pages and /api/funds/* talk to.
//
// `FUNDS_API_URL` is optional and only moves funds: unset (or blank) it falls back to
// `FUNDAMENTALS_API_URL`, so nothing changes for anyone who does not set it. The use is a
// maintainer whose hosted service does not have the funds data yet: keep
// `FUNDAMENTALS_API_URL` on the hosted service for stocks, IPOs and news, and point
// `FUNDS_API_URL` at a local service filled with `refresh_funds.py seed` (issue #224).

export const DEFAULT_DATA_SERVICE_URL = 'http://localhost:8420';

type Env = Readonly<Record<string, string | undefined>>;

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '');
  return trimmed ? trimmed : null;
}

/** Read per call (never frozen at import), so a changed environment is picked up. */
export function fundsBaseUrl(env: Env = process.env): string {
  return clean(env.FUNDS_API_URL) ?? clean(env.FUNDAMENTALS_API_URL) ?? DEFAULT_DATA_SERVICE_URL;
}
