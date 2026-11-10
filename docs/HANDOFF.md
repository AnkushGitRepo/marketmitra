# MarketMitra — agent handoff

> **Purpose.** Everything a new coding agent (Cursor, Antigravity, Claude Code, …) needs to pick this
> project up cold: where it stands, what is open, how to run and deploy it, and the traps we already
> fell into. Rules and workflow live in [`AGENTS.md`](../AGENTS.md); this file is the *state*.
> **Keep "Where we are" current** — update it at the end of every session (see AGENTS.md).

## If you remember only eight things

1. `AGENTS.md` is the rulebook. Issue → branch `fix|feat|chore|docs/<issue#>-slug` → PR (template, `Closes #N`) → squash merge when checks are green → update `main`.
2. Never deploy to production, run production migrations, or touch secrets without the maintainer's go-ahead.
3. Next.js is **v16 with breaking changes** — read `node_modules/next/dist/docs/` first. The middleware file is `src/proxy.ts`. App pages are top-level (`/portfolio`, not `/dashboard/portfolio`; only `/dashboard` is the home) — see [ADR 0037](./decisions/0037-top-level-app-routes.md); a new page must be registered in `src/lib/routes.ts` and `src/proxy.ts` (a test enforces it).
4. CSS Modules + tokens only. No Tailwind. Every feature = UI **and** a documented API route (`public/openapi.json`).
5. No paid tier, ever. Hosted vs self-host is gated by `isHosted()`.
6. The **Mitra Advisor** is local-only, off by default, recommend-only (ADR 0035).
7. Verify before claiming: check production state yourself, report what was and wasn't tested.
8. Keep this file and `docs/session-log.md` current.

## Where we are (as of 2026-11-10)

**Production** (https://marketmitra-v2.vercel.app) was deployed from `main` on 2026-11-10 (`4462c5d`, app only: `services/fundamentals-api` is unchanged since `c84fd46` and was not redeployed), smoke test 4/4. It includes the Mitra chat workspace (ADR 0036), top-level URLs (ADR 0037), the Settings rebuild (ADR 0038) and the mobile navigation (5-slot bar + More sheet, #47). **Repo is clean: 0 open issues, 0 open PRs, one branch (`main`).** Always confirm with `git log --oneline -10`, `gh issue list`, `gh pr list` and the project board.

**Verified on production after the deploy:** smoke test; legacy `/dashboard/<page>` URLs 308 to the new ones (query kept); `Permissions-Policy` now `microphone=(self)`; new APIs answer 401 to anonymous callers; `/openapi.json` lists the new routes; a browser-like request to `/portfolio` gets the Clerk sign-in handshake (a bare `curl` sees 404, same as `/dashboard`). **Mobile nav on production:** `viewport-fit=cover` is in the served HTML; the bar/sheet were verified in a 390px browser locally, **not on a real phone** (iOS home-indicator inset, touch gestures, landscape). **Not verified (needs a signed-in browser):** real sign-in on the new URLs, `/system` as admin and as a non-admin (`ADMIN_USER_IDS` is set), Mitra chat with a real hosted key, attachments on Vercel near the 4 MB cap, microphone permission flow, Settings controls.

**What shipped recently (Sept → Nov 2026)** — newest first:

- **Mitra chat workspace** (#33, [ADR 0036](./decisions/0036-mitra-chat-workspace.md)) — `/mitra`: long
  conversations with history, image/PDF/audio/text attachments (GridFS), investing-tuned model setup, `G` then `C`.
  Also grouped sidebar (#29) and keyboard shortcuts (#31). Deployed 2026-11-10. Not tested with Claude/OpenRouter keys or real speech audio.

- **Project process** (#25, #26): GitHub Project board, milestones, 10 built-in project workflows, issue-first
  workflow, auto-delete of merged branches. `v2` branch retired (#23/#24); `main` is the only long-lived branch.
- **Agent portability** (#27): this handoff, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/` — so the project moves
  between coding agents without losing context.
- **IPO tracker** — SME vs mainboard classification fixed (#20/#18: the scraper matched an exact "SME" badge but
  the source says "BSE SME"/"NSE SME"); status filters (Open/Upcoming/Closed/Allotted/Listed), type filters and
  pagination on `/ipos` (#21/#19; "Allotted" is derived from the allotment date). Production verified
  after a manual `refresh-ipos` run: 7 mainboard / 9 SME.
- **Mitra Advisor** (#22/#13, [ADR 0035](./decisions/0035-mitra-advisor.md)) — local-only, rules-first decision
  support: policy + deterministic monthly plan, quantitative quality screen, citation-enforced LLM research memos,
  decision journal + kill-criteria alerts, paper-trading vs a Nifty 50 fund, behaviour guard (policy-based replies in
  market stress, "buy the dip" cooldown), read-only advisor tools in Mitra chat. Off unless `ADVISOR_MODE=enabled`,
  and refused on a hosted deployment; its routes are 404 on production (verified).
- **Dependencies**: Dependabot grouped updates merged (undici 8, framer-motion 14, unpdf 2, filelock, …). Majors of
  `next`, `react`, `react-dom`, `typescript`, `eslint`, `@types/node` are deliberately ignored in `.github/dependabot.yml`.
- **Security hardening** ([ADR 0032](./decisions/0032-security-hardening-pass.md)): CodeQL, secret scanning + push
  protection, Dependabot, IP-pinned SSRF-safe downloader, log-injection-safe logging, least-privilege workflow
  permissions, branch protection on `main`.
- **Screener** ([ADR 0033](./decisions/0033-screener-hybrid-refresh-and-ranked-search.md),
  [0034](./decisions/0034-mitra-screener-assistant.md)): NSE `EQUITY_L.csv`/`SME_EQUITY_L.csv` company master, ranked
  search, hybrid refresh (daily Yahoo quotes + incremental stalest-first Screener.in fundamentals), CSV export,
  server-side pagination, URL-synced filters, Mitra can build and open screens. **Coverage is complete: 2,629 of
  2,630 companies have fundamentals** (checked 2026-11-10 via `GET /screener/stats`); refreshes run on schedule.
- **Wiki**: `docs/wiki/` is published to the GitHub wiki by `.github/workflows/wiki-sync.yml` on every push to `main`.

## Open work (verify before acting — this list ages)

**Mitra Advisor**
- **Promoter pledge has no data source**, so that screen gate is always `unknown` and *no stock can pass the full
  screen*. Options: scrape the NSE/BSE shareholding pattern into `fundamentals-api`, or a manual-entry field.
- **A memo has not been generated from a real annual report.** BSE answers 403 to automated downloads (also locally),
  so use the `filingUrl` / `filingText` override on `POST /api/advisor/memo` (do not spoof a browser).
- Banks/NBFCs lack PBT/interest lines, so their ROCE and growth gates are `unknown`; the P/E median covers 5 years
  (the longest price history the API returns), not 10.
- Rebalancing is never checked because current holdings aren't fed in; the kill-criteria review has no scheduler
  (`/api/cron/advisor-review` is intentionally not in `vercel.json`/workflows — call it from a local scheduler).
- Advisor tools are on Mitra's *authenticated* chat only, not the anonymous `/api/mcp` (ADR 0019); exposing them there needs a token design.

**IPO tracker**
- Production holds **16** IPOs while the live source page lists ~25 (e.g. Zetwerk, Jio Platforms missing). Not
  investigated — check what `scripts/refresh_ipos.py` captures versus the page before assuming.

**Carried over from earlier phases** (non-blocking): one real alert fire and one real IPO-alert fire in market hours;
pre-bundle the `bge-small` embedding model into the fundamentals-api deployment (kills a ~18 s cold download);
filings-in-corpus needs an un-blocked PDF host (BSE 403s Vercel); Resend verified domain for `ALERT_EMAIL_FROM` and
rotate the Resend / `re_…` keys that were pasted in chat; Privacy Policy/Terms still need the maintainer's own
lawyer review; production runs on a Clerk *dev* instance.

## Environment and how to run

- **Prereqs:** Node 24, Python ≥ 3.11 (3.12 used), a MongoDB URI (Atlas free tier works), local Postgres for the
  fundamentals service (`DATABASE_URL`), GitHub CLI `gh` (scopes `repo workflow read:org gist project`), Vercel CLI.
- **Two services:** the Next app (`npm run dev`, :3000) and `services/fundamentals-api` (uvicorn, :8420). The app reads
  it through `FUNDAMENTALS_API_URL`. Commands are in `AGENTS.md`.
- **Env files (gitignored):** `.env.local` (names in `.env.local.example`) and `services/fundamentals-api/.env`
  (names in its `.env.example`). `IPO_INGEST_TOKEN` must be **identical** in both for local PDF extraction/embeddings;
  locally it is a throwaway random value, *not* the production secret. `ADVISOR_MODE=enabled` turns on the Advisor
  locally. AI features need `AI_PROVIDER` + `AI_API_KEY` (self-host) or a saved BYO key (hosted).
- **Tests:** Vitest (pure logic; routes/Mongo are mocked) and pytest. `services/fundamentals-api/tests/conftest.py`
  blanks ingest tokens so a local `.env` can't change results.
- **Data stores:** MongoDB (user data; Advisor collections are prefixed `advisor_`), Neon Postgres (fundamentals,
  IPOs, screener metrics). A scratch Mongo database `advisor_e2e_tmp` was left on the cluster by browser testing — safe to drop.

## Deploying (maintainer's go-ahead required)

From an up-to-date `main` whose CI is green and whose tree has no stray `* 2.*` files:

```bash
cd services/fundamentals-api && vercel deploy --prod --yes   # 1. data service first
cd ../..                      && vercel deploy --prod --yes   # 2. the app
bash scripts/smoke-test.sh                                    # 3. must print ok for every check
vercel inspect <deployment-url>                               # target=production, status=Ready
```

- Both Vercel projects deploy via the CLI (not git integration); the project Node version is 24.x.
- **Production DB migrations** (maintainer runs them — they need production credentials) **before** deploying code that
  needs them: `cd services/fundamentals-api && vercel env run -e production -- sh -c 'DATABASE_URL="$DATABASE_URL_UNPOOLED" .venv/bin/alembic upgrade head'`.
  Locally, `alembic upgrade head` uses `.env`; check `alembic current` first.
- Prefer verifying data-affecting changes against production afterwards (e.g. `GET /ipos`, `GET /screener/stats`).

**Scheduled jobs** (GitHub Actions, run from `main`; secrets `CRON_SECRET`, `IPO_INGEST_TOKEN`, `SCREENER_INGEST_TOKEN`):
`evaluate-alerts` (every 10 min, market hours), `refresh-ipos` (every 2 h, 03–15 UTC), `refresh-screener-quotes`
(weekdays 11:00 UTC), `refresh-screener` (daily 20:30 UTC), `index-corpus` (every 2 h), `agents-tick` (every 5 min),
`agents-reflect` (daily), `codeql` (weekly), plus `ci`, `dependency-review`, `post-deploy-smoke`, `wiki-sync`.
Each has `workflow_dispatch`, so "Run workflow" (or `gh workflow run <file>`) triggers it by hand.

## Gotchas that already cost us time

1. **Next 16:** the request middleware is `src/proxy.ts` (not `middleware.ts`). Read the bundled docs; don't rely on older Next knowledge.
2. **macOS is case-insensitive:** `Pagination.tsx` and `pagination.ts` in the same folder clash. Name helpers differently (`pageMath.ts`).
3. **Stray duplicate files** named like `name 2.ext` (an IDE/file-sync bug) appear locally, are byte-identical and gitignored (`* [2-9].*`), but break `tsc`, `next build` and Alembic ("Multiple head revisions") when inside scanned folders. Confirm with `diff`, then delete.
4. **Don't run `next build` while `next dev` runs in the same directory** — they share `.next` and corrupt each other. Build in a copy, or stop dev first.
5. **Embeddings run in `fundamentals-api` `POST /embed`** (`fastembed`, 384-dim), never in the Next app — `onnxruntime-node` can't load on Vercel. `EMBED_DIM = 384` must stay in lockstep across `src/lib/rag/embed.ts`, `app/ingestion/embeddings.py` and the Atlas Vector Search index def in `src/lib/rag/chunks.ts`.
6. **BSE returns 403 to automated clients** (Vercel and local). Don't spoof browsers; the Advisor accepts a filing URL or pasted text.
7. **IPO source is a client-rendered SPA**; scraping runs out of band in `refresh-ipos` (Playwright), parsed by `_parse_ipo_rows`. SME issues are badged "BSE SME"/"NSE SME", mainboard "IPO". A backfill migration (`d3f8b2a61c47`) classifies older rows by application size (price × lot ≥ ₹50,000 → SME).
8. **Production is a Clerk *dev* instance:** bare `curl` of `/` or `/dashboard/*` sees a handshake only a browser completes — not a regression.
9. **Next dev caches `fetch` data** (`revalidate`), so the dev server can show stale API data for minutes after a DB change.
10. **A `vercel.json` misconfiguration once took `fundamentals-api` down** (2026-09-27, see `session-log.md`); treat deploy config changes carefully and smoke-test.
11. **New outbound fetches** in the Python service must reuse the SSRF-safe helpers in `app/security.py` (`resolve_public_target`, `PinnedTarget`) and `log_safe` for user-controlled log values (ADR 0032).
12. **GitHub board:** project workflows can only be enabled in the web UI (the API can only delete them); setting Status = Done closes the issue; the `project` token scope is needed for `gh project …`.
13. **Squash merges** make `git rev-list main..branch` report unique commits after a branch is merged — compare file contents against `origin/main` instead.
14. **`lsof -ti:3000` lists browser *clients* as well as the server.** Use `lsof -nP -iTCP:3000 -sTCP:LISTEN` before killing anything. (A killed browser helper is how this was learned.)

## Using different coding agents on this repo

| Tool | Reads | Notes |
|---|---|---|
| Cursor | `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*.mdc` | `.cursor/rules/marketmitra.mdc` is always-on and points here |
| Antigravity | `GEMINI.md`, `AGENTS.md` (and a rules folder) | `GEMINI.md` just points at `AGENTS.md`; it takes precedence on conflicts, so it must not duplicate rules |
| Claude Code | `CLAUDE.md` | imports `AGENTS.md` |

Things that existed only in Claude Code's private setup and are now in this repo: the workflow rules (AGENTS.md),
the gotchas above, and the maintainer's coding preferences. Things that do **not** carry over: Claude's skills,
hooks and permission prompts — in another tool, simply follow the safety rules in `AGENTS.md` by hand.
`next dev` rewrites the marked Next.js block in `AGENTS.md`; leave the markers intact.

### Kickoff prompt for a new agent session

Paste this as the first message in Cursor / Antigravity / any new tool:

> You are taking over the MarketMitra repo. Read `AGENTS.md` and `docs/HANDOFF.md` fully, then run
> `git log --oneline -10`, `gh issue list`, `gh pr list` and look at the project board. Reply with: (1) the
> current state of `main` and production, (2) the open work and what you'd do first, (3) the exact workflow you
> will follow for a bug I report and for a feature I request, (4) what you will never do without asking me.
> Don't change anything yet.

A correct answer names the issue-first loop (issue → `fix/<n>-slug` branch → PR with `Closes #N` → squash merge when
checks are green), the Project board and milestones, the "no deploy / prod migration / secrets without asking" rule,
Next.js 16 + `src/proxy.ts`, and the open Advisor/IPO items above. If it misses any, point it at the file again.

---

## Feature status history (moved here from the old `CLAUDE.md`, September 2026)

> **Historical.** Written in September 2026 and carried over unchanged. Where it conflicts with "Where we are" above, that section wins — for example the screener's daily refresh **is** running and its coverage is complete, and `v2` no longer exists.

**Phase 10a — RAG** ([ADR 0020](./decisions/0020-phase-10-rag-chat.md)) — done, archived, deployed + verified live on hosted 2026-09-07. `chunks` collection + Atlas Vector Search index; **embeddings run on `services/fundamentals-api` `POST /embed`** (`fastembed`, `bge-small-en-v1.5`, 384-dim — NOT in the Next app; `onnxruntime-node` won't load on Vercel), `src/lib/rag/embed.ts` is an HTTP client to it; `POST /api/cron/index-corpus` (`.github/workflows/index-corpus.yml`, every 2 h); agentic tool-calling chat (`search_context` + the 7 MCP tools); retrieval-grounded stock/portfolio/IPO insights; per-user layer (`/api/notes` + `/notes`, holdings snapshot, chat history). **Everything degrades to pre-Phase-10 behaviour** when the corpus/embed service is unavailable. Full detail + the onnxruntime saga: [`./archive/rag-chat.md`](./archive/rag-chat.md). `EMBED_DIM = 384` must stay in lockstep across `embed.ts` / `embeddings.py` / the index def in `chunks.ts`.

**Phase 10b — research surface** ([ADR 0020 amendment](./decisions/0020-phase-10-rag-chat.md#amendment-2026-09-07-phase-10b-scoped)) — done, archived, deployed 2026-09-07. `POST /api/research` (subject = company | theme | portfolio | comparison; BYO key, `ai` tier, **no cache**, `generateInsightText` @ 3.5k tokens) + `/research` (`ResearchPageClient` + `MarkdownLite`). A structured brief, retrieval + synthesis only — **no agentic loop** (that's Phase 11). Detail: [`./archive/rag-chat.md`](./archive/rag-chat.md#phase-10b--the-research-surface).

**Phase 11 — multi-agent analytical briefings** ([ADR 0021](./decisions/0021-phase-11-multi-agent-analysis.md)) — built, tested, **verified with a real live end-to-end run** (TCS, self-host, 2026-09-12), merged to `main`/`v2`, and **deployed to production 2026-09-12**. Four analyst agents → bull/bear debate → synthesis briefing, async checkpointed runs (`/api/agents/run` → `/api/agents/tick` → `/agents`), a daily reflection loop. Stops before any trade decision — no trader/risk-manager/position/execution, ever. Detail: [`./archive/multi-agent-analysis.md`](./archive/multi-agent-analysis.md).

**Still open** (non-blocking): one real alert fire + one real IPO-alert fire in market hours; pre-bundle the `bge-small` embedding model (kills a ~18s cold-instance download); filings-in-corpus needs an un-blocked PDF host (BSE 403s Vercel's IP). Optional Resend verified domain in `ALERT_EMAIL_FROM`; rotate the Resend + `re_…` keys pasted in chat.

### Active-focus notes from September 2026

**No build in flight.** Everything below — including the collapsible sidebar navigation
([ADR 0026](./decisions/0026-collapsible-sidebar-navigation.md)), the stock detail
page restructure + shareholding 100%-stacked-bar chart ([ADR 0027](./decisions/0027-shareholding-stacked-bar-chart.md)),
the Mitra character redesign (`src/components/mitra/MitraCharacter.tsx`, now used by the AI
insight card, the sidebar/mobile-header logo, and the floating chat widget alike), the
Price History range-tab bug fix, and the landing-page navbar/hero blend fix + Markets page
per-user wishlists + self-serve Slack/Telegram/WhatsApp/webhook alert channels
([ADR 0028](./decisions/0028-user-wishlists-and-notification-channels.md)) — is merged to
`main`/`v2`, pushed, and **deployed to production**, most recently 2026-09-27 (wishlists +
alert channels + navbar link fixes, verified live including the signed-out→sign-in→
signed-back-in round trip; one checklist item — Portfolio's holdings-news section — wasn't
verifiable live since the hosted account currently has no holdings), and before that the
same day (Mitra character + price-history fix — that deploy also caused and then fixed a
real production outage on `fundamentals-api`, root-caused to a `vercel.json` misconfiguration;
full account in `session-log.md`), before that 2026-09-20.

- **Screener** ([ADR 0025](./decisions/0025-screener-bulk-ingestion-and-shared-filter-schema.md)) — `/screener` filters the NSE universe by financial criteria; Mitra's `run_screener` tool shares the exact same preset filter schema (no custom query builder in v1 — deliberate, on both sides). New bulk, out-of-band ingestion pipeline (`screener_metrics` table, `scripts/refresh_screener_universe.py`, daily cron) since every other `fundamentals-api` table is populated lazily per-company. **The prod Neon migration (`15d9b474e4fe`) is applied and the endpoints are live** — but the daily cron is **not yet activated**: only a `--limit 5` local test run has happened, not the real full-universe (~2,570 company) run, so production's `screener_metrics` table is currently empty. Do that full run and review it before turning the cron on.
- **Live-quote fix (yahoo-finance2 + NSE/BSE) + stock aggregate endpoint** ([ADR 0024](./decisions/0024-live-quote-yahoo-finance2-and-stock-aggregate-endpoint.md)) — dashboard/portfolio prices were stale (the UI never called a real live-quote path, deriving price from the latest end-of-day close); fixed by wiring yahoo-finance2 (primary) → NSE → BSE into the dashboard home, markets, portfolio, and stock page alike. Also `GET /api/stock/{ticker}`, a screener.in-style aggregate endpoint. Verified live in production (`/api/stock/TCS` returns a real yahoo_finance2 quote).
- **Index detail pages** (`/index/[name]`) — NIFTY 50/SENSEX/NIFTY BANK/INDIA VIX each get a stock-page-like detail page (live quote, 52w hi/lo, price chart via yahoo-finance2, general market news), reached via search or the existing index cards — **deliberately not in the nav**. Verified live in production.
- Mitra navigation + file-based portfolio import ([ADR 0022](./decisions/0022-mitra-navigation-and-file-import.md)) — deployed 2026-09-12; archiving/pruning protocol still deliberately not run.
- The production-readiness pass ([ADR 0023](./decisions/0023-analytics-and-cookie-consent.md)) — legal/security/SEO/a11y/mobile, now pushed and deployed alongside everything above. Privacy Policy/Terms still flagged as needing the user's own lawyer review before being treated as final.

Mobile app development (formerly Phase 12) is dropped — not on the roadmap; that number is now Screener's.

**Non-blocking follow-ups** (see docs/ROADMAP.md): pre-bundle the `bge-small` embedding model into the fundamentals-api deployment; filings-in-corpus (blocked — BSE 403s Vercel); one real alert fire + one real IPO-alert fire in market hours.

### Standing facts

**Standing facts that outlived the phase detail:**

- **Deploy mechanism:** both Vercel projects deploy via the Vercel CLI
  (`vercel deploy --prod --yes`; `.vercel/project.json` linked to `marketmitra-v2`). The CLI
  session is authenticated as the user and persists locally. `services/fundamentals-api/`
  → `https://marketmitra-fundamentals-api.vercel.app` (Vercel Python fn + Neon Postgres,
  [ADR 0013](./decisions/0013-fundamentals-api-vercel-hosting.md)); `marketmitra-v2`
  → `https://marketmitra-v2.vercel.app`.
- **Deployment-mode gate** ([ADR 0010](./decisions/0010-deployment-mode-gate.md)) is
  live in prod (`NEXT_PUBLIC_DEPLOYMENT_MODE=hosted`). Every new feature must respect
  `isHosted()`; feature backends gate on their own config env vars, never `isHosted()`.
- **Prod runs on a Clerk *dev* instance** (`touched-perch-1357.clerk.accounts.dev`) —
  pre-existing; bare `curl` of `/` or any `/dashboard/*` sees a handshake/rewrite only a
  real browser completes. Not a regression.
- **No paid tier, ever.** The landing page's "Two ways to run it" framing is settled
  ([ADR 0016](./decisions/0016-landing-page-no-paid-tier-reconciliation.md)); the
  hosted instance's fair-use rate limiting shipped in Phase 9 and is live (Upstash).
- **Post-sign-off follow-ups** (small, non-blocking) are listed in docs/ROADMAP.md after Phase 8:
  activating the alert-eval + IPO-refresh GitHub Actions schedulers, Resend email delivery,
  DRHP grounding for IPO briefs, one real alert fire + one real IPO-alert fire in
  market hours.
