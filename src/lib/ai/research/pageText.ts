// A web page as plain text for the research agent (#364). Pure: no network, no DOM.

import { decodeEntities } from './searchHits';

export interface PageText {
  readonly title: string;
  readonly text: string;
  /** True when the page was longer than `maxChars` and was cut. */
  readonly truncated: boolean;
}

const DROP_WITH_CONTENT = /<(script|style|noscript|svg|template|iframe|nav|footer|header|form|aside|button|select)\b[\s\S]*?<\/\1>/gi;
const BLOCK_BREAKS = /<\/?(p|div|section|article|main|li|ul|ol|h[1-6]|tr|table|br|blockquote|pre)\b[^>]*>/gi;

/** The main content of the page: an <article> or <main> when there is one, else the body. */
function mainContent(html: string): string {
  for (const name of ['article', 'main']) {
    const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(html);
    if (m && m[1].replace(/<[^>]*>/g, '').trim().length > 400) return m[1];
  }
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return body ? body[1] : html;
}

export function htmlToText(html: string, maxChars: number): PageText {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const cleaned = mainContent(html.replace(/<!--[\s\S]*?-->/g, ' ').replace(DROP_WITH_CONTENT, ' '))
    .replace(BLOCK_BREAKS, '\n')
    .replace(/<[^>]*>/g, ' ');
  const lines = decodeEntities(cleaned)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
  const text = lines.join('\n');
  return text.length <= maxChars ? { title, text, truncated: false } : { title, text: `${text.slice(0, maxChars).trimEnd()}…`, truncated: true };
}
