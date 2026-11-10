// Exactly-once bookkeeping for the welcome email (#54).
//
// One record per user: status 'sending' | 'sent' | 'failed'. A request may send only if it wins a
// compare-and-set claim, so two tabs / devices / serverless instances cannot both send. A crashed
// attempt (stuck 'sending') is retried after a timeout; a failed send is retried later, a few times.

export type WelcomeStatus = 'sending' | 'sent' | 'failed';

export interface WelcomeRecord {
  readonly userId: string;
  readonly status: WelcomeStatus;
  readonly attempts: number;
  readonly updatedAt: Date;
  /** Why the last attempt failed (provider text), if it did. */
  readonly lastError?: string;
}

export const STALE_SENDING_MS = 10 * 60_000;
export const RETRY_AFTER_FAILURE_MS = 60 * 60_000;
export const MAX_ATTEMPTS = 3;

/** Whether an existing record may be re-claimed for another send attempt. */
export function canReclaim(record: WelcomeRecord, now: Date): boolean {
  if (record.status === 'sent') return false;
  if (record.attempts >= MAX_ATTEMPTS) return false;
  const age = now.getTime() - record.updatedAt.getTime();
  return record.status === 'sending' ? age >= STALE_SENDING_MS : age >= RETRY_AFTER_FAILURE_MS;
}

/** The storage operations the claim needs; the Mongo implementation lives in store.ts. */
export interface WelcomeStore {
  find(userId: string): Promise<WelcomeRecord | null>;
  /** Inserts a fresh 'sending' record. Returns false if one already exists (duplicate key). */
  insertClaim(record: WelcomeRecord): Promise<boolean>;
  /** Re-claims only if the stored `updatedAt` still equals `expected` (compare-and-set). */
  reclaim(userId: string, expected: Date, next: WelcomeRecord): Promise<boolean>;
  setStatus(userId: string, status: WelcomeStatus, now: Date, error?: string): Promise<void>;
}

/** True only for the single caller that is allowed to send now. */
export async function claimWelcome(store: WelcomeStore, userId: string, now: Date): Promise<boolean> {
  const fresh: WelcomeRecord = { userId, status: 'sending', attempts: 1, updatedAt: now };
  if (await store.insertClaim(fresh)) return true;
  const existing = await store.find(userId);
  if (!existing || !canReclaim(existing, now)) return false;
  return store.reclaim(userId, existing.updatedAt, { ...existing, status: 'sending', attempts: existing.attempts + 1, updatedAt: now });
}

export interface WelcomeDeps {
  readonly store: WelcomeStore;
  readonly now: () => Date;
  /** Whether the provider accepted the message, and why not if it didn't. Must not throw. */
  readonly send: () => Promise<SendOutcome>;
}

export type SendOutcome = { readonly ok: true } | { readonly ok: false; readonly error?: string };

export type WelcomeOutcome = 'sent' | 'failed' | 'not-claimed';

/** Claims, sends, and records the result. Never throws. */
export async function runWelcome(userId: string, deps: WelcomeDeps): Promise<WelcomeOutcome> {
  try {
    if (!(await claimWelcome(deps.store, userId, deps.now()))) return 'not-claimed';
    const outcome = await deps.send().catch((e: unknown): SendOutcome => ({ ok: false, error: e instanceof Error ? e.message : 'send threw' }));
    await deps.store.setStatus(userId, outcome.ok ? 'sent' : 'failed', deps.now(), outcome.ok ? undefined : outcome.error);
    return outcome.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
