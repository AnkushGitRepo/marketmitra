# 0073 — IPO brief research, and the unrestricted verdict as a per-user item

Status: accepted (2026-11-21, issue #284; decided by the maintainer).

## Context

The IPO brief only saw the tracker row and the few RAG passages that exist, so for most IPOs "Business" and "Key risk" read "Not available in
our data" and the other two items repeated the card. Ordinary prompts cannot fix that by telling the model never to say "not available": with
no source the model would invent a business and a peer multiple, which AGENTS.md forbids.

## Decision

- **Research, not a ban.** The IPO brief call gets Google Search grounding when the key is Gemini (`groundingTools` in `src/lib/ai/providers.ts`;
  free with the user's own key, ADR 0018). Other providers keep the RAG passages. If the grounded call fails it is retried without search.
  The prompt asks for fresh issue versus offer for sale, use of proceeds, peer valuation where a source gives one, and risks, and still says
  plainly when a fact is not disclosed.
- **Verdict as extra items, per user.** In unrestricted mode (ADR 0054, 0070: local install or hosted admin, resolved on the server) the brief
  adds `listingcall` and `longterm` items. That brief is cached under the user with a `:unrestricted` key; the shared guarded brief never has
  them, and the route drops them from a guarded reply even if the model wrote them.
- **Cache.** The page now loads the last stored brief per IPO (`getCachedIpoBriefs`) so a reload shows it, and the cache key buckets GMP % and
  subscription so a small tick does not make each viewer regenerate.
- **Speed (#287).** The wait was the model's hidden reasoning, not the search: one run each on Crystal Crop Protection took 59 s with search and
  default thinking, 78 s without search, 8.6 s with search and `thinkingLevel: 'low'`, 7.8 s without search. IPO briefs now ask Gemini for low
  thinking (retried without it if the provider rejects it), and the `ipo-briefs` job (`/api/cron/ipo-briefs`, bearer `CRON_SECRET`, after each
  `refresh-ipos` run) pre-writes the shared guarded brief for open and upcoming IPOs with the deployment key (ADR 0018 §5), three at a time
  and none started after about 200 s. Fresh briefs cost nothing. An unrestricted brief is never pre-written: it is per user and on request.
- **Not here:** Retail / sNII / bNII allotment odds and a best-category strategy. The data holds one overall subscription figure; that needs a
  data source first (#285).

## Consequences

- Grounded briefs depend on the search tool and can differ run to run; the page still labels them AI-generated.
- Briefs cached before this change (key version 2) still show on reload until Regenerate is used.
