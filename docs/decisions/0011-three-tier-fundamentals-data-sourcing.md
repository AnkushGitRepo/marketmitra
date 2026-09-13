# 0011: Fundamentals data sourcing — three-tier free fallback chain, Python service, no paid vendor

Date: 2026-09-05
Status: accepted

## Context

Phase 4 (the fundamentals/screener.in-equivalent data API — ratios,
historical financials, shareholding pattern, company documents, and the
price data behind them) was originally scoped around a paid Tier 2 vendor
(EODHD) and a possible hosted/self-host split for data access specifically.

That plan is now superseded by a broader product decision, made explicit
here because this is the first feature it materially affects:
**MarketMitra is a free, open-source product with no paid tier, no
billing, and no trial limits, full stop.** This is not scoped to data
sourcing — it **supersedes [ADR 0008](./0008-hosted-vs-self-hosted-distribution.md)
in its entirety** (the paid-hosted / 7-day-trial / free-self-hosted
distribution model). ADR 0008 is marked superseded rather than edited, per
this project's "ADRs are never pruned" rule.

For this service specifically: all data sourcing must use free libraries
and sources only, identically in hosted and self-hosted deployments — no
scenario where paying for MarketMitra (there isn't one anymore) or
self-hosting it gets different data access.

Separately, this service's ingestion needs (`nsepython`, `bsedata`,
`yfinance`, `pdfplumber`/`camelot` for PDF tables, `scrapling` for
Screener.in) are Python-ecosystem tools with no practical TypeScript
equivalent, and its heavier tabular processing is a natural fit for
`polars`. This conflicts with the standing non-negotiable constraint in
`CLAUDE.md` / [ADR 0004](./0004-nextjs-api-routes-as-backend.md) — "Next.js
API routes only, no separate server." ADR 0004 itself flagged this
possibility in its own Consequences section ("If a future need arises for
long-running jobs or workers outside the request/response cycle... that
will require a separate decision") — this ADR is that decision.

## Decision

### No paid data vendor, ever, for this service

The earlier plan to use EODHD (or any paid data vendor) as a Tier 2
gap-fill is dropped entirely. There is no scenario — hosted or self-hosted
— where this service calls a paid API. Every tier is a free library or
free public endpoint.

### Three-tier fallback chain, tried in that order, per field

1. **Tier 1 — NSE/BSE public endpoints.** `nsepython` and `bsedata` for
   quotes, corporate actions, and IPO data. Shareholding pattern via a
   direct call to NSE's `/api/corporates-holdings` (not wrapped by either
   library — implemented in `app/ingestion/tier1_nse_bse.py`). Financial
   statement line items via quarterly XBRL result filings
   (`app/ingestion/xbrl_parser.py`), falling back to annual-report PDF
   table extraction (`app/ingestion/pdf_financials.py`, pdfplumber primary,
   camelot secondary) for whatever XBRL doesn't cover.
2. **Tier 2 — `yfinance`.** Fallback for live/historical price data and
   general quote-field gaps (company name, industry, sector) Tier 1 didn't
   produce.
3. **Tier 3 — Scrapling against Screener.in.** Last resort, for ratios and
   any fundamentals Tiers 1–2 don't cover. Built as its own isolated module
   (`app/ingestion/tier3_screener_scrapling/`) with its own README, its own
   entry points, and its own test fixtures — deliberately not scattered
   through the rest of the ingestion code — because it depends on an
   unversioned site structure that can change without notice and should be
   disableable/replaceable independently of Tiers 1–2.

The fallback chain (`app/ingestion/orchestrator.py`) resolves **per field,
not per data type chosen in advance**: it asks Tier 1 for everything
wanted, then only asks Tier 2 for whichever specific fields Tier 1 didn't
return, then only asks Tier 3 for whatever's still missing. Every stored
record carries a `source_tier` field (`app/schemas.py`) so which tier
actually produced it is always visible, in storage and in API responses.

### Accepted ToS trade-off — stated plainly, not minimized

All three tiers rely on unofficial or community access to sources whose own
terms restrict automated collection:

- **NSE**: the site's terms don't sanction programmatic scraping of these
  endpoints, and in practice NSE enforces this at the infrastructure level
  — during development, this project's own dev/CI environment was
  outright blocked by NSE's Akamai edge (a 403 "Access Denied" on a plain
  homepage GET, before any application logic ran). This is expected to
  vary by where the service is actually deployed, not a bug to fix.
- **Yahoo Finance** (`yfinance`): an unofficial, reverse-engineered API
  with no formal support contract or SLA from Yahoo.
- **Screener.in**: a community/personal site, not a documented API; its
  terms don't contemplate automated scraping either, and its HTML
  structure can change without notice.

This is a known, accepted trade-off for a free, community open-source
project with no paid tier and no budget for licensed data — not an
oversight, and not presented to users as an officially sanctioned
integration. Anyone deploying this service (hosted or self-hosted) is
relying on the same unofficial access this project relies on.

### Python + Rust-backed libraries, not a Next.js API route (scoped exception to ADR 0004)

This service is a standalone Python/FastAPI application under
`services/fundamentals-api/`, async throughout: FastAPI, `httpx` for
concurrent requests across the three tiers, `pydantic` v2 for validation,
`polars` for heavier tabular work, `orjson` for fast serialization,
PostgreSQL via SQLAlchemy (async) + asyncpg. **This scopes ADR 0004 to the
main app's request/response backend only** — that ADR's "no separate
server" rule was about not re-introducing v1's multi-server sprawl
(Express + Django alongside the client), not about forbidding every
non-Next.js process forever, and it already anticipated this exact
carve-out. A data-ingestion/serving service built on `nsepython`,
`bsedata`, `pdfplumber`/`camelot`, and `scrapling` has no practical
TypeScript equivalent; forcing it into a Next.js API route would mean
reimplementing or shelling out to Python from Node anyway, with no benefit.
The main app's own backend (auth, user data, everything else) stays exactly
as ADR 0004 describes — this exception is scoped to this one service.

### Storage: PostgreSQL, not MongoDB

This service's data (financial statement line items, ratios, shareholding
tables) is naturally tabular/relational (company → statements → line
items, with joins), unlike the rest of MarketMitra's MongoDB-shaped data.
User chose PostgreSQL over MongoDB (for the natural fit) and over
DuckDB/Parquet (better fit for a single-writer analytical workload than a
concurrent serving API). This is scoped to this service only — the main
app's MongoDB usage is unaffected.

## Consequences

- **See [ADR 0024](./0024-live-quote-yahoo-finance2-and-stock-aggregate-endpoint.md)** for a later, narrowly-scoped change to the live "price right now" read path specifically (`GET /quote`) — yahoo-finance2 (new, in the main Next app) is now tried first, NSE → BSE second, and yfinance was removed from that one path. This three-tier chain, for ratios/financials/shareholding/peers, is unaffected.

- **Tracked follow-up, not done as part of this change:** the landing
  page's pricing cards/FAQ billing content and the `isHosted()` gate's
  billing-UI purpose ([ADR 0010](./0010-deployment-mode-gate.md)) are now
  stale product decisions, not just stale copy — they describe a paid tier
  that no longer exists. Removing/rewriting that UI, and re-evaluating
  whether `isHosted()` still has a reason to exist (hosted-vs-self-host
  Clerk *authentication* is a separate question from billing, and may
  still be wanted independent of pricing), is real, separate work requiring
  its own pass — not silently folded into this data-service build. Flagged
  in `CLAUDE.md`'s Active focus and ROADMAP.md.
- No paid-vendor dependency anywhere in this service, in either deployment
  mode — self-hosted and hosted users get identical data-sourcing
  capability, for free, forever.
- `services/fundamentals-api/` is a second runtime and a second deploy
  target (Python, its own Postgres database) alongside the Next.js app —
  a real increase in operational surface, accepted because the alternative
  (reimplementing NSE/XBRL/PDF/scraping tooling in TypeScript) is worse.
- Reliability of Tier 1 in particular is genuinely uncertain and
  environment-dependent (NSE's blocking behavior). The fallback chain
  exists specifically because of this, not as a formality — Tier 2/3
  coverage is real, tested, load-bearing functionality, not a rarely-used
  backstop.
- Tier 3 (Screener.in) can break silently if the site's markup changes;
  its isolation is deliberate so a fix stays contained to one directory.
  Current parsing was verified against two independent real companies
  (Reliance, Newgen Software) with different shareholding category sets,
  giving real (if not exhaustive) confidence in the selectors.
- Tier 1's XBRL tag-mapping table and NSE shareholding-endpoint field
  mapping are both best-effort, not yet validated against a real filing —
  NSE blocked this project's dev environment before either could be
  confirmed end-to-end. Flagged explicitly in
  `app/ingestion/xbrl_parser.py` and `app/ingestion/tier1_nse_bse.py`
  rather than presented as verified.
- Financial-statement serving currently runs through Tier 3 only in
  practice, pending a Tier 1 filing-URL discovery step (find the latest
  quarterly XBRL / annual report PDF for a company) that hasn't been built
  yet — tracked in ROADMAP.md's Phase 4 checklist, not silently assumed
  done.
