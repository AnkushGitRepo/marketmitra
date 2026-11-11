import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { userId: 'u1' as string | null, preview: null as null | { title: string; priority: unknown[] }, report: { email: 'sent', detail: null } as { email: string; detail: string | null }, tested: 0 };

vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (h: unknown) => h }));
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/analysts/dispatch', () => ({ renderDispatchText: () => 'BODY' }));
vi.mock('@/lib/analysts/dispatchStore', () => ({ latestDispatch: async () => ({ day: '2026-11-11', title: 'Old brief' }) }));
vi.mock('@/lib/analysts/dispatchRun', () => ({ previewDispatch: async () => state.preview, sendTestDispatch: async () => (state.tested++, state.report) }));

const { GET, POST } = await import('./route');
const post = (body: unknown) => (POST as (r: Request) => Promise<Response>)(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  state.userId = 'u1';
  state.preview = null;
  state.report = { email: 'sent', detail: null };
  state.tested = 0;
});

describe('/api/analysts/dispatch', () => {
  it('is session only', async () => {
    state.userId = null;
    expect((await GET()).status).toBe(401);
    expect((await post({ action: 'test' })).status).toBe(401);
  });
  it('returns the latest saved brief and a preview with its text, or no preview when nothing is material', async () => {
    expect(((await (await GET()).json()) as { data: { latest: { title: string }; preview: unknown } }).data).toMatchObject({ latest: { title: 'Old brief' }, preview: null });
    state.preview = { title: 'Morning brief: 1 item needs a look', priority: [{}] };
    expect(((await (await GET()).json()) as { data: { preview: { body: string } } }).data.preview.body).toBe('BODY');
  });
  it('rejects anything but a test action', async () => {
    expect((await post({ action: 'send-all' })).status).toBe(422);
    expect(state.tested).toBe(0);
  });
  it('sends a test and says in plain words what happened', async () => {
    expect(((await (await post({ action: 'test' })).json()) as { data: { message: string } }).data.message).toBe('Test email sent.');
    state.report = { email: 'skipped', detail: 'disabled' };
    expect(((await (await post({ action: 'test' })).json()) as { data: { message: string } }).data.message).toMatch(/turned off/);
    state.report = { email: 'failed', detail: 'boom' };
    expect(((await (await post({ action: 'test' })).json()) as { data: { message: string } }).data.message).toMatch(/could not be sent/);
  });
});
