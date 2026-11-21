// One IPO brief, from cache or generated (#284, #287). Shared by the brief route and the background job, so both write the same cache entry.

import { retrieveInsightGrounding } from '@/lib/rag/insightContext';
import type { Ipo } from '@/lib/dashboard/iposApi';
import { getOrGenerate, hashInput, type GetOrGenerateResult } from '@/lib/insights';
import { buildIpoBriefPrompt } from './briefPrompts';
import { IPO_SPEC, IPO_VERDICT_KEYS } from './briefSpecs';
import { ipoBriefCacheKey } from './ipoBriefCache';
import { promptForMode, type PromptMode } from './promptMode';
import { IPO_BRIEF_SYSTEM, IPO_BRIEF_SYSTEM_UNRESTRICTED } from './prompts';
import type { AiConfig } from './providers';
import { generateStructuredBrief } from './structuredGenerate';
import { dropItemKeys } from './structuredBrief';

const TTL_MS = 12 * 60 * 60 * 1000;
/** GMP % is bucketed in the cache key, and subscription floored: a tick of either must not make every viewer pay for a new brief. */
const GMP_PCT_BUCKET = 5;

export interface IpoBriefArgs {
  readonly ipo: Ipo;
  readonly aiConfig: AiConfig;
  readonly mode: PromptMode;
  /** The viewer an unrestricted brief belongs to; ignored for a guarded (shared) brief. */
  readonly userId: string | null;
  readonly force?: boolean;
}

export async function getOrGenerateIpoBrief(args: IpoBriefArgs): Promise<GetOrGenerateResult> {
  const { ipo, aiConfig, force } = args;
  // Unrestricted (ADR 0054, 0070) is per user: its brief is cached under the user, never in the shared guarded entry.
  const unrestricted = args.mode === 'unrestricted' && args.userId !== null;
  const mode: PromptMode = unrestricted ? 'unrestricted' : 'guarded';
  const userId = unrestricted ? args.userId : null;

  // Shared corpus only (userId: null): DRHP/prospectus passages once indexed, news today.
  const grounding = await retrieveInsightGrounding({
    query: `${ipo.name} IPO — business, offer structure, use of proceeds, risks`,
    userId: null,
    docTypes: ['filing', 'news'],
    limit: 6,
  });
  return getOrGenerate({
    scope: 'ipo',
    ...ipoBriefCacheKey(ipo.slug, userId),
    // The version marker retires older briefs (v3: researched, #284).
    inputHash: hashInput({
      v: 3,
      mode,
      ipo: [
        ipo.price,
        ipo.ipo_size_cr,
        ipo.lot_size,
        ipo.status,
        ipo.subscription_times === null ? null : Math.floor(ipo.subscription_times),
        ipo.gmp_pct === null ? null : Math.round(ipo.gmp_pct / GMP_PCT_BUCKET),
        ipo.listing_date,
      ],
      passages: grounding.passages.map((p) => p.text),
    }),
    ttlMs: TTL_MS,
    force,
    generate: async () => {
      const system = promptForMode(unrestricted ? IPO_BRIEF_SYSTEM_UNRESTRICTED : IPO_BRIEF_SYSTEM, mode);
      const out = await generateStructuredBrief({
        aiConfig,
        system,
        prompt: buildIpoBriefPrompt(ipo, grounding.passages),
        spec: IPO_SPEC,
        grounded: true,
        thinkingLevel: 'low',
      });
      if ('error' in out) return out;
      // A guarded brief never carries the verdict items, even if the model wrote them.
      return { content: unrestricted ? out.content : dropItemKeys(out.content, IPO_VERDICT_KEYS, IPO_SPEC), model: out.model };
    },
  });
}
