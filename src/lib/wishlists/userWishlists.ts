// User-defined stock wishlists (Markets page, ADR 0028). Each user can keep
// several named lists ("IT majors", "Watching for a dip", …) and add/remove
// symbols freely — replaces the old fixed watchlist-derived top
// gainers/losers panel on the Markets page with something the user
// actually curates themselves.

import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';

export interface UserWishlist {
  id: string;
  userId: string;
  name: string;
  symbols: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface UserWishlistDoc {
  _id: ObjectId;
  userId: string;
  name: string;
  symbols: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const MAX_NAME = 60;
export const MAX_WISHLISTS_PER_USER = 20;
export const MAX_SYMBOLS_PER_WISHLIST = 50;

function toWishlist(doc: UserWishlistDoc): UserWishlist {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    name: doc.name,
    symbols: doc.symbols,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<UserWishlistDoc>('userWishlists');
}

export async function listWishlists(userId: string): Promise<UserWishlist[]> {
  const col = await collection();
  const docs = await col.find({ userId }).sort({ createdAt: 1 }).toArray();
  return docs.map(toWishlist);
}

export async function getWishlist(userId: string, id: string): Promise<UserWishlist | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const doc = await col.findOne({ _id: new ObjectId(id), userId });
  return doc ? toWishlist(doc) : null;
}

export async function createWishlist(userId: string, name: string): Promise<UserWishlist | null> {
  const col = await collection();
  if ((await col.countDocuments({ userId })) >= MAX_WISHLISTS_PER_USER) return null;
  const now = new Date();
  const doc: UserWishlistDoc = {
    _id: new ObjectId(),
    userId,
    name: name.trim().slice(0, MAX_NAME),
    symbols: [],
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return toWishlist(doc);
}

export async function renameWishlist(userId: string, id: string, name: string): Promise<UserWishlist | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const res = await col.findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set: { name: name.trim().slice(0, MAX_NAME), updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return res ? toWishlist(res) : null;
}

export async function deleteWishlist(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await collection();
  const res = await col.deleteOne({ _id: new ObjectId(id), userId });
  return (res.deletedCount ?? 0) > 0;
}

/** Adds a symbol (deduped, capped). Returns null if the wishlist doesn't
 * exist/isn't the user's, or the wishlist is already at the symbol cap. */
export async function addSymbol(userId: string, id: string, symbol: string): Promise<UserWishlist | null> {
  if (!ObjectId.isValid(id)) return null;
  const clean = symbol.trim().toUpperCase().slice(0, 30);
  if (!clean) return null;
  const col = await collection();

  const existing = await col.findOne({ _id: new ObjectId(id), userId });
  if (!existing) return null;
  if (existing.symbols.includes(clean)) return toWishlist(existing);
  if (existing.symbols.length >= MAX_SYMBOLS_PER_WISHLIST) return null;

  const res = await col.findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $addToSet: { symbols: clean }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return res ? toWishlist(res) : null;
}

export async function removeSymbol(userId: string, id: string, symbol: string): Promise<UserWishlist | null> {
  if (!ObjectId.isValid(id)) return null;
  const clean = symbol.trim().toUpperCase();
  const col = await collection();
  const res = await col.findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $pull: { symbols: clean }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return res ? toWishlist(res) : null;
}
