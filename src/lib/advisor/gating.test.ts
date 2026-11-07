import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/advisor/policy/store', () => ({
  getPolicy: vi.fn(async () => null),
  savePolicy: vi.fn(),
  hasAcknowledged: vi.fn(async () => true),
  recordAcknowledgement: vi.fn(),
}));

vi.mock('@/lib/advisor/journal/store', () => ({ createEntry: vi.fn(), listEntries: vi.fn(async () => []), recordAction: vi.fn(), listMonitoredEntries: vi.fn(async () => []), appendFiring: vi.fn() }));
vi.mock('@/lib/advisor/performance/service', () => ({ getPerformance: vi.fn(), BENCHMARK_SYMBOL: 'NIFTYBEES' }));
vi.mock('@/lib/advisor/journal/review', () => ({ runKillReview: vi.fn() }));
vi.mock('@/lib/advisor/memo/service', () => ({ createMemo: vi.fn() }));
vi.mock('@/lib/advisor/memo/store', () => ({ latestMemo: vi.fn(async () => null), saveMemo: vi.fn() }));

import { GET as getPolicyRoute, PUT as putPolicyRoute } from '@/app/api/advisor/policy/route';
import { GET as getPlanRoute } from '@/app/api/advisor/plan/route';
import { GET as getMemoRoute, POST as postMemoRoute } from '@/app/api/advisor/memo/route';
import { GET as getScreenRoute } from '@/app/api/advisor/screen/route';
import { GET as getAck, POST as postAck } from '@/app/api/advisor/acknowledge/route';
import { recordAcknowledgement, savePolicy } from '@/lib/advisor/policy/store';
import { GET as getJournal, POST as postJournal } from '@/app/api/advisor/journal/route';
import { PATCH as patchJournal } from '@/app/api/advisor/journal/[id]/route';
import { POST as postReview } from '@/app/api/advisor/review/route';
import { GET as cronGet, POST as cronPost } from '@/app/api/cron/advisor-review/route';
import { GET as getPerformanceRoute } from '@/app/api/advisor/performance/route';
import { getPerformance } from '@/lib/advisor/performance/service';
import { runKillReview } from '@/lib/advisor/journal/review';
import { createMemo } from '@/lib/advisor/memo/service';

const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init);

describe('advisor flag gating', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('every advisor route returns 404 when the flag is off', async () => {
    vi.stubEnv('ADVISOR_MODE', '');
    const responses = await Promise.all([
      getPolicyRoute(req('/api/advisor/policy')),
      putPolicyRoute(req('/api/advisor/policy', { method: 'PUT', body: '{}' })),
      getPlanRoute(req('/api/advisor/plan')),
      getScreenRoute(req('/api/advisor/screen?symbol=TCS')),
      getMemoRoute(req('/api/advisor/memo?symbol=TCS')),
      postMemoRoute(req('/api/advisor/memo', { method: 'POST', body: '{"symbol":"TCS"}' })),
      getJournal(),
      postJournal(req('/api/advisor/journal', { method: 'POST', body: '{}' })),
      patchJournal(req('/api/advisor/journal/x', { method: 'PATCH', body: '{}' }), { params: Promise.resolve({ id: 'x' }) }),
      postReview(),
      cronGet(req('/api/cron/advisor-review')),
      cronPost(req('/api/cron/advisor-review', { method: 'POST' })),
      getPerformanceRoute(),
      getAck(),
      postAck(),
    ]);
    expect(responses.map((r) => r.status)).toEqual(Array(15).fill(404));
    expect(savePolicy).not.toHaveBeenCalled();
    expect(createMemo).not.toHaveBeenCalled();
    expect(runKillReview).not.toHaveBeenCalled();
    expect(getPerformance).not.toHaveBeenCalled();
    expect(recordAcknowledgement).not.toHaveBeenCalled();
  });

  it('every advisor route returns 404 on a hosted deployment', async () => {
    vi.stubEnv('ADVISOR_MODE', 'enabled');
    vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_MODE', 'hosted');
    const res = await getPolicyRoute(req('/api/advisor/policy'));
    expect(res.status).toBe(404);
  });

  it('routes work when enabled locally', async () => {
    vi.stubEnv('ADVISOR_MODE', 'enabled');
    const res = await getPolicyRoute(req('/api/advisor/policy'));
    expect(res.status).toBe(200);
    const plan = await getPlanRoute(req('/api/advisor/plan'));
    expect(plan.status).toBe(409); // no policy saved yet
  });

  it('registers no advisor cron anywhere', () => {
    const vercel = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8');
    expect(vercel).not.toMatch(/advisor/i);
    const dir = join(process.cwd(), '.github', 'workflows');
    for (const f of readdirSync(dir)) {
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/advisor/i);
    }
  });
});
