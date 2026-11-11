// MongoDB store for personal access tokens (ADR 0053). Only a SHA-256 hash of each
// token is persisted; the plaintext is returned once, at creation.

import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { logEvent } from '@/lib/system/eventLog';
import {
  MAX_ACTIVE_TOKENS,
  expiryFor,
  generateToken,
  hashToken,
  isUsable,
  type CreateTokenInput,
  type TokenScope,
} from './pat';

export type TokenStatus = 'active' | 'expired' | 'revoked';

interface TokenDoc {
  _id: ObjectId;
  userId: string;
  name: string;
  scope: TokenScope;
  /** First characters of the token (the non-secret `mm_pat_r_` plus a little), to recognise it in the list. */
  prefix: string;
  hash: string;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

/** What the API and UI may see: never the hash. */
export interface TokenView {
  id: string;
  name: string;
  scope: TokenScope;
  prefix: string;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  status: TokenStatus;
}

export class TokenLimitError extends Error {
  constructor() {
    super(`You can have at most ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.`);
    this.name = 'TokenLimitError';
  }
}

const PREFIX_LENGTH = 13;
/** `lastUsedAt` is refreshed at most this often, so a busy script does not write on every request. */
const LAST_USED_REFRESH_MS = 5 * 60_000;

async function collection() {
  const db = await getDb();
  return db.collection<TokenDoc>('apiTokens');
}

export async function ensureTokenIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndexes([
    { key: { hash: 1 }, name: 'hash_unique', unique: true },
    { key: { userId: 1, createdAt: -1 }, name: 'user_created' },
  ]);
}

function statusOf(doc: TokenDoc, now: Date): TokenStatus {
  if (doc.revokedAt) return 'revoked';
  return isUsable(doc, now) ? 'active' : 'expired';
}

function toView(doc: TokenDoc, now: Date): TokenView {
  return {
    id: doc._id.toString(),
    name: doc.name,
    scope: doc.scope,
    prefix: doc.prefix,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    lastUsedAt: doc.lastUsedAt,
    status: statusOf(doc, now),
  };
}

export async function listTokens(userId: string, now: Date = new Date()): Promise<TokenView[]> {
  const col = await collection();
  const docs = await col.find({ userId }).sort({ createdAt: -1 }).toArray();
  return docs.map((d) => toView(d, now));
}

export async function createToken(
  userId: string,
  input: CreateTokenInput,
  now: Date = new Date()
): Promise<{ token: string; view: TokenView }> {
  const col = await collection();
  const live = (await col.find({ userId, revokedAt: null }).toArray()).filter((d) => isUsable(d, now));
  if (live.length >= MAX_ACTIVE_TOKENS) throw new TokenLimitError();

  const token = generateToken(input.scope, randomBytes(32));
  const doc: TokenDoc = {
    _id: new ObjectId(),
    userId,
    name: input.name,
    scope: input.scope,
    prefix: token.slice(0, PREFIX_LENGTH),
    hash: hashToken(token),
    createdAt: now,
    expiresAt: expiryFor(input.expiry, now),
    lastUsedAt: null,
    revokedAt: null,
  };
  await col.insertOne(doc);
  // Two parallel creates can both pass the check above. Recount after inserting and back out if over the cap.
  const after = (await col.find({ userId, revokedAt: null }).toArray()).filter((d) => isUsable(d, now));
  if (after.length > MAX_ACTIVE_TOKENS) {
    await col.deleteOne({ _id: doc._id });
    throw new TokenLimitError();
  }
  await logEvent({ level: 'info', source: 'tokens', message: 'Access token created', meta: { tokenId: doc._id.toString(), scope: doc.scope } });
  return { token, view: toView(doc, now) };
}

export async function revokeToken(userId: string, id: string, now: Date = new Date()): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await collection();
  const res = await col.updateOne({ _id: new ObjectId(id), userId, revokedAt: null }, { $set: { revokedAt: now } });
  if (res.modifiedCount === 0) return false;
  await logEvent({ level: 'info', source: 'tokens', message: 'Access token revoked', meta: { tokenId: id } });
  return true;
}

/** The owner and scope of a live token, or null for unknown / revoked / expired. */
export async function resolveToken(
  token: string,
  now: Date = new Date()
): Promise<{ id: string; userId: string; scope: TokenScope } | null> {
  const col = await collection();
  const doc = await col.findOne({ hash: hashToken(token) });
  if (!doc || !isUsable(doc, now)) return null;
  if (!doc.lastUsedAt || now.getTime() - doc.lastUsedAt.getTime() >= LAST_USED_REFRESH_MS) {
    // Best effort: failing to record last use must never fail the request.
    await col.updateOne({ _id: doc._id }, { $set: { lastUsedAt: now } }).catch(() => undefined);
  }
  return { id: doc._id.toString(), userId: doc.userId, scope: doc.scope };
}
