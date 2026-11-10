import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import spec from '../../../public/openapi.json';
import { buildCatalog, describeCatalog, resolveRequest, truncateBody, type Endpoint } from './platformApi';

const REQUEST_TIMEOUT_MS = 10_000;

export const PLATFORM_CATALOG: readonly Endpoint[] = buildCatalog(spec as Parameters<typeof buildCatalog>[0]);
export const PLATFORM_CATALOG_TEXT = describeCatalog(PLATFORM_CATALOG);

interface PlatformRequestContext {
  /** Same-origin base URL of this deployment, from the incoming request. */
  readonly origin: string;
  /** The caller's own cookie header, so the call runs as the same user. */
  readonly cookie: string | null;
}

/**
 * `call_platform_api`: GET-only access to every documented, non-denied platform
 * endpoint, run as the signed-in user. Errors come back as data so the model can
 * adjust, never as an exception that ends the turn.
 */
export function buildPlatformApiTools(ctx: PlatformRequestContext): ToolSet {
  return {
    call_platform_api: tool({
      description:
        "Fetch data from MarketMitra's own API (read-only GET). Use it for anything about the user's portfolio, alerts, notes, watchlists, notifications, screener results, a stock's fundamentals and prices, news, IPOs and system status — whenever a fact would improve the answer. See the endpoint list in the instructions.",
      inputSchema: z.object({
        path: z.string().describe('Concrete path, e.g. /api/stock/TCS or /api/holdings. No query string here.'),
        query: z.string().optional().describe('URL-encoded query string without the leading ?, e.g. "pe_max=25&sector=Information%20Technology".'),
      }),
      execute: async ({ path, query }) => {
        const resolved = resolveRequest(PLATFORM_CATALOG, path, query);
        if (!resolved.ok) return { ok: false, error: resolved.error };
        try {
          const res = await fetch(`${ctx.origin}${resolved.pathAndQuery}`, {
            method: 'GET',
            headers: { accept: 'application/json', ...(ctx.cookie ? { cookie: ctx.cookie } : {}) },
            redirect: 'error',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          const { text, truncated } = truncateBody(await res.text());
          return { ok: res.ok, status: res.status, truncated, body: text };
        } catch {
          return { ok: false, error: 'The request failed or timed out.' };
        }
      },
    }),
  };
}
