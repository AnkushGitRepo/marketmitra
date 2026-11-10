// Read-only access for Mitra chat to the platform's own GET API (ADR 0036).
// The catalog is derived from public/openapi.json, so a new documented GET route is
// reachable automatically — minus a deny-list of anything that exposes secrets,
// runs jobs, is local-only, or is the chat's own storage. Only GET is ever issued.

export interface EndpointParam {
  readonly name: string;
  readonly in: 'path' | 'query';
}

export interface Endpoint {
  /** OpenAPI template, e.g. `/api/stock/{ticker}`. */
  readonly template: string;
  readonly summary: string;
  readonly params: readonly EndpointParam[];
}

interface OpenApiLike {
  readonly paths: Record<string, Record<string, { summary?: string; parameters?: ReadonlyArray<{ name: string; in: string }> }>>;
}

/** Prefixes (and exact paths) the chat can never reach, even though they are documented GETs. */
const DENIED: readonly string[] = [
  '/api/settings', // AI-key status, notification channels, guardrail settings
  '/api/cron', // scheduled jobs
  '/api/advisor', // local-only; has its own gated tools (ADR 0035)
  '/api/mitra/', // the chat's own conversations and files
  '/api/system/logs', // internal event log
  '/api/screener/export', // CSV download, not data for reasoning
  '/api/mcp',
  '/api/ai',
];

const isDenied = (path: string) => DENIED.some((d) => path === d || path.startsWith(d.endsWith('/') ? d : `${d}/`));

export function buildCatalog(spec: OpenApiLike): Endpoint[] {
  const out: Endpoint[] = [];
  for (const [template, ops] of Object.entries(spec.paths)) {
    const get = ops.get;
    if (!get || isDenied(template)) continue;
    const params = (get.parameters ?? [])
      .filter((p): p is { name: string; in: 'path' | 'query' } => p.in === 'path' || p.in === 'query')
      .map((p) => ({ name: p.name, in: p.in }));
    out.push({ template, summary: get.summary ?? template, params });
  }
  return out;
}

/** Compact catalog for the system prompt. */
export function describeCatalog(catalog: readonly Endpoint[]): string {
  return catalog
    .map((e) => {
      const q = e.params.filter((p) => p.in === 'query').map((p) => p.name);
      const shown = q.length > 8 ? `${q.slice(0, 8).join(', ')}, …` : q.join(', ');
      return `GET ${e.template} — ${e.summary}${shown ? ` (query: ${shown})` : ''}`;
    })
    .join('\n');
}

const SEGMENT = /^[A-Za-z0-9._-]{1,60}$/;
const MAX_QUERY_VALUE = 200;
export const MAX_RESPONSE_CHARS = 12_000;

export type Resolved = { readonly ok: true; readonly pathAndQuery: string } | { readonly ok: false; readonly error: string };

/** Validates a model-supplied path + query string against the catalog and rebuilds a safe relative URL. */
export function resolveRequest(catalog: readonly Endpoint[], path: string, query: string | undefined): Resolved {
  if (!path.startsWith('/api/') || path.includes('?') || path.includes('#') || path.includes('..')) {
    return { ok: false, error: 'path must be a plain /api/... path without a query string' };
  }
  const segments = path.split('/').slice(1);
  const endpoint = catalog.find((e) => {
    const t = e.template.split('/').slice(1);
    return (
      t.length === segments.length &&
      t.every((seg, i) => (seg.startsWith('{') ? SEGMENT.test(segments[i]) : seg === segments[i]))
    );
  });
  if (!endpoint) return { ok: false, error: `not an available endpoint: ${path}` };

  const allowed = new Set(endpoint.params.filter((p) => p.in === 'query').map((p) => p.name));
  const out = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(query ?? '')) {
    if (!allowed.has(k)) return { ok: false, error: `unknown query parameter "${k}" for ${endpoint.template}` };
    if (v.length > MAX_QUERY_VALUE) return { ok: false, error: `query value for "${k}" is too long` };
    out.append(k, v);
  }
  const qs = out.toString();
  return { ok: true, pathAndQuery: qs ? `${path}?${qs}` : path };
}

/** Caps a response body so one call cannot flood the context window. */
export function truncateBody(body: string): { text: string; truncated: boolean } {
  return body.length <= MAX_RESPONSE_CHARS
    ? { text: body, truncated: false }
    : { text: body.slice(0, MAX_RESPONSE_CHARS), truncated: true };
}
