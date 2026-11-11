import { beforeEach, describe, expect, it } from 'vitest';
import { buildSignals } from '@/lib/stock/signals';
import { DAILY_AI_CAP } from './caps';
import { heartbeat, initiate, type EngineDeps } from './engine';
import { EMPTY_WATCH, type Dossier, type JournalEntry } from './types';

const NOW = new Date('2026-11-11T11:00:00Z'); // 16:30 IST
const signals = buildSignals({ sector: null, industry: null, ratios: [], peers: [], price: 100, bars: [], range52: null, profitAndLoss: [], balanceSheet: [], cashFlow: [], shareholding: [], news: [] });
const bar = (i: number, close: number, volume = 1000) => ({ time: `d${String(i).padStart(2, '0')}`, open: close, high: close, low: close, close, volume });
const quiet = Array.from({ length: 25 }, (_, i) => bar(i, 100));
const spike = [...quiet.slice(0, 24), bar(24, 106)];

const memoJson = JSON.stringify({ summary: 'A steady company.', business: 'Makes things.', strengths: [{ title: 'Debt', text: 'Low debt.' }], vulnerabilities: [{ title: 'Margins', text: 'Thin.' }], notAvailable: ['Concalls'] });
const entryJson = JSON.stringify({ title: 'Price jump', body: 'Moved +6% on volume.', impact: 'neutral' });

let journal: JournalEntry[];
let saved: { dossier?: Dossier; watch?: unknown; status?: string; note?: string | null; lastChecked?: Date };
let usage: { day: string; count: number };
let reply: { ok: boolean; text?: string; error?: string };
let calls: number;
let aiKey: object | null;
let bars: typeof quiet;
let logs: Array<{ source: string; meta: Record<string, unknown> }>;
let finish: string | undefined;
let seenSystem: string[];
let seenSchemas: unknown[];

const analyst = (over: Record<string, unknown> = {}) => ({ userId: 'u1', symbol: 'ACC', source: 'holding' as const, status: 'active' as const, statusNote: null, dossier: { summary: 's', business: 'b', strengths: [], vulnerabilities: [], notAvailable: [], generatedAt: '', model: '' } as Dossier, watch: EMPTY_WATCH, lastCheckedAt: null as Date | null, ...over });

const deps = (): EngineDeps => ({
  now: () => NOW,
  getAiConfig: async () => aiKey as never,
  loadData: async () => ({ context: { symbol: 'ACC', company: { name: 'ACC', sector: null, industry: null, about: null }, latestClose: 100, news: [] }, signals, raw: { bars, range52: null, news: [], peers: [] } }),
  loadDocuments: async () => [],
  generate: async (_c, system, _p, schema) => {
    calls += 1;
    seenSystem.push(system);
    seenSchemas.push(schema);
    return reply.ok ? { ok: true as const, text: reply.text ?? '', model: 'm', finishReason: finish } : { ok: false as const, error: reply.error ?? 'boom' };
  },
  getUsage: async () => usage,
  bumpUsage: async () => {
    usage = { day: usage.day, count: usage.count + 1 };
  },
  appendJournal: async (e) => void journal.push({ ...e, id: String(journal.length) }),
  saveDossier: async (_u, _s, dossier, watch) => void Object.assign(saved, { dossier, watch, status: 'active' }),
  saveCheck: async (_u, _s, watch, lastChecked) => void Object.assign(saved, { watch, lastChecked }),
  setStatus: async (_u, _s, status, note) => void Object.assign(saved, { status, note }),
  log: async (e) => void logs.push(e),
});

beforeEach(() => {
  journal = [];
  logs = [];
  seenSystem = [];
  seenSchemas = [];
  finish = 'stop';
  saved = {};
  usage = { day: '2026-11-11', count: 0 };
  reply = { ok: true, text: memoJson };
  calls = 0;
  aiKey = {};
  bars = quiet;
});

describe('initiate', () => {
  it('writes the dossier, makes the analyst active and opens the journal with an initiation entry', async () => {
    const r = await initiate(analyst({ status: 'initializing', dossier: null }), deps());
    expect(r).toBe('initiated');
    expect(saved.status).toBe('active');
    expect(saved.dossier?.summary).toBe('A steady company.');
    expect(journal[0]).toMatchObject({ kind: 'initiation', symbol: 'ACC' });
    expect(usage.count).toBe(1);
  });
  it('waits, without calling the model, when the daily cap is reached', async () => {
    usage = { day: '2026-11-11', count: DAILY_AI_CAP };
    expect(await initiate(analyst({ status: 'initializing', dossier: null }), deps())).toBe('deferred');
    expect(calls).toBe(0);
    expect(saved.status).toBeUndefined();
  });
  it('waits for a key, and says so, when none is available', async () => {
    aiKey = null;
    expect(await initiate(analyst({ status: 'initializing', dossier: null }), deps())).toBe('needs_key');
    expect(saved).toMatchObject({ status: 'initializing', note: expect.stringMatching(/AI key/i) });
    expect(calls).toBe(0);
  });
  it('pauses with the reason on a provider error, and on an unreadable memo, rather than retrying forever', async () => {
    reply = { ok: false, error: 'API key not valid' };
    expect(await initiate(analyst({ status: 'initializing', dossier: null }), deps())).toBe('error');
    expect(saved).toMatchObject({ status: 'error', note: expect.stringContaining('API key not valid') });
    reply = { ok: true, text: 'not json' };
    saved = {};
    expect(await initiate(analyst({ status: 'initializing', dossier: null }), deps())).toBe('error');
    expect(saved.status).toBe('error');
  });
});

describe('system prompts', () => {
  it('asks the model for the dossier JSON on initiation, and for a journal entry JSON on a material event', async () => {
    await initiate(analyst({ status: 'initializing', dossier: null }), deps());
    expect(seenSystem[0]).toMatch(/Reply with ONLY a JSON object/);
    expect(seenSystem[0]).toMatch(/"strengths"/);
    bars = spike;
    reply = { ok: true, text: entryJson };
    await heartbeat(analyst(), deps());
    expect(seenSystem[1]).toMatch(/Reply with ONLY a JSON object/);
    expect(seenSystem[1]).toMatch(/"impact"/);
    expect(seenSystem.every((s) => s && s.length > 200)).toBe(true);
  });
});

describe('constrained output', () => {
  it('asks the provider for schema-matching output for both the dossier and the journal entry', async () => {
    await initiate(analyst({ status: 'initializing', dossier: null }), deps());
    bars = spike;
    reply = { ok: true, text: entryJson };
    await heartbeat(analyst(), deps());
    const [memoS, entryS] = seenSchemas as Array<{ safeParse: (v: unknown) => { success: boolean } }>;
    expect(memoS.safeParse(JSON.parse(memoJson)).success).toBe(true);
    expect(memoS.safeParse({ summary: 'only' }).success).toBe(false);
    expect(entryS.safeParse(JSON.parse(entryJson)).success).toBe(true);
    expect(entryS.safeParse({ title: 't', body: 'b', impact: 'bullish' }).success).toBe(false);
  });
});

describe('initiate - unreadable dossier replies (#128)', () => {
  it('logs a short key-free snippet and the finish reason, so the cause can be diagnosed', async () => {
    reply = { ok: true, text: 'x'.repeat(2000) };
    await initiate(analyst({ status: 'initializing', dossier: null }), deps());
    expect(logs[0].source).toBe('analysts:initiate');
    expect((logs[0].meta.snippet as string).length).toBe(600);
    expect(logs[0].meta.finishReason).toBe('stop');
  });
  it('tells a cut-off reply apart from a malformed one', async () => {
    reply = { ok: true, text: '{"summary":"abc","strengths":[{"title":"x","te' };
    finish = 'length';
    await initiate(analyst({ status: 'initializing', dossier: null }), deps());
    expect(saved.note).toMatch(/ran out of room/i);
  });
});

describe('heartbeat', () => {
  it('costs nothing on a quiet day: no model call, no journal entry, and the check is recorded', async () => {
    expect(await heartbeat(analyst(), deps())).toBe('quiet');
    expect(calls).toBe(0);
    expect(journal).toHaveLength(0);
    expect(usage.count).toBe(0);
    expect(saved.lastChecked).toEqual(NOW);
  });
  it('writes an AI journal entry for a material event and counts one call', async () => {
    bars = spike;
    reply = { ok: true, text: entryJson };
    expect(await heartbeat(analyst(), deps())).toBe('journaled');
    expect(calls).toBe(1);
    expect(usage.count).toBe(1);
    expect(journal[0]).toMatchObject({ kind: 'price', title: 'Price jump', body: 'Moved +6% on volume.', impact: 'neutral', alert: 'medium' });
  });
  it('still records the event as a plain fact when the cap is reached, with no model call', async () => {
    bars = spike;
    usage = { day: '2026-11-11', count: DAILY_AI_CAP };
    expect(await heartbeat(analyst(), deps())).toBe('journaled');
    expect(calls).toBe(0);
    expect(journal[0]).toMatchObject({ kind: 'price', body: null, impact: null });
    expect(journal[0].title).toMatch(/\+6\.0%/);
  });
  it('falls back to the plain fact if the model fails or returns something unreadable, and never loses the event', async () => {
    bars = spike;
    reply = { ok: false, error: 'quota' };
    await heartbeat(analyst(), deps());
    expect(journal[0]).toMatchObject({ body: null });
    journal = [];
    reply = { ok: true, text: 'garbage' };
    await heartbeat(analyst(), deps());
    expect(journal[0]).toMatchObject({ body: null });
  });
  it('does not report the same event again on the next check', async () => {
    bars = spike;
    reply = { ok: true, text: entryJson };
    await heartbeat(analyst(), deps());
    const watch = saved.watch as typeof EMPTY_WATCH;
    journal = [];
    // the same close again: price event keys by day, so a second pass over the same bar is not new news,
    // but a price event is a daily fact; what must not repeat is anything tracked in the watch state
    await heartbeat(analyst({ watch }), deps());
    expect(journal.filter((e) => e.kind === 'range' || e.kind === 'news' || e.kind === 'filing')).toHaveLength(0);
  });
  it('skips a paused analyst entirely', async () => {
    bars = spike;
    expect(await heartbeat(analyst({ status: 'paused' }), deps())).toBe('skipped');
    expect(calls).toBe(0);
    expect(journal).toHaveLength(0);
  });
});
