import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ATTEMPTS,
  RETRY_AFTER_FAILURE_MS,
  STALE_SENDING_MS,
  canReclaim,
  claimWelcome,
  runWelcome,
  type WelcomeRecord,
  type WelcomeStatus,
  type WelcomeStore,
} from './sendOnce';

/** In-memory store with the same semantics as the Mongo one (unique userId, compare-and-set reclaim). */
function memoryStore(initial: WelcomeRecord[] = []): WelcomeStore & { rows: Map<string, WelcomeRecord> } {
  const rows = new Map(initial.map((r) => [r.userId, r]));
  return {
    rows,
    async find(id) {
      return rows.get(id) ?? null;
    },
    async insertClaim(r) {
      if (rows.has(r.userId)) return false;
      rows.set(r.userId, r);
      return true;
    },
    async reclaim(id, expected, next) {
      const cur = rows.get(id);
      if (!cur || cur.updatedAt.getTime() !== expected.getTime()) return false;
      rows.set(id, next);
      return true;
    },
    async setStatus(id, status: WelcomeStatus, now) {
      const cur = rows.get(id);
      if (cur) rows.set(id, { ...cur, status, updatedAt: now });
    },
  };
}

const T0 = new Date('2026-11-10T10:00:00Z');
const later = (ms: number) => new Date(T0.getTime() + ms);
const rec = (status: WelcomeStatus, attempts = 1, updatedAt = T0): WelcomeRecord => ({ userId: 'u1', status, attempts, updatedAt });

describe('canReclaim', () => {
  it('never re-sends a sent welcome', () => expect(canReclaim(rec('sent'), later(1e9))).toBe(false));

  it('waits out a fresh in-flight attempt, then reclaims a stuck one', () => {
    expect(canReclaim(rec('sending'), later(STALE_SENDING_MS - 1))).toBe(false);
    expect(canReclaim(rec('sending'), later(STALE_SENDING_MS))).toBe(true);
  });

  it('retries a failure only after the back-off, and only a few times', () => {
    expect(canReclaim(rec('failed'), later(RETRY_AFTER_FAILURE_MS - 1))).toBe(false);
    expect(canReclaim(rec('failed'), later(RETRY_AFTER_FAILURE_MS))).toBe(true);
    expect(canReclaim(rec('failed', MAX_ATTEMPTS), later(1e9))).toBe(false);
  });
});

describe('claimWelcome', () => {
  it('lets exactly one of many concurrent callers claim a new user', async () => {
    const store = memoryStore();
    const results = await Promise.all(Array.from({ length: 10 }, () => claimWelcome(store, 'u1', T0)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('lets exactly one concurrent caller reclaim a stuck record', async () => {
    const store = memoryStore([rec('sending')]);
    const results = await Promise.all(Array.from({ length: 10 }, () => claimWelcome(store, 'u1', later(STALE_SENDING_MS))));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(store.rows.get('u1')?.attempts).toBe(2);
  });

  it('refuses when the user was already welcomed', async () => {
    expect(await claimWelcome(memoryStore([rec('sent')]), 'u1', later(1e9))).toBe(false);
  });
});

describe('runWelcome', () => {
  it('sends once, records "sent", and never sends again', async () => {
    const store = memoryStore();
    const send = vi.fn(async () => true);
    expect(await runWelcome('u1', { store, now: () => T0, send })).toBe('sent');
    expect(await runWelcome('u1', { store, now: () => later(1e9), send })).toBe('not-claimed');
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.rows.get('u1')?.status).toBe('sent');
  });

  it('records a failed send, does not retry immediately, and retries after the back-off', async () => {
    const store = memoryStore();
    const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await runWelcome('u1', { store, now: () => T0, send })).toBe('failed');
    expect(await runWelcome('u1', { store, now: () => later(1000), send })).toBe('not-claimed');
    expect(await runWelcome('u1', { store, now: () => later(RETRY_AFTER_FAILURE_MS + 1), send })).toBe('sent');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('treats a throwing sender as a failed send, never an exception', async () => {
    const store = memoryStore();
    const send = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await runWelcome('u1', { store, now: () => T0, send })).toBe('failed');
    expect(store.rows.get('u1')?.status).toBe('failed');
  });

  it('returns failed (never throws) when the store itself breaks', async () => {
    const broken: WelcomeStore = { ...memoryStore(), insertClaim: async () => { throw new Error('db down'); } };
    expect(await runWelcome('u1', { store: broken, now: () => T0, send: async () => true })).toBe('failed');
  });
});
