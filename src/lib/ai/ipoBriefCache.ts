// The IPO brief cache key and its read for the page (#284). The route and the page must agree on the key, so it lives in one place.

import { getCachedInsight } from '@/lib/insights';
import { logEvent } from '@/lib/system/eventLog';

/** The shared guarded brief is stored under the slug with no user; an unrestricted brief (ADR 0054, 0070) under the user and a suffixed key. */
export function ipoBriefCacheKey(slug: string, userId: string | null): { key: string; userId: string | null } {
  return userId === null ? { key: slug, userId: null } : { key: `${slug}:unrestricted`, userId };
}

/**
 * The latest stored brief per slug, whatever its age (the card has a Refresh), for the initial render. An unrestricted viewer sees their own
 * brief when they have one and otherwise the shared guarded one, which never carries a verdict.
 */
export async function getCachedIpoBriefs(slugs: readonly string[], unrestrictedUserId: string | null): Promise<Record<string, string>> {
  try {
    const found = await Promise.all(
      slugs.map(async (slug) => {
        const own = unrestrictedUserId ? ipoBriefCacheKey(slug, unrestrictedUserId) : null;
        const insight =
          (own ? await getCachedInsight('ipo', own.key, own.userId) : null) ?? (await getCachedInsight('ipo', slug, null));
        return [slug, insight?.content ?? null] as const;
      })
    );
    return Object.fromEntries(found.filter((e): e is readonly [string, string] => e[1] !== null));
  } catch (err) {
    await logEvent({ level: 'warn', source: 'ipos:briefs', message: 'Could not read cached IPO briefs', meta: { error: err instanceof Error ? err.message : 'unknown' } });
    return {};
  }
}
