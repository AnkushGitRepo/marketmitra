// User-authored notes (Phase 10 / ADR 0020) — a small per-user store that
// also feeds the caller's private retrieval corpus. "Keep a note on why I
// hold X", "watch this sector", etc.

import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { MAX_NOTES_PER_USER, MAX_TICKERS, MAX_TITLE, bodyLimit, type NoteSource } from './limits';

export { MAX_BODY, MAX_NOTES_PER_USER, MAX_RESEARCH_BODY, MAX_TITLE } from './limits';

export interface UserNote {
  id: string;
  userId: string;
  title: string;
  body: string;
  /** Optional uppercase NSE symbol the note is about. */
  symbol: string | null;
  /** Other symbols the note covers (a saved comparison lists each company). */
  tickers: string[];
  /** `research` for a report saved from the Research page, else `manual`. */
  source: NoteSource;
  createdAt: Date;
  updatedAt: Date;
}

interface UserNoteDoc {
  _id: ObjectId;
  userId: string;
  title: string;
  body: string;
  symbol: string | null;
  /** Absent on notes written before saved research existed. */
  tickers?: string[];
  source?: NoteSource;
  createdAt: Date;
  updatedAt: Date;
}

function toNote(doc: UserNoteDoc): UserNote {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    title: doc.title,
    body: doc.body,
    symbol: doc.symbol,
    tickers: doc.tickers ?? [],
    source: doc.source ?? 'manual',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<UserNoteDoc>('userNotes');
}

export async function listNotes(userId: string): Promise<UserNote[]> {
  const col = await collection();
  const docs = await col.find({ userId }).sort({ updatedAt: -1 }).toArray();
  return docs.map(toNote);
}

export async function getNote(userId: string, id: string): Promise<UserNote | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const doc = await col.findOne({ _id: new ObjectId(id), userId });
  return doc ? toNote(doc) : null;
}

export interface NoteInput {
  title: string;
  body: string;
  symbol?: string | null;
  tickers?: readonly string[];
  source?: NoteSource;
}

const cleanSymbol = (symbol: string): string => symbol.trim().toUpperCase().slice(0, 30);

function normalize(input: NoteInput, source: NoteSource): Pick<UserNoteDoc, 'title' | 'body' | 'symbol' | 'tickers'> {
  const tickers = [...new Set((input.tickers ?? []).map(cleanSymbol).filter(Boolean))].slice(0, MAX_TICKERS);
  return {
    title: input.title.trim().slice(0, MAX_TITLE),
    body: input.body.trim().slice(0, bodyLimit(source)),
    symbol: input.symbol ? cleanSymbol(input.symbol) || null : null,
    tickers,
  };
}

export async function createNote(userId: string, input: NoteInput): Promise<UserNote | null> {
  const col = await collection();
  if ((await col.countDocuments({ userId })) >= MAX_NOTES_PER_USER) return null;
  const now = new Date();
  const source = input.source ?? 'manual';
  const doc: UserNoteDoc = {
    _id: new ObjectId(),
    userId,
    ...normalize(input, source),
    source,
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return toNote(doc);
}

export async function updateNote(
  userId: string,
  id: string,
  input: NoteInput
): Promise<UserNote | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  // The size limit follows the note's source, and the source itself never changes.
  const existing = await col.findOne({ _id: new ObjectId(id), userId });
  if (!existing) return null;
  const res = await col.findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set: { ...normalize(input, existing.source ?? 'manual'), updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return res ? toNote(res) : null;
}

export async function deleteNote(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await collection();
  const res = await col.deleteOne({ _id: new ObjectId(id), userId });
  return (res.deletedCount ?? 0) > 0;
}
