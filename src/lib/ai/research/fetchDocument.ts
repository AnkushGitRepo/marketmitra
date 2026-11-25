// Fetching one public web document for the research agent (#364): redirects followed by hand so every hop is
// validated again, a hard size cap, HTML or PDF only, and no cookies or logins.

import { getDocumentProxy, extractText } from 'unpdf';
import { safeOutboundFetch, describeOutboundError, type OutboundOptions } from '@/lib/security/outbound';
import { htmlToText, type PageText } from './pageText';

export const USER_AGENT = 'MarketMitra research agent (+https://github.com/AnkushGitRepo/marketmitra)';

const MAX_REDIRECTS = 3;
const MAX_BYTES = 6_000_000;
const MAX_PDF_PAGES = 25;
const TIMEOUT_MS = 10_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** The agent only ever reads public pages over https; private addresses are refused whatever the deployment. */
const OUTBOUND: OutboundOptions & { timeoutMs: number } = { allowHttp: false, allowPrivate: false, timeoutMs: TIMEOUT_MS };

export interface FetchedDocument extends PageText {
  readonly url: string;
  readonly kind: 'html' | 'pdf';
}
export type FetchResult = { readonly ok: true; readonly document: FetchedDocument } | { readonly ok: false; readonly reason: string };

/** The part of a Response this module uses, so tests can pass a plain `Response`. */
export interface FetchedResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body: ReadableStream<Uint8Array> | null;
}
export type Fetcher = (url: string, init: { headers: Record<string, string> }, opts: OutboundOptions & { timeoutMs?: number }) => Promise<FetchedResponse>;

/** The whole body, or null when it is longer than `max` bytes (the read stops there). */
async function readCapped(response: FetchedResponse, max: number): Promise<Uint8Array | null> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

async function pdfText(bytes: Uint8Array, maxChars: number): Promise<PageText | null> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).slice(0, MAX_PDF_PAGES);
    const joined = pages.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!joined) return null;
    return joined.length <= maxChars ? { title: '', text: joined, truncated: pdf.numPages > MAX_PDF_PAGES } : { title: '', text: `${joined.slice(0, maxChars).trimEnd()}…`, truncated: true };
  } catch {
    return null;
  }
}

export async function fetchDocument(rawUrl: string, maxChars: number, fetcher: Fetcher = safeOutboundFetch as unknown as Fetcher): Promise<FetchResult> {
  let url = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: FetchedResponse;
    try {
      response = await fetcher(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8' } }, OUTBOUND);
    } catch (err) {
      return { ok: false, reason: describeOutboundError(err) };
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      if (!location) return { ok: false, reason: 'Redirect without a destination' };
      try {
        url = new URL(location, url).href; // checked again by the fetcher on the next hop
      } catch {
        return { ok: false, reason: 'Redirect to an invalid address' };
      }
      continue;
    }
    if (response.status < 200 || response.status >= 300) return { ok: false, reason: `The site answered HTTP ${response.status}` };

    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    const isPdf = type.includes('application/pdf') || /\.pdf($|\?)/i.test(url);
    if (!isPdf && !/text\/(html|plain)|application\/xhtml/.test(type)) return { ok: false, reason: `Not a readable page (${type || 'unknown type'})` };
    const bytes = await readCapped(response, MAX_BYTES);
    if (bytes === null) return { ok: false, reason: 'The document is too large to read' };

    if (isPdf) {
      const text = await pdfText(bytes, maxChars);
      return text ? { ok: true, document: { ...text, url, kind: 'pdf' } } : { ok: false, reason: 'No text could be read from the PDF (it may be a scan)' };
    }
    const page = htmlToText(new TextDecoder('utf-8', { fatal: false }).decode(bytes), maxChars);
    return page.text ? { ok: true, document: { ...page, url, kind: 'html' } } : { ok: false, reason: 'The page has no readable text (it may need JavaScript)' };
  }
  return { ok: false, reason: 'Too many redirects' };
}
