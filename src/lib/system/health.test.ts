import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbPing = vi.fn(async () => ({ ok: 1 }));
vi.mock('@/lib/mongodb', () => ({
  getDb: async () => ({ command: dbPing }),
}));

let rateLimitEnabled = false;
const pingRedis = vi.fn(async () => undefined);
vi.mock('@/lib/rateLimit', () => ({
  get rateLimitEnabled() {
    return rateLimitEnabled;
  },
  pingRedis: () => pingRedis(),
}));

let hosted = true;
vi.mock('@/lib/deployment-mode', () => ({
  isHosted: () => hosted,
}));

vi.mock('@/lib/mcp/tools', () => ({
  tools: [{ name: 'search_symbols' }, { name: 'get_quote' }],
}));

const latestEventPerSource = vi.fn(async (sources: string[]) =>
  Object.fromEntries(sources.map((s) => [s, null]))
);
vi.mock('./eventLog', () => ({
  latestEventPerSource: (...args: [string[]]) => latestEventPerSource(...args),
}));

const fetchMock = vi.fn();

const { getSystemStatus } = await import('./health');

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitEnabled = false;
  hosted = true;
  dbPing.mockResolvedValue({ ok: 1 });
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  process.env.CLERK_SECRET_KEY = 'sk_test_x';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_x';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getSystemStatus', () => {
  it('reports every component operational in the healthy/hosted/rate-limited case', async () => {
    rateLimitEnabled = true;
    const status = await getSystemStatus();
    expect(status.overall).toBe('operational');
    const byId = Object.fromEntries(status.components.map((c) => [c.id, c]));
    expect(byId.mongodb.status).toBe('operational');
    expect(byId['fundamentals-api'].status).toBe('operational');
    expect(byId.mcp.status).toBe('operational');
    expect(byId['rate-limit'].status).toBe('operational');
    expect(byId.auth.status).toBe('operational');
    expect(status.crons).toHaveLength(3);
    expect(status.crons.every((c) => c.lastRun === null)).toBe(true);
  });

  it('reports rate-limit and auth as not_configured in self-host mode', async () => {
    hosted = false;
    const status = await getSystemStatus();
    const byId = Object.fromEntries(status.components.map((c) => [c.id, c]));
    expect(byId['rate-limit'].status).toBe('not_configured');
    expect(byId.auth.status).toBe('not_configured');
    // Overall only weighs mongo/fundamentals-api/mcp, so self-host's
    // expected "not configured" extras don't drag it down.
    expect(status.overall).toBe('operational');
  });

  it('marks mongo down on a failed ping without throwing', async () => {
    dbPing.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const status = await getSystemStatus();
    const mongo = status.components.find((c) => c.id === 'mongodb')!;
    expect(mongo.status).toBe('down');
    expect(mongo.detail).toContain('ECONNREFUSED');
    expect(status.overall).toBe('down');
  });

  it('marks fundamentals-api degraded on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const status = await getSystemStatus();
    const api = status.components.find((c) => c.id === 'fundamentals-api')!;
    expect(api.status).toBe('degraded');
    expect(status.overall).toBe('degraded');
  });

  it('does not fail the whole status when the event log lookup throws', async () => {
    latestEventPerSource.mockRejectedValueOnce(new Error('collection unavailable'));
    const status = await getSystemStatus();
    expect(status.crons).toHaveLength(3);
    expect(status.crons.every((c) => c.lastRun === null)).toBe(true);
  });
});
