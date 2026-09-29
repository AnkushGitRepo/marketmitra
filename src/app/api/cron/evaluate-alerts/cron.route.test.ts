import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { evaluateAlerts, isNseSession } = vi.hoisted(() => ({
  evaluateAlerts: vi.fn(),
  isNseSession: vi.fn(),
}));
vi.mock('@/lib/alerts/evaluate', () => ({ evaluateAlerts }));
vi.mock('@/lib/alerts/marketHours', () => ({ isNseSession }));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: vi.fn(async () => undefined) }));

import { GET } from './route';

const call = (url = 'http://localhost/api/cron/evaluate-alerts', headers: Record<string, string> = {}) =>
  GET(new Request(url, { headers }));

beforeEach(() => {
  vi.clearAllMocks();
  isNseSession.mockReturnValue(true);
  evaluateAlerts.mockResolvedValue({ activeAlerts: 0, symbolsQuoted: 0, notified: 0, skippedNoData: 0, errors: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cron auth guard', () => {
  it('503s in production when CRON_SECRET is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_SECRET', '');
    const res = await call();
    expect(res.status).toBe(503);
    expect(evaluateAlerts).not.toHaveBeenCalled();
  });

  it('runs in development when CRON_SECRET is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CRON_SECRET', '');
    const res = await call();
    expect(res.status).toBe(200);
    expect(evaluateAlerts).toHaveBeenCalled();
  });

  it('401s when CRON_SECRET is set but the bearer token is wrong or missing', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect((await call()).status).toBe(401);
    expect((await call('http://localhost/api/cron/evaluate-alerts', { authorization: 'Bearer nope' })).status).toBe(401);
    expect(evaluateAlerts).not.toHaveBeenCalled();
  });

  it('runs when the bearer token matches', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await call('http://localhost/api/cron/evaluate-alerts', { authorization: 'Bearer s3cret' });
    expect(res.status).toBe(200);
    expect(evaluateAlerts).toHaveBeenCalledOnce();
  });
});

describe('cron trading-hours gate', () => {
  beforeEach(() => vi.stubEnv('CRON_SECRET', ''));

  it('no-ops outside the NSE session', async () => {
    isNseSession.mockReturnValue(false);
    const res = await call();
    const body = await res.json();
    expect(body.data).toMatchObject({ ran: false, reason: 'outside NSE trading session' });
    expect(evaluateAlerts).not.toHaveBeenCalled();
  });

  it('?force=1 bypasses the session gate', async () => {
    isNseSession.mockReturnValue(false);
    const res = await call('http://localhost/api/cron/evaluate-alerts?force=1');
    const body = await res.json();
    expect(body.data.ran).toBe(true);
    expect(evaluateAlerts).toHaveBeenCalled();
  });

  it('returns 500 (not a thrown error) when the cycle fails', async () => {
    evaluateAlerts.mockRejectedValue(new Error('mongo down'));
    const res = await call();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, error: 'mongo down' });
  });
});
