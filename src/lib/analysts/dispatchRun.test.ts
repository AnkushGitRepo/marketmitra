import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JournalEntry } from './types';

const NOW = new Date('2026-11-12T03:00:00Z');
const state = {
  analysts: [{ symbol: 'ACC', status: 'active', dossier: { summary: 'Low debt.' } }] as Array<{ symbol: string; status: string; dossier: { summary: string } | null }>,
  entries: [] as JournalEntry[],
  route: { kind: 'send', to: 'me@example.com' } as { kind: 'send'; to: string } | { kind: 'skip'; reason: string },
  emailStatus: 'sent' as 'sent' | 'skipped' | 'error',
  claimed: true,
  delivered: [] as Array<{ title: string; body: string; channels: unknown }>,
  outcomes: [] as Array<[string, string | null]>,
};

vi.mock('./store', () => ({ listAnalysts: async () => state.analysts, recentEntries: async () => state.entries }));
vi.mock('./dispatchStore', () => ({
  saveDispatch: async () => state.claimed,
  setDispatchOutcome: async (_u: string, _d: string, email: string, detail: string | null) => void state.outcomes.push([email, detail]),
}));
vi.mock('@/lib/notifications/deliver', () => ({
  resolveEmailRoute: async () => state.route,
  deliverNotification: async (_u: string, p: { title: string; body: string }, channels: { email?: string | false }) => (
    state.delivered.push({ title: p.title, body: p.body, channels }),
    { notification: {}, results: channels.email ? [{ channel: 'email', status: state.emailStatus, detail: state.emailStatus === 'error' ? 'boom' : undefined }] : [] }
  ),
}));

const { previewDispatch, runDispatch, sendTestDispatch } = await import('./dispatchRun');
const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({ id: 'e', symbol: 'ACC', ts: '2026-11-11T14:00:00Z', kind: 'earnings', title: 'Results out', body: null, impact: null, alert: 'low', ...over });

beforeEach(() => {
  state.entries = [entry()];
  state.route = { kind: 'send', to: 'me@example.com' };
  state.emailStatus = 'sent';
  state.claimed = true;
  state.delivered = [];
  state.outcomes = [];
});

describe('runDispatch', () => {
  it('delivers a saved brief by email and in-app only, and records the outcome', async () => {
    const r = await runDispatch('u1', NOW);
    expect(r).toEqual({ kind: 'sent', report: { email: 'sent', detail: null } });
    expect(state.delivered).toHaveLength(1);
    expect(state.delivered[0].channels).toEqual({ email: 'me@example.com' });
    expect(state.outcomes).toEqual([['sent', null]]);
  });
  it('sends nothing when nothing is material, and nothing when the day was already claimed', async () => {
    state.entries = [];
    expect(await runDispatch('u1', NOW)).toEqual({ kind: 'nothing' });
    state.entries = [entry()];
    state.claimed = false;
    expect(await runDispatch('u1', NOW)).toEqual({ kind: 'already' });
    expect(state.delivered).toHaveLength(0);
  });
  it('still records the in-app brief when the email is switched off, saying why', async () => {
    state.route = { kind: 'skip', reason: 'disabled' };
    const r = await runDispatch('u1', NOW);
    expect(r).toEqual({ kind: 'sent', report: { email: 'skipped', detail: 'disabled' } });
    expect(state.delivered[0].channels).toEqual({ email: false, emailSkipped: 'disabled' });
  });
  it('reports a failed email without losing the brief', async () => {
    state.emailStatus = 'error';
    expect(await runDispatch('u1', NOW)).toEqual({ kind: 'sent', report: { email: 'failed', detail: 'boom' } });
  });
});

describe('previewDispatch and sendTestDispatch', () => {
  it('previews without delivering anything', async () => {
    expect((await previewDispatch('u1', NOW))?.priority).toHaveLength(1);
    expect(state.delivered).toHaveLength(0);
  });
  it('sends a [Test] email of the preview, or a short test note when nothing is material', async () => {
    await sendTestDispatch('u1', NOW);
    expect(state.delivered[0].title).toMatch(/^\[Test\] Morning brief: 1 item needs a look/);
    state.entries = [];
    await sendTestDispatch('u1', NOW);
    expect(state.delivered[1].title).toBe('[Test] Morning brief');
    expect(state.delivered[1].body).toMatch(/would not be sent today/);
  });
});
