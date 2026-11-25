// Which sources a chapter lists in an exported report (#385). A model may open twenty pages for one chapter; the reader needs
// the few that carry the weight, once each, regulators and exchanges first.

import type { SourceRef } from '@/lib/ai/research/generateWithSearch';

export const MAX_EXPORTED_SOURCES = 5;

const OFFICIAL = /(^|\.)(gov\.in|nic\.in|sebi\.gov\.in|rbi\.org\.in|trai\.gov\.in|pib\.gov\.in|nseindia\.com|bseindia\.com|supremecourt\.gov\.in|ecourts\.gov\.in|nclt\.gov\.in|mca\.gov\.in)$/;
/** Sites that are not a source for a financial fact. */
const WEAK = /(^|\.)(youtube\.com|youtu\.be|facebook\.com|reddit\.com|quora\.com|x\.com|twitter\.com|instagram\.com|pinterest\.com|medium\.com)$/;

/** The host of a source: its URL's, or its title when that is already a bare domain (the search tools name a source by domain). */
function hostOf(source: SourceRef): string {
  try {
    const host = new URL(source.url).hostname.toLowerCase().replace(/^www\./, '');
    // Gemini's grounding links are redirect addresses; the title is the real domain.
    if (host !== 'vertexaisearch.cloud.google.com') return host;
  } catch {
    // fall through to the title
  }
  return source.title.toLowerCase().replace(/^www\./, '').trim();
}

const rank = (host: string): number => (OFFICIAL.test(host) ? 0 : WEAK.test(host) ? 2 : 1);

/** Each domain once, official ones first and weak ones last (the order the model found them in is kept within a group), at most `max`. */
export function topSources(sources: readonly SourceRef[], max = MAX_EXPORTED_SOURCES): SourceRef[] {
  const seen = new Set<string>();
  const unique = sources.filter((s) => {
    const host = hostOf(s);
    if (!host || seen.has(host)) return false;
    seen.add(host);
    return true;
  });
  return unique
    .map((s, i) => ({ s, i, r: rank(hostOf(s)) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, max)
    .map(({ s }) => s);
}
