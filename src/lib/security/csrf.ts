export interface WriteRequestInfo {
  method: string;
  origin: string | null;
  host: string | null;
  secFetchSite: string | null;
}

/** True for a state-changing request that a *browser* is making on behalf of
 * another website (classic CSRF). Browsers always attach `Origin` (and
 * `Sec-Fetch-Site`) to cross-origin writes, so those are the signal; a request
 * with neither header isn't a browser (curl, cron, SDK) and is left to the
 * route's own bearer/session auth. This backs up SameSite cookies, and is the
 * only protection for self-hosted instances, which have no login at all. */
export function isCrossSiteWrite({ method, origin, host, secFetchSite }: WriteRequestInfo): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  if (secFetchSite === 'cross-site' || secFetchSite === 'same-site') return true;
  if (origin === null) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
