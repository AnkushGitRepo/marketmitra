// Parsing the two keyless search sources the research agent falls back on (#364): DuckDuckGo's HTML results (direct
// publisher links, so a page can be read) and Google News RSS (recent headlines; its links cannot be opened). Pure.

export interface SearchHit {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  /** The outlet or the site's host. */
  readonly source: string;
  /** ISO date (yyyy-mm-dd) when the source gives one. */
  readonly date: string | null;
  /** False for a Google News link, which is a redirect page the reader cannot follow. */
  readonly readable: boolean;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const stripTags = (html: string): string => decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** The target of a DuckDuckGo result link (`//duckduckgo.com/l/?uddg=<encoded url>`), or null when it is not an http(s) address. */
function ddgTarget(href: string): string | null {
  try {
    const raw = decodeEntities(href);
    const wrapped = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    const target = wrapped.searchParams.get('uddg') ?? (wrapped.hostname.endsWith('duckduckgo.com') ? null : wrapped.href);
    if (!target) return null;
    const url = new URL(target);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function parseDuckDuckGo(html: string): SearchHit[] {
  const blocks = html.split(/<div class="result results_links/).slice(1);
  const hits: SearchHit[] = [];
  for (const block of blocks) {
    if (block.includes('result--ad')) continue;
    const link = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    const url = link ? ddgTarget(link[1]) : null;
    if (!link || !url) continue;
    const snippet = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    hits.push({ title: stripTags(link[2]), url, snippet: snippet ? stripTags(snippet[1]) : '', source: hostOf(url), date: null, readable: true });
  }
  return hits;
}

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? m[1] : null;
};

const isoDate = (rfc822: string | null): string | null => {
  const t = rfc822 ? Date.parse(rfc822) : NaN;
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
};

export function parseGoogleNews(xml: string): SearchHit[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(([, item]) => {
    const rawTitle = tag(item, 'title');
    const link = tag(item, 'link');
    if (!rawTitle || !link) return [];
    const outlet = tag(item, 'source');
    const title = stripTags(rawTitle);
    const outletName = outlet ? stripTags(outlet) : '';
    // Google appends " - Outlet" to every headline.
    const headline = outletName && title.endsWith(` - ${outletName}`) ? title.slice(0, -(outletName.length + 3)) : title;
    return [{ title: headline, url: decodeEntities(link), snippet: '', source: outletName, date: isoDate(tag(item, 'pubDate')), readable: false }];
  });
}

const TRACKING = /^(utm_|fbclid|gclid|mc_|ref$|source$)/i;

function addressKey(url: string): string {
  try {
    const u = new URL(url);
    const params = [...u.searchParams].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}${params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : ''}`.toLowerCase();
  } catch {
    return url;
  }
}

/** Results from several searches as one list: the lists are taken in turn, the same page is kept once, and the list stops at `limit`. */
export function dedupeHits(lists: readonly (readonly SearchHit[])[], limit: number): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest && out.length < limit; i += 1) {
    for (const list of lists) {
      const hit = list[i];
      if (!hit || out.length >= limit) continue;
      const key = addressKey(hit.url);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
    }
  }
  return out;
}
