// Ticker tags on a note (#396): what may be added, and how a note's symbol and ticker list change when one is added or removed.
// Pure. A note's first ticker may be its `symbol`; the rest are `tickers`, and the two are shown together as one row of tags.

import { MAX_TICKERS } from './limits';
import { noteTickers, type VaultNote } from './vault';

/** An NSE symbol: letters and digits, with the "&", "." and "-" some symbols carry (M&M, BAJAJ-AUTO). */
const TAG = /^[A-Z0-9][A-Z0-9&.-]{0,29}$/;

/** What was typed as a tag: a leading "#" and spaces dropped, upper-cased; null when it is not a plausible symbol. */
export function normalizeTag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, '').trim().toUpperCase();
  return TAG.test(tag) ? tag : null;
}

export type TagChange = { readonly ok: true; readonly symbol: string | null; readonly tickers: readonly string[] } | { readonly ok: false; readonly error: string };

type Tagged = Pick<VaultNote, 'symbol' | 'tickers'>;

export function addTag(note: Tagged, raw: string): TagChange {
  const tag = normalizeTag(raw);
  if (!tag) return { ok: false, error: 'Use an NSE symbol such as BHARTIARTL (letters, numbers, & . or -).' };
  const current = noteTickers(note);
  if (current.includes(tag)) return { ok: false, error: `${tag} is already on this note.` };
  if (current.length >= MAX_TICKERS) return { ok: false, error: `A note can have up to ${MAX_TICKERS} tickers.` };
  return { ok: true, symbol: note.symbol, tickers: [...note.tickers, tag] };
}

/** The note without a tag: removing its symbol clears the symbol, removing any other takes it off the list. */
export function removeTag(note: Tagged, tag: string): Extract<TagChange, { ok: true }> {
  return { ok: true, symbol: note.symbol === tag ? null : note.symbol, tickers: note.tickers.filter((t) => t !== tag) };
}
