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

## Where we are (as of 2026-11-11)

**Production** (https://marketmitra-v2.vercel.app) runs **v0.5.0** (`e7d0edb`, tag `v0.5.0`, Ready, target production), deployed 2026-11-11 with `npm run deploy:prod` after the maintainer's go-ahead. App only, no migration (the new `retryCount` field on analysts is optional and read as 0). v0.5.0 adds, on top of v0.4.0: analysts that hit an unexpected error are re-queued up to 3 times instead of stalling for good, and ones an earlier version left stalled are re-queued by the next sweep (#148/#150); one primary action per analyst card, a ⋯ menu and **Retry all stalled** (#149/#151); and one research container on the stock page with tabs and a computed valuation sensitivity check, replacing the separate "Longer AI read" (#152/#153, [ADR 0056](./decisions/0056-stock-brief-360.md) amendment). **Verified on production:** smoke 6/6; `/api/version` returns `0.5.0` / `e7d0edb`; `/openapi.json` is 0.5.0 and lists `/api/analysts/retry`; anonymous `GET /api/analysts` and `POST /api/analysts/retry` answer 401; the stock API answers 200. **Not verified (needs a signed-in browser or a scheduled run):** the hosted desk and the four previously stalled analysts healing on the first scheduled `stock-analysts` run, the redesigned stock page as a signed-in hosted user, and everything listed under v0.4.0 below. **From now on a deploy does not imply a new version** ([ADR 0059](./decisions/0059-deploys-do-not-imply-a-version.md)): deploy `main` as is and verify by commit; cut a release only when the maintainer asks for one.

**Previous release, v0.4.0** (https://marketmitra-v2.vercel.app ran it until the v0.5.0 deploy) (`6c2fb9b`, tag `v0.4.0`, deployment `marketmitra-v2-exzj8f6ac-ankushgupta.vercel.app`, Ready, target production), deployed 2026-11-11 with `npm run deploy:prod` after the maintainer's go-ahead. App only: `services/fundamentals-api` is unchanged since v0.3.0 and no database migration was needed (the new `stockAnalysts`, `analystJournal`, `analystUsage` and `analystDispatches` collections and their indexes are created on first use). v0.4.0 adds, on top of v0.3.0: structured Mitra briefs on the dashboard, markets, news and IPO widgets ([ADR 0057](./decisions/0057-structured-widget-briefs.md)) and the **Analyst Desk** ([#127](https://github.com/AnkushGitRepo/marketmitra/issues/127), [ADR 0058](./decisions/0058-analyst-desk.md)): a persistent AI analyst per holding with a dossier and living journal, the desk UI with the Root Agent deck and slide-over dossier, chat with an analyst or the Root Agent, the 08:30 IST morning dispatch, thesis invalidation criteria, honest queue states with Analyze now and Retry, and a high daily AI cap on a local instance (20 when hosted). Next ADR number is 0059. **Always confirm live state with `git log --oneline -10`, `gh issue list`, `gh pr list` and the board.**

**Verified on production after the v0.4.0 deploy:** `scripts/smoke-test.sh` 6/6; `GET /api/version` returns `0.4.0` / `6c2fb9b`; `/openapi.json` is 0.4.0 and lists `/api/analysts`, `/api/analysts/{symbol}`, `/api/analysts/chat`, `/api/analysts/dispatch` and both cron routes; anonymous `GET /api/analysts` and `/api/analysts/dispatch`, `POST /api/analysts/chat` and both cron routes answer 401, including the cron routes with a wrong bearer token; `vercel inspect`: target production, Ready. **Not verified on production (needs a signed-in browser or a scheduled run):** the Analyst Desk, chat, morning-brief panel and criteria as a signed-in hosted user; the first scheduled `stock-analysts` run (every 20 minutes, which will give every hosted holding an analyst and build dossiers with that user's own key, up to 20 calls a day) and the first `analyst-dispatch` run at 08:30 IST; a real morning-brief email; delivery of a thesis breach on a real alert channel; Anthropic / OpenRouter keys; unrestricted mode in chat (local-only). The dispatch email uses the plain alert template until the maintainer supplies a designed one. The 13 analyst records that an early local run created for the hosted user are the same ones the backfill creates for those holdings, so they are no longer stray; leave them.

**Earlier: verified on production after the v0.3.0 deploy:** `scripts/smoke-test.sh` 6/6 (landing 200, stock aggregate API 200, version 200, fundamentals-api health 200, system logs 401 to anonymous); `GET /api/version` returns `0.3.0` / `e6446fc`; `/openapi.json` is 0.3.0 with the `bearerAuth` scheme and lists `/api/watchlists`, `/api/settings/tokens`, `/api/insights/stock-brief` and the deprecated `/api/wishlists`; anonymous `GET /api/watchlists` and `/api/settings/tokens` answer 401; a (fake) access token on `/api/settings/tokens` answers 403 and a malformed one 401; protected pages 307 a browser to the Clerk handshake. **Not verified on production (needs a signed-in browser):** creating and using a real personal access token end to end (the hosted token flow was only unit-tested; it also depends on how Clerk's middleware treats a non-Clerk bearer header), the redesigned stock page, watchlist modals, Holdings list and set-alert modal as a signed-in user, generating the Mitra brief with a hosted user's own key, and Anthropic / OpenRouter keys for the brief (only `gemini-3.8-flash` was exercised locally). **Gotchas found this session:** after switching git branches `next dev` can keep a stale copy of a module (the model answered in an older format until the file content changed), so restart `npm run dev` after branch switches; gitignored `* 2.ts` IDE duplicates keep reappearing under `src` and `.next` and break `tsc` (delete them before checks and before `deploy:prod`).

**Earlier deploy** (2026-11-11 at `1fbc501`, before v0.2.0): stock-chart fail-safe (#65, [ADR 0041](./decisions/0041-data-failsafe-ui.md)), email delivery diagnosis + admin test-send (#66), dashboard hero layout (#68, [ADR 0042](./decisions/0042-dashboard-hero-layout.md)), portfolio page refactor (#70, [ADR 0043](./decisions/0043-portfolio-page-layout.md)) and the Markets intelligence hub (#72, [ADR 0044](./decisions/0044-markets-intelligence-hub.md)).

**Verified on production after the 1fbc501 deploy (earlier):** `scripts/smoke-test.sh` 4/4; `GET /api/markets/overview` returns live NIFTY 50 breadth (49 of 50 reporting) and 12 sectors; `/openapi.json` lists `/api/markets/overview` and `/api/insights/market`; `POST /api/insights/market` and `GET /api/wishlists` answer 401 to anonymous callers; legacy `/dashboard/portfolio` 308s; `/email/*.png` 200. **Email setup:** Resend domain `mail.ankushg.tech` is **verified** (DKIM TXT + two CNAMEs added in the Namify DNS panel; optional MX/DMARC skipped) and `ALERT_EMAIL_FROM` ("MarketMitra <alerts@mail.ankushg.tech>") is set in Vercel production and is live as of this deploy. `EMAIL_CONTACT_LINE` ("…Questions? Reply to this email or write to <maintainer's Gmail>") and the new `EMAIL_REPLY_TO` (same inbox; replies to `alerts@mail.ankushg.tech` would otherwise bounce because that subdomain has no MX) are set in Vercel production from 2026-11-11 and **go live with the next deploy** (#75). The maintainer's Gmail is therefore public in every email footer; change both variables if that is not wanted. **Not verified (needs a signed-in browser or a real device):** a real welcome-email send to a non-owner address (use `/system/emails` "Send test", then sign up a fresh account); the new dashboard, portfolio and Markets pages as a signed-in hosted user; generating Mitra Market Pulse / AI brief with a real key; real iOS Safari (stock chart, the ⋯ row menu, carousels); Clerk multi-session and 2FA (both **off** in the Clerk dashboard when last checked); `/system` as admin and as a non-admin. Production is a Clerk dev instance, so bare `curl` of app pages sees only a handshake.

**Not built on purpose:** FII/DII flows (no free permitted source: NSE blocks our servers; ADR 0044). Markets breadth is NIFTY 50 only and the constituent list in `src/lib/markets/marketPulse.ts` is hand-maintained.

**What shipped recently (Sept → Nov 2026)** — newest first:

- **v0.4.0** (#125 to #143): Analyst Desk ([ADR 0058](./decisions/0058-analyst-desk.md)) and structured widget briefs (ADR 0057); see the Production paragraph above and `CHANGELOG.md`.
- **v0.3.0** (#97 to #122): see the Production paragraph above and `CHANGELOG.md`.

- **Markets intelligence hub** (#71/#72, ADR 0044): one search field, "Watchlist" wording (API paths keep `wishlists`), delete-confirm modal and ⋯ row menu, NIFTY 50 breadth, sector performance (12 NSE sectoral indices via Yahoo), opt-in Mitra Market Pulse.
- **Portfolio page** (#69/#70, ADR 0043): hero KPIs, sector donut, three computed risk cards (work without an AI key), All/In Profit/In Loss chips, holdings-only news.
- **Dashboard** (#67/#68, ADR 0042): unified hero card, 4-up indices (carousel on phones), 70/30 layout with Critical alerts and an AI brief.
- **Email delivery** (#63/#66): failures are logged and diagnosed, admin status + test-send at `/system/emails`. **Chart fail-safe** (#64/#65): fallback SVG chart, retry/back-off, error boundary.

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

**Analyst Desk** (phases 1 to 4 done; see Where we are)
- Deployed in v0.4.0. Watch the first scheduled `stock-analysts` and `analyst-dispatch` runs (Actions tab) and the hosted user's desk after them.
- Not built because the data does not exist: concall commentary, management and board profiles, pledged-share trends (analysts say "not available in our data"). Thesis criteria cannot express "for two annual periods" (snapshot signals, no history). No designed email template for the dispatch yet.

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
filings-in-corpus needs an un-blocked PDF host (BSE 403s Vercel); rotate the Resend / `re_…` keys that were pasted in chat; the local `.env.local` has a malformed `ALERT_EMAIL_FROM` line that embeds another variable's name and value, so fix it and treat that key as exposed; Privacy Policy/Terms still need the maintainer's own
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
cd services/fundamentals-api && vercel deploy --prod --yes   # 1. data service first (only if it changed)
cd ../..                      && npm run deploy:prod          # 2. the app: deploys main as is (clean tree, equal to origin/main); verifies /api/version by commit; runs the smoke test
vercel inspect <deployment-url>                               # target=production, status=Ready
```

A deploy does **not** imply a new version ([ADR 0059](./decisions/0059-deploys-do-not-imply-a-version.md)). Only when the maintainer asks for a release:
`npm run release` (new version + CHANGELOG from the Conventional Commits since the last tag), commit it as exactly `chore(release): vX.Y.Z`, PR, squash-merge; the Release workflow tags it and publishes the GitHub Release.


- Both Vercel projects deploy via the CLI (not git integration); the project Node version is 24.x.
- **Production DB migrations** (maintainer runs them — they need production credentials) **before** deploying code that
  needs them: `cd services/fundamentals-api && vercel env run -e production -- sh -c 'DATABASE_URL="$DATABASE_URL_UNPOOLED" .venv/bin/alembic upgrade head'`.
  Locally, `alembic upgrade head` uses `.env`; check `alembic current` first.
- Prefer verifying data-affecting changes against production afterwards (e.g. `GET /ipos`, `GET /screener/stats`).

**Scheduled jobs** (GitHub Actions, run from `main`; secrets `CRON_SECRET`, `IPO_INGEST_TOKEN`, `SCREENER_INGEST_TOKEN`):
`evaluate-alerts` (every 10 min, market hours), `refresh-ipos` (every 2 h, 03–15 UTC), `refresh-screener-quotes`
(weekdays 11:00 UTC), `refresh-screener` (daily 20:30 UTC), `index-corpus` (every 2 h), `agents-tick` (every 5 min),
`agents-reflect` (daily), `stock-analysts` (every 20 min: gives holdings analysts, builds dossiers, runs the evening check and thesis criteria), `analyst-dispatch` (daily 03:00 UTC = 08:30 IST morning brief), `codeql` (weekly), plus `ci`, `dependency-review`, `post-deploy-smoke`, `wiki-sync`.
Each has `workflow_dispatch`, so "Run workflow" (or `gh workflow run <file>`) triggers it by hand.

## Gotchas that already cost us time

0. **A failed MongoDB connect used to stick** (#158): `src/lib/mongodb.ts` connected once at import, so one cold-start failure (`MongoServerSelectionError ... ReplicaSetNoPrimary`) broke every request on that instance. It now connects lazily, never caches a failure and retries once. If you see that error in production logs again, it is Atlas reachability (check the cluster and its network access list), not the code.

1. **Next 16:** the request middleware is `src/proxy.ts` (not `middleware.ts`). Read the bundled docs; don't rely on older Next knowledge.
2. **macOS is case-insensitive:** `Pagination.tsx` and `pagination.ts` in the same folder clash. Name helpers differently (`pageMath.ts`).
3. **Stray duplicate files** named like `name 2.ext` (an IDE/file-sync bug) appear locally, are byte-identical and gitignored (`* [2-9].*`), but break `tsc`, `next build` and Alembic ("Multiple head revisions") when inside scanned folders. They also appear inside `.next/cache/turbopack` (a corrupt cache that makes `next dev`/`build` fail with "Failed to open database"; fix: `rm -rf .next`), as `.git/index 2…` copies and `.git/logs/refs/heads/… 2` files. **Scope the delete and count first:** on 2026-11-11 a repo-wide `find . -name "* [0-9]*" -delete` (only `node_modules`, `.next`, `.git`, the venv pruned) removed **25,329** files, far more than the ~20 expected under `src/`/`docs/`; tracked files were untouched and all tests passed, but the rest were gitignored and unrecoverable (`.claude/` was left empty). List with `find … -print | head` and `| wc -l` before adding `-delete`, and limit it to `src docs public`. **2026-11-11 (after v0.3.0):** found and removed **239** duplicates (166 in `.next/dev`, 44 in `.next/cache`, 8 ADR copies in `docs/decisions`, plus `CHANGELOG 2.md` / `CHANGELOG 3.md`, `scripts/release 2.mjs`, `scripts/deploy-prod 2.sh`, `.github/workflows/release 2.yml`). Before deleting: all 239 were gitignored and none tracked, and the ones that differed from their original were **older snapshots** (the CHANGELOG and ADR copies were strict subsets; `release 2.mjs` was the old pre-#95 script). The count was then 0, `git status` clean, `tsc` clean. `.git/index 2` to `.git/index 5` were left alone (harmless git-internal copies). **Likely cause (unconfirmed):** the repo lives in `~/Desktop`, which macOS can sync through iCloud ("Desktop & Documents Folders") and iCloud creates ` 2` conflict copies; if so, move the checkout out of `~/Desktop`/`~/Documents` (for example `~/dev/`) or turn that sync off, because deleting them only treats the symptom.
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
15. **Stray `* 2.*` duplicates are recreated in `src/` as you edit, and `vercel deploy` uploads them.** They are gitignored (so CI is green) but break the remote `tsc` (e.g. `index 2.ts` importing a deleted file) and the deploy fails. Right before deploying: `find src public -name '* [2-9].*' -delete` (confirm `git ls-files src public | grep -E ' [2-9]\.'` is empty first). They can also appear as `.git/refs/heads/… 2` files that break `git pull`.
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
