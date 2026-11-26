// Web search for the Mitra chat (#401): the research agent's `web_search` and `fetch_page` (lib/ai/research/webTools.ts), with the limits a
// chat needs. They are our own function tools, so they work with every provider and next to the other tools (a provider's built-in search
// cannot always be combined with function tools).
//
//   - A small budget for each reply, so one question cannot turn into a crawl.
//   - `fetch_page` opens only an address that came from a search in this reply or that the user typed. Anything else could carry the user's
//     data out in an address (a page or a note telling the model to open `https://example.com/?d=<holdings>`); a search query is bound
//     by the prompt, but an address chosen by text from the web is not allowed at all.
//   - Page and result text is already sanitised and fenced by the research tools.

import type { ToolSet } from 'ai';
import { createWebTools, LIVE_WEB_DEPS, type SearchBudget, type WebToolDeps } from '@/lib/ai/research/webTools';

export const CHAT_WEB_BUDGET: SearchBudget = { maxSearches: 3, maxPages: 2 };

const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/gi;
const TRAILING = /[.,;:!?]+$/;

/** An address in a comparable form: no fragment, no trailing slash or sentence punctuation, lower-case host. */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim().replace(TRAILING, ''));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    u.hash = '';
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return null;
  }
}

/** The addresses in a piece of text the user wrote. */
export function urlsIn(text: string): string[] {
  return (text.match(URL_IN_TEXT) ?? []).flatMap((u) => normalizeUrl(u) ?? []);
}

export interface ChatWebOptions {
  /** What the user wrote this turn: an address in it may be opened. */
  readonly userText: string;
  readonly deps?: WebToolDeps;
  readonly budget?: SearchBudget;
}

/** `web_search` and `fetch_page` for one reply. The returned set is built fresh for each request, so the budget and the allowed addresses are this reply's. */
export function buildChatWebTools({ userText, deps = LIVE_WEB_DEPS, budget = CHAT_WEB_BUDGET }: ChatWebOptions): ToolSet {
  const allowed = new Set(urlsIn(userText));
  const guarded: WebToolDeps = {
    search: async (query) => {
      const hits = await deps.search(query);
      for (const h of hits) {
        const n = normalizeUrl(h.url);
        if (n) allowed.add(n);
      }
      return hits;
    },
    fetchPage: async (url, maxChars) => {
      const n = normalizeUrl(url);
      if (!n || !allowed.has(n)) return { ok: false, reason: 'that address did not come from a search result or from the user, so it was not opened' };
      return deps.fetchPage(url, maxChars);
    },
  };
  return createWebTools(guarded, budget).tools;
}
