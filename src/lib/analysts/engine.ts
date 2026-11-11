// An analyst's life, with its dependencies injected so the cost behaviour is testable (#128, ADR 0058):
//   initiate  - build the dossier once (one AI call), open the journal;
//   heartbeat - the daily check: free detection first, an AI call only for a material event and only under the daily cap.
// A plain recorded fact is always written for an event, so a missing key, a reached cap or a model failure never loses it.

import type { SignalBundle } from '@/lib/ai/stockSignalsServer';
import type { AiConfig } from '@/lib/ai/providers';
import type { z } from 'zod';
import { ANALYST_JOURNAL_SYSTEM, ANALYST_MEMO_SYSTEM } from '@/lib/ai/prompts';
import { canSpend, type Usage } from './caps';
import { detectEvents } from './events';
import { buildJournalPrompt, buildMemoPrompt, entrySchema, memoSchema, parseJournalEntry, parseMemo } from './memo';
import type { AlertLevel, AnalystSource, AnalystStatus, Dossier, JournalEntry, MaterialEvent, WatchState } from './types';

export interface AnalystRecord {
  userId: string;
  symbol: string;
  source: AnalystSource;
  status: AnalystStatus;
  statusNote: string | null;
  dossier: Dossier | null;
  watch: WatchState;
  lastCheckedAt: Date | null;
}

type Generated = { ok: true; text: string; model: string; finishReason?: string } | { ok: false; error: string };

export interface EngineDeps {
  now: () => Date;
  getAiConfig: (userId: string) => Promise<AiConfig | null>;
  loadData: (symbol: string) => Promise<SignalBundle | null>;
  loadDocuments: (symbol: string) => Promise<Array<{ title: string; url: string }>>;
  /** Asks for output matching `schema` where the provider supports it. The reply comes back as JSON text either way. */
  generate: (config: AiConfig, system: string, prompt: string, schema: z.ZodTypeAny) => Promise<Generated>;
  getUsage: (userId: string) => Promise<Usage>;
  bumpUsage: (userId: string, now: Date) => Promise<void>;
  appendJournal: (entry: Omit<JournalEntry, 'id'> & { userId: string }) => Promise<void>;
  saveDossier: (userId: string, symbol: string, dossier: Dossier, watch: WatchState) => Promise<void>;
  saveCheck: (userId: string, symbol: string, watch: WatchState, lastCheckedAt: Date) => Promise<void>;
  setStatus: (userId: string, symbol: string, status: AnalystStatus, note: string | null) => Promise<void>;
  /** A key-free diagnostic record (a short snippet of what the model said), written when a reply cannot be used. */
  log: (e: { source: string; message: string; meta: Record<string, unknown> }) => Promise<void>;
}

export type InitiateResult = 'initiated' | 'deferred' | 'needs_key' | 'error';
export type HeartbeatResult = 'quiet' | 'journaled' | 'skipped' | 'no_data';

const ALERT_ORDER: Record<AlertLevel, number> = { low: 0, medium: 1, high: 2 };

const maxAlert = (events: readonly MaterialEvent[]): AlertLevel => events.reduce<AlertLevel>((m, e) => (ALERT_ORDER[e.alert] > ALERT_ORDER[m] ? e.alert : m), 'low');

/** Results come from the peer table's row for this company. */
function resultsOf(bundle: SignalBundle) {
  const t = bundle.raw.peers.find((p) => p.is_target);
  if (!t) return null;
  const n = (v: string | null) => (v === null || !Number.isFinite(Number(v)) ? null : Number(v));
  return { netProfitQtr: n(t.net_profit_qtr), qtrProfitVarPct: n(t.qtr_profit_var_pct), qtrSalesVarPct: n(t.qtr_sales_var_pct) };
}

export async function initiate(a: AnalystRecord, deps: EngineDeps): Promise<InitiateResult> {
  const now = deps.now();
  if (!canSpend(await deps.getUsage(a.userId), now)) return 'deferred';
  const config = await deps.getAiConfig(a.userId);
  if (!config) {
    await deps.setStatus(a.userId, a.symbol, 'initializing', 'Waiting for an AI key. Add one in Settings.');
    return 'needs_key';
  }
  const bundle = await deps.loadData(a.symbol);
  if (!bundle) {
    await deps.setStatus(a.userId, a.symbol, 'error', 'Could not load data for this symbol.');
    return 'error';
  }

  const gen = await deps.generate(config, ANALYST_MEMO_SYSTEM, buildMemoPrompt(bundle.context, bundle.signals), memoSchema);
  await deps.bumpUsage(a.userId, now);
  if (!gen.ok) {
    await deps.setStatus(a.userId, a.symbol, 'error', `The AI provider returned an error: ${gen.error}`.slice(0, 300));
    return 'error';
  }
  const memo = parseMemo(gen.text);
  if (!memo) {
    const cutOff = gen.finishReason === 'length';
    await deps.log({
      source: 'analysts:initiate',
      message: cutOff ? 'Dossier reply was cut off by the output limit' : 'Dossier reply could not be parsed',
      meta: { symbol: a.symbol, finishReason: gen.finishReason, length: gen.text.length, snippet: gen.text.slice(0, 600) },
    });
    await deps.setStatus(a.userId, a.symbol, 'error', cutOff ? 'Mitra ran out of room before finishing the dossier. Resume the analyst to try again.' : 'Mitra returned a memo that could not be read. Resume the analyst to try again.');
    return 'error';
  }

  // The first look is a baseline: remember today's news, filings and results so only later changes are reported.
  const docs = await deps.loadDocuments(a.symbol).catch(() => []);
  const { nextWatch } = detectEvents({ symbol: a.symbol, bars: bundle.raw.bars, range52: bundle.raw.range52, news: bundle.raw.news, documents: docs, results: resultsOf(bundle), watch: a.watch });
  const dossier: Dossier = { ...memo, generatedAt: now.toISOString(), model: gen.model };
  await deps.saveDossier(a.userId, a.symbol, dossier, nextWatch);
  await deps.appendJournal({ userId: a.userId, symbol: a.symbol, ts: now.toISOString(), kind: 'initiation', title: `Analyst assigned to ${a.symbol}`, body: memo.summary || null, impact: null, alert: 'low' });
  return 'initiated';
}

export async function heartbeat(a: AnalystRecord, deps: EngineDeps): Promise<HeartbeatResult> {
  if (a.status !== 'active' || !a.dossier) return 'skipped';
  const now = deps.now();
  const bundle = await deps.loadData(a.symbol);
  if (!bundle) return 'no_data';
  const docs = await deps.loadDocuments(a.symbol).catch(() => []);

  const { events, nextWatch } = detectEvents({ symbol: a.symbol, bars: bundle.raw.bars, range52: bundle.raw.range52, news: bundle.raw.news, documents: docs, results: resultsOf(bundle), watch: a.watch });
  if (events.length === 0) {
    await deps.saveCheck(a.userId, a.symbol, nextWatch, now);
    return 'quiet';
  }

  const plain = { title: events.map((e) => e.title).join('; ').slice(0, 200), body: null, impact: null };
  let entry: { title: string; body: string | null; impact: JournalEntry['impact'] } = plain;
  // AI only when a key exists and the day's cap allows; otherwise the event is still recorded as a plain fact.
  const config = canSpend(await deps.getUsage(a.userId), now) ? await deps.getAiConfig(a.userId) : null;
  if (config) {
    const gen = await deps.generate(config, ANALYST_JOURNAL_SYSTEM, buildJournalPrompt(events, bundle.signals, a.dossier), entrySchema);
    await deps.bumpUsage(a.userId, now);
    const parsed = gen.ok ? parseJournalEntry(gen.text) : null;
    if (parsed) entry = { title: parsed.title || plain.title, body: parsed.body, impact: parsed.impact };
  }

  await deps.appendJournal({ userId: a.userId, symbol: a.symbol, ts: now.toISOString(), kind: events[0].kind, title: entry.title, body: entry.body, impact: entry.impact, alert: maxAlert(events) });
  await deps.saveCheck(a.userId, a.symbol, nextWatch, now);
  return 'journaled';
}
