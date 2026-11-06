# 0020: Phase 10 — AI chat + insights with retrieval (RAG)

Date: 2026-09-06
Status: accepted; **Phase 10a built on branch `phase-10-rag`** (2026-09-06,
13/14 checklist items — all but the prod deploy), full suite green, **not
merged to `main`, not deployed** — awaiting sign-off. Both open questions
resolved by the user 2026-09-06: A → shared public corpus + per-user
private layer; B → split into Phase 10a / 10b. Build checklist + per-item
detail: `ROADMAP.md` under Phase 10a. Architecture summary:
`docs/architecture.md` → "Retrieval (RAG)".

## Context

Phase 10 in `ROADMAP.md` was marked ❓ with three open threads: what's in
the retrieval corpus, which vector store, and how retrieval is scoped
per-user vs. general market knowledge. This ADR is the output of the
dedicated scoping session.

### Relevant existing state

- **Mitra chat** (`POST /api/ai/chat`, [ADR 0018](./0018-ai-insights-scope.md))
  has **no retrieval**. `src/lib/ai/chatContext.ts` `formatChatContext`
  builds a fixed blob — portfolio summary + per-holding P&L + merged recent
  news headlines — and `CHAT_SYSTEM` tells the model "use only the context."
  It streams plain-text tokens (`streamText` → `toTextStreamResponse()`,
  Node runtime). It is **stateless** — no chat history is persisted.
- **AI insights** — four cached surfaces (stock read, portfolio insight,
  IPO brief, chat). `src/lib/insights.ts` `getOrGenerate`. The IPO brief
  already has a `drhpExtract: null` seam; DRHP grounding was deferred
  ([ROADMAP](../ROADMAP.md) Phase 8 follow-ups).
- **BYO-key, always** — no MarketMitra-supplied model access, for any phase.
  Generation uses the user's provider key (`src/lib/ai/userAiConfig.ts`
  `getAiConfig`); self-host may use an `AI_*` env key, hosted per-user
  surfaces never use an operator key.
- **MongoDB Atlas** is the main-app database (native driver, no Mongoose,
  [ADR 0007](./0007-mongodb-native-driver.md)). Atlas Vector Search is
  available on **all cluster tiers including the free M0**. No other
  datastore in the main app.
- **MCP tool layer** (`src/lib/mcp/`, [ADR 0019](./0019-phase-9-api-surface-mcp-rate-limiting.md))
  — 7 read-only data tools (symbol search, quote, fundamentals, price
  history, news, IPOs, indices). CLAUDE.md names this "the natural
  foundation for Phase 10/11 — those can call the tools rather than
  re-plumb data access."
- **Deployment-mode gate** ([ADR 0010](./0010-deployment-mode-gate.md)) —
  RAG is a **feature**, not a hosted-only concern like rate limiting. It
  must work in self-host with no extra infrastructure beyond the user's
  existing MongoDB.
- **Data sourcing is free-libraries-only** ([ADR 0011](./0011-three-tier-fundamentals-data-sourcing.md)),
  identically in hosted and self-hosted mode. No paid vector DB, no paid
  embedding API as a hard dependency.

### Scoping answers (user)

1. **Corpus → all four categories:** the news archive, filings &
   fundamentals (annual-report PDFs, DRHP text, Screener data), the user's
   portfolio & notes, and structured market data.
2. **Vector store → MongoDB Atlas Vector Search + local embeddings** — a
   bundled small embedding model (transformers.js), no embedding API key
   required. Keeps BYO-key limited to *generation* and keeps self-host
   zero-config.
3. **Scope → shared public corpus + per-user private layer** (resolved —
   the user initially picked "per-user everything"; on the free-tier cost
   argument below, confirmed the reconciliation: public documents indexed
   once and shared, only user-specific content is per-user).
4. **Surfaces → all three, split across two phases** (resolved): Phase 10a
   = chat + retrieval-grounded insights (incl. DRHP-grounded IPO briefs);
   Phase 10b = a new dedicated research surface.

## Decision

### Retrieval architecture

- **Store:** a new `chunks` collection in Atlas with an Atlas Vector Search
  index (`vectorSearch` type, cosine, plus scalar filter fields
  `docType`, `symbol`, `userId`, `publishedAt`). One collection, one index;
  filters do the scoping.
- **Embeddings:** local, via `transformers.js` running on the Node runtime.
  Model: a small sentence-embedding model (~90–130 MB, e.g.
  `Xenova/bge-small-en-v1.5` or `Xenova/all-MiniLM-L6-v2` — final pick in
  the build, criterion: quality-per-MB and cold-start load time). The model
  file is cached on the function's ephemeral disk after first load. **No
  embedding API key, ever** — same code path hosted and self-host.
- **Indexing runs as scheduled jobs, never inline in a request** —
  following the existing `evaluate-alerts` / `refresh-ipos` cron pattern
  (GitHub Actions → a token-guarded route). Chunking: ~500–800 token
  windows with overlap; PDF text extraction reuses the fundamentals-api
  path (it already has `pdfplumber` available there — do the extraction in
  that service, ship plain text to the Next app for chunking + embedding).
- **Retrieval at query time:** embed the query locally → `$vectorSearch`
  with the scope filter → top-k chunks → assembled into the prompt context,
  replacing (chat) or augmenting (insights) today's fixed blob.
- **Structured market data is NOT embedded.** "Retrieve over structured
  data" resolves to: the chat model gets **tool access to the MCP layer**
  (`streamText` with `tools:` wired to `src/lib/mcp/tools.ts`) and
  tool-calls for live quotes/ratios/shareholding. Vectorizing constantly-
  changing numbers is the wrong tool. This makes Phase 10 chat *agentic*
  (tool-calling loop) rather than a single completion.
- **Graceful degradation:** if no vector index is configured / reachable,
  chat falls back to the current `formatChatContext` blob and insights
  generate as they do today. RAG never being available must not break an
  existing surface. Self-host with a stock Atlas cluster gets RAG for free;
  a non-Atlas MongoDB (no Vector Search) falls back.

### Corpus scoping (resolved — was open question A)

The user initially picked "per-user everything." Applied literally that
means each user gets their own embedded copy of every news article and
annual-report PDF — which on Atlas M0 (512 MB, shared) is exhausted by a
handful of users and re-runs the same CPU embedding work per user for
public documents. On that argument the user confirmed the reconciliation
below: **two logical partitions in the one `chunks` collection**, which
delivers the same privacy guarantee:

- **Shared market corpus** (`userId: null`) — news archive, filings &
  fundamentals text, IPO/DRHP text. Public data, indexed once, readable by
  every user's retrieval. No user-specific content ever lands here.
- **Per-user corpus** (`userId: "<id>"`) — the user's holdings snapshot,
  their saved notes, and (new) their chat history. Strictly filtered by
  `userId` on every query; never shared; deleted with the user.

Every retrieval query pulls from `{ userId: null } ∪ { userId: <caller> }`.
Nothing user-specific is ever visible to another user.

### Surfaces (resolved — was open question B)

- **Phase 10a** — retrieval plumbing + the two grounded surfaces:
  1. Chat: swap prompt-stuffing for retrieval + MCP tool-calling.
  2. Insights: retrieval-augment the stock read, portfolio insight, and
     IPO brief; the IPO brief pulls real DRHP passages (**absorbs the
     deferred "DRHP grounding" follow-up** — that item closes with 10a).
- **Phase 10b** — the dedicated research surface: a new
  `/dashboard/research` page + route, multi-step retrieval, longer-form
  output, its own UI against the design system. Meaningfully more scope
  (new page, new UX); split so 10a can ship and be validated first.

### New persistent state

- `chunks` collection (text + vector + filter fields) — the index.
- `userNotes` collection — user-authored notes fed into the per-user
  corpus. New small CRUD + UI surface (`/dashboard/settings` or a notes
  panel — decide in the build).
- `chatMessages` collection — chat history, needed because "saved
  questions" is now a corpus input. Adds a retention decision (proposed:
  keep N most recent per user, or a rolling window; user-clearable).
  Chat stops being stateless.

## Consequences

- **New dependency:** `@xenova/transformers` (or `@huggingface/transformers`)
  in the Next app — pure-JS/WASM, no native build, MIT/Apache. Adds ~model
  weight to cold starts on the routes that embed; mitigated by keeping
  embedding on the cron-indexer and a single lightweight query-embed call
  per chat turn.
- **New cron job:** a corpus indexer (news + filings), token-guarded route
  + a GitHub Actions schedule, same pattern as the two existing schedulers.
- **fundamentals-api** gains a "return extracted PDF text" endpoint (the
  PDF→text step stays on the Python side where `pdfplumber` already lives;
  the Next app never imports a PDF library).
- **Chat becomes agentic** — tool-calling loop, so latency and token use
  per turn go up; the BYO-key guardrails (`CHAT_SYSTEM`, "not investment
  advice", no buy/sell/hold) carry over unchanged and must be re-asserted
  in the tool-calling prompt.
- **Atlas free-tier storage** is the real constraint on the hosted
  instance — the shared-corpus reconciliation (open question A) exists to
  stay inside it. Corpus size caps (retention windows on news, dedupe on
  filings) are a build concern.
- **No paid tier, no paid infra** — preserved. Local embeddings + Atlas
  Vector Search on the tier already in use.
- Phase 11 (multi-agent) builds on 10a's tool-calling chat + retrieval.

## Explicitly out of Phase 10 scope

- Any paid vector DB or hosted embedding API as a hard dependency.
- Fine-tuning or a MarketMitra-hosted generation model — BYO-key stays.
- Real-time / streaming index updates — scheduled batch indexing only.
- Cross-user or "community" knowledge sharing.
- Re-ranking models, hybrid BM25+vector fusion — start with vector +
  scalar filters; revisit if retrieval quality is short.

## Resolved (were open questions)

- **A. Corpus scoping** → shared public corpus (`userId: null`, indexed
  once) + a strictly-filtered per-user private layer. Not full per-user
  duplication.
- **B. Surface phasing** → **Phase 10a** = retrieval plumbing + agentic
  tool-calling chat + retrieval-grounded stock/portfolio/IPO insights
  (DRHP grounding included and its deferred follow-up closes here).
  **Phase 10b** = the dedicated `/dashboard/research` surface, as a
  follow-on phase after 10a ships and is validated.

## Amendment (2026-09-07): Phase 10b scoped

Phase 10a shipped and is verified live, so Phase 10b was scoped (a
4-question session). Answers:

1. **Shape → a structured report.** One subject in, one longer-form output
   rendered in fixed sections (what it is / recent developments / the
   numbers / risks / open questions), adapted per subject type. Not a
   chat-style thread.
2. **Subject → all four:** one company, a theme/sector (free text), the
   user's whole portfolio, or a comparison of 2–4 companies.
3. **Agency → retrieval + synthesis, not an agentic loop.** One retrieval
   pass (parallel queries allowed) + tool calls for live numbers, then
   write — like grounded insights but longer and wider. **Phase 11 stays
   the real multi-agent work**; 10b must not grow a plan→act loop.
4. **Output → ephemeral.** Generated on demand, not stored, no list view,
   no new collection. Re-run for a fresh one; the user can paste it into a
   note (`/dashboard/notes`) to keep it.

### Decision — Phase 10b

- **`POST /api/research`** — body `{ subject: { type: 'company' | 'theme' |
  'portfolio' | 'comparison', symbol?/symbols?/text? } }`. Per-user key
  (`getUserAiConfig`, BYO — same as `/api/insights/*`); `ai` rate-limit
  tier; guardrail unchanged (no buy/sell/hold, "…not investment advice").
  Non-streaming `generateInsightText` with a higher `maxOutputTokens`
  (~3–4k) and a new `RESEARCH_SYSTEM` prompt carrying the section template.
  **No cache** (ephemeral) — one submit, one generation.
- **Context builders** (`src/lib/ai/researchPrompts.ts`, pure): per subject
  type, assemble structured data (reuse `fundamentalsApi` gathering like
  the stock/portfolio insight routes) + `retrieveInsightGrounding()` output
  (`docTypes` per type). Comparison fans out per symbol.
- **`/dashboard/research`** — a client page: subject-type tabs
  (Company / Theme / Portfolio / Compare) → input → Generate → the rendered
  report (markdown → sections). No history/list. Nav item added. Built
  against `/docs/design-system.md`.
- **Degradation:** retrieval unavailable → the report still generates from
  structured data + the model's general knowledge and says where detail is
  thin — identical to the grounded-insight fallback.

### Explicitly out of Phase 10b scope

- Persisted / listable / shareable reports (that's the "ephemeral" answer).
- A plan→retrieve→act agentic loop (that's Phase 11).
- Web search or any new external source — the existing corpus + MCP tools
  + `fundamentalsApi` only.
- Streaming the report token-by-token — a single rendered result is fine;
  revisit only if latency feels bad.
