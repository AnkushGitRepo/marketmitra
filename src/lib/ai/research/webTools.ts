// The research agent's own web tools (#364), used for every provider that has no search tool of its own:
// `web_search` finds pages and headlines, `fetch_page` reads one. Everything they return is text from the internet,
// so it is sanitised and fenced (`untrusted.ts`) and the model is told never to follow instructions inside it.

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { untrusted, wrapUntrusted } from '../untrusted';
import { fetchDocument, USER_AGENT, type FetchResult } from './fetchDocument';
import { dedupeHits, hostOf, parseDuckDuckGo, parseGoogleNews, type SearchHit } from './searchHits';

export interface SearchBudget {
  readonly maxSearches: number;
  readonly maxPages: number;
}
export const DEFAULT_BUDGET: SearchBudget = { maxSearches: 6, maxPages: 4 };

export interface ToolCallRecord {
  readonly tool: 'web_search' | 'fetch_page';
  /** The query or the address. */
  readonly input: string;
  readonly ok: boolean;
  /** Results returned, for a search. */
  readonly found?: number;
  readonly note?: string;
}

export interface WebToolDeps {
  readonly search: (query: string) => Promise<SearchHit[]>;
  readonly fetchPage: (url: string, maxChars: number) => Promise<FetchResult>;
}

const MAX_QUERY = 200;
const PAGE_CHARS = 12_000;
const PAGE_PARAGRAPHS = 80;
const PARAGRAPH_CHARS = 700;
const RESULTS = 8;
const GOOGLE_NEWS_HOST = 'news.google.com';

const searchInput = z.object({ query: z.string().trim().min(2).max(MAX_QUERY).describe('What to search for, in plain words; include the company name and the topic.') });
const pageInput = z.object({ url: z.url().max(2048).describe('A full https address taken from a search result.') });

/** The text of a page as sanitised lines inside an <untrusted> block. */
function fenceText(text: string): string {
  return wrapUntrusted(text.split('\n').slice(0, PAGE_PARAGRAPHS), PARAGRAPH_CHARS);
}

export function createWebTools(deps: WebToolDeps, budget: SearchBudget = DEFAULT_BUDGET): { tools: ToolSet; calls: () => readonly ToolCallRecord[] } {
  const calls: ToolCallRecord[] = [];
  let searches = 0;
  let pages = 0;

  const tools: ToolSet = {
    web_search: tool({
      description:
        'Search the web (news, regulators, company filings) for current facts the provided data does not have: legal cases, regulatory changes, management changes, sector developments. Returns titles, short snippets and addresses; results marked can_open=false are headlines only. Read a result with fetch_page. Use specific queries and stop once you have what you need.',
      inputSchema: searchInput,
      execute: async ({ query }) => {
        if (searches >= budget.maxSearches) {
          calls.push({ tool: 'web_search', input: query, ok: false, note: 'search budget used' });
          return { error: `You have used all ${budget.maxSearches} searches for this section. Write the answer from what you found.` };
        }
        searches += 1;
        let hits: SearchHit[];
        try {
          hits = await deps.search(query);
        } catch {
          calls.push({ tool: 'web_search', input: query, ok: false, note: 'search failed' });
          return { error: 'The search service could not be reached. Try a different query, or continue with what you have.' };
        }
        calls.push({ tool: 'web_search', input: query, ok: true, found: hits.length });
        return {
          results: hits.map((h) => ({ title: untrusted(h.title, 160), url: h.url, snippet: untrusted(h.snippet, 240), source: untrusted(h.source, 60), date: h.date, can_open: h.readable })),
          searches_left: budget.maxSearches - searches,
          note: hits.length === 0 ? 'No results. Try different words.' : undefined,
        };
      },
    }),
    fetch_page: tool({
      description: 'Read one web page or PDF (a news article, a regulator order, an annual report) and get its text. Use an address from web_search; Google News links cannot be opened.',
      inputSchema: pageInput,
      execute: async ({ url }) => {
        if (hostOf(url) === GOOGLE_NEWS_HOST) {
          calls.push({ tool: 'fetch_page', input: url, ok: false, note: 'google news link' });
          return { error: 'Google News links cannot be opened. Search for the headline words to find the publisher’s own page.' };
        }
        if (pages >= budget.maxPages) {
          calls.push({ tool: 'fetch_page', input: url, ok: false, note: 'page budget used' });
          return { error: `You have read all ${budget.maxPages} pages for this section. Write the answer from what you found.` };
        }
        pages += 1;
        const result = await deps.fetchPage(url, PAGE_CHARS);
        if (!result.ok) {
          calls.push({ tool: 'fetch_page', input: url, ok: false, note: result.reason });
          return { error: `Could not read that page: ${result.reason}.` };
        }
        calls.push({ tool: 'fetch_page', input: result.document.url, ok: true });
        return { url: result.document.url, title: untrusted(result.document.title, 160), truncated: result.document.truncated, content: fenceText(result.document.text), pages_left: budget.maxPages - pages };
      },
    }),
  };
  return { tools, calls: () => [...calls] };
}

async function getText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml,text/xml' }, signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

const SEARCH_TIMEOUT_MS = 8_000;

/**
 * The keyless search: DuckDuckGo's HTML results (direct links, so a page can be opened) and Google News RSS (the freshest
 * headlines). A source that fails or answers with a challenge page is skipped; both failing is an error.
 */
export async function searchWeb(query: string): Promise<SearchHit[]> {
  const q = encodeURIComponent(query);
  const signal = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const [web, news] = await Promise.allSettled([
    getText(`https://html.duckduckgo.com/html/?q=${q}`, signal),
    getText(`https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`, signal),
  ]);
  if (web.status === 'rejected' && news.status === 'rejected') throw new Error('both search sources failed');
  return dedupeHits([web.status === 'fulfilled' ? parseDuckDuckGo(web.value) : [], news.status === 'fulfilled' ? parseGoogleNews(news.value).slice(0, 5) : []], RESULTS);
}

export const LIVE_WEB_DEPS: WebToolDeps = { search: searchWeb, fetchPage: (url, max) => fetchDocument(url, max) };
