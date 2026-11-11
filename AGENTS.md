# MarketMitra v2 — instructions for any coding agent

This is the **single source of truth** for AI coding agents working in this repo (Cursor,
Antigravity, Claude Code, Codex, …). `CLAUDE.md`, `GEMINI.md` and `.cursor/rules/` only point
here — if two files ever disagree, **this file wins**. Keep it short: detail lives in `docs/`.

## Start here (every new session)

1. Read this file fully.
2. Read [`docs/HANDOFF.md`](./docs/HANDOFF.md) — where the project is right now, what is open,
   how to run/deploy it, and the gotchas that cost us time before.
3. Read the last 3 entries of [`docs/session-log.md`](./docs/session-log.md).
4. Check live state, do not trust memory: `git log --oneline -10`, `gh issue list`,
   `gh pr list`, and the board https://github.com/users/AnkushGitRepo/projects/2.
5. Next.js here is **v16 with breaking changes** — read the relevant guide in
   `node_modules/next/dist/docs/` before writing Next code (see the managed block at the bottom).

## Project summary

MarketMitra is a financial dashboard for Indian markets (indices, stocks, IPOs, news sentiment,
screener, alerts, AI insights). v2 is a full teardown-and-rebuild of the v1 repo into a single
Next.js + MongoDB Atlas stack, built to serve both a human dashboard and a documented API surface
an AI agent can call ([ADR 0001](./docs/decisions/0001-teardown-and-rebuild.md)). Free and
open-source; maintainer: `AnkushGitRepo`.

## Stack (non-negotiable constraints)

- Next.js, App Router, TypeScript ([0002](./docs/decisions/0002-nextjs-app-router.md)); Node 24
- CSS Modules + `styles/tokens.css` — **no Tailwind, no Bootstrap, no hand-rolled utility framework** ([0003](./docs/decisions/0003-css-modules-no-framework.md)); build every page against [`docs/design-system.md`](./docs/design-system.md), not the last page you saw
- Backend = Next.js API route handlers only, **no separate Express server** ([0004](./docs/decisions/0004-nextjs-api-routes-as-backend.md)) — **scoped exception:** `services/fundamentals-api/` is a standalone Python/FastAPI service for data ingestion/serving ([0011](./docs/decisions/0011-three-tier-fundamentals-data-sourcing.md), [0013](./docs/decisions/0013-fundamentals-api-vercel-hosting.md))
- **No paid tier, no billing, no trial limits — ever.** Free libraries/sources only, identical in hosted and self-hosted mode ([0011](./docs/decisions/0011-three-tier-fundamentals-data-sourcing.md), [0016](./docs/decisions/0016-landing-page-no-paid-tier-reconciliation.md))
- Auth = Clerk, **hosted mode only** ([0005](./docs/decisions/0005-clerk-auth.md)); DB = MongoDB Atlas (native driver) + Neon Postgres for the fundamentals service; hosting = Vercel
- **Every feature ships UI + a documented API endpoint together** (`public/openapi.json` must list every route — a test enforces it)
- **Deployment-mode gate** ([0010](./docs/decisions/0010-deployment-mode-gate.md)): respect `isHosted()` (`NEXT_PUBLIC_DEPLOYMENT_MODE=hosted` in prod); feature backends gate on their own config env vars, never on `isHosted()`. Self-host = single local user (`getCurrentUserId()` returns `'local'`).
- Never invent metrics, user counts or "battle-tested" language in README or copy. This is a fresh v2 — say so plainly.
- AI: Vercel AI SDK v7, bring-your-own key (Gemini / Anthropic / OpenRouter). Mitra/insights never give investment advice by default (see `GUARDRAIL` in `src/lib/ai/prompts.ts`); the only exception is the **local-only, opt-in, off-by-default** unrestricted mode ([0054](./docs/decisions/0054-unrestricted-mitra-local-only.md)), enforced server-side and impossible on the hosted site.

## Working agreement (how work is done here)

These rules were set by the maintainer. Follow them exactly.

**1. Issue first.** When the maintainer reports a problem or asks for a feature, create a GitHub
issue **before touching code**: `gh issue create` using the fields of `.github/ISSUE_TEMPLATE/`
(bug_report / feature_request), labels (type `bug`/`enhancement`/`documentation` + an `area: …`
label + `priority: …` for bugs), `--assignee AnkushGitRepo`, and a `--milestone`. A feature that
arrives outside GitHub (chat, email) gets its issue too, with acceptance criteria in the body; if
scope is genuinely ambiguous, confirm the criteria with the maintainer before building. If an
issue already exists, work from it — never create a duplicate. Trivial doc typos don't need one.

**2. One branch per issue**, cut from an up-to-date `main`, named `fix/<issue#>-slug`,
`feat/<issue#>-slug`, `chore/<issue#>-slug` or `docs/<issue#>-slug`. `main` is the **only**
long-lived branch and is protected (PR required; checks `build`, `python` and the three CodeQL
`Analyze` jobs must pass; no force-push). Never commit to `main` directly.

**3. Commits** use Conventional Commits — `type: description` with `feat fix refactor docs test
chore perf ci` — and reference the issue (`#N`) in the body. One logical change per commit.

**4. Pull request** from `.github/PULL_REQUEST_TEMPLATE.md` (fill the headings and checklist for
real): `Closes #N`, the same labels, milestone and assignee as the issue. Run the checks first:
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (and the Python tests if
`services/fundamentals-api` changed).

**5. Merge** with **squash** once the required checks are green — the maintainer authorised merging
for fixes to issues they report. Then update `main`, and delete the local branch. The remote
branch is deleted automatically by the repo setting; if stale branches remain, verify they are
fully merged (compare their files with `origin/main` — squash merges make `git rev-list` counts
misleading) and list them for the maintainer.

**6. Project board + milestones.** Board: https://github.com/users/AnkushGitRepo/projects/2
("MarketMitra": Todo / In Progress / Done). Ten built-in project workflows are on, so new issues/PRs
are added as Todo automatically, and closing/merging sets Done — **setting Status to Done closes
the issue**, so only do that for finished work (leave an issue In Progress while a manual step
remains, e.g. a production migration). Move an item to In Progress when work starts. Milestones are
one per release/goal; create a new one rather than reusing a finished one. Dependabot PRs need no
issue and stay off the board.

**7. Versions and releases** ([0051](./docs/decisions/0051-version-management.md)). One SemVer product version in
`package.json` (the API reference follows it). Every production deploy is a tagged release: `npm run release` (reads the
Conventional Commits, bumps `package.json`, the lockfile, `openapi.json` and `CHANGELOG.md`), then commit it as exactly
`chore(release): vX.Y.Z` on a `chore/<issue>-release-vX.Y.Z` branch, PR, squash-merge; the Release workflow tags and publishes it.
Deploy with `npm run deploy:prod` (it refuses unless `HEAD` is that tag). PR titles must stay Conventional Commits.

**8. Report faithfully.** If tests fail, say so with the output; if a step was skipped, say that;
say what was and was not verified. Don't claim something is fixed in production without checking
production.

## Safety rules (ask first)

- **Never deploy to production or run production migrations without the maintainer's explicit
  go-ahead.** Deploy = `npm run deploy:prod`, which wraps `vercel deploy --prod --yes` and requires a tagged release (see HANDOFF). Production DB migrations need
  production credentials — the maintainer runs those.
- **Secrets:** never commit `.env*` values, keys or tokens; never print them; never paste them into
  issues/PRs/logs. `.env.local` and `services/fundamentals-api/.env` are gitignored. Add new env
  vars to `.env.local.example` (names only).
- No force-push, no `git reset --hard` / branch deletion of unmerged work, no destructive data
  changes without asking. Deleting branches already merged is fine.
- Don't download or run files from untrusted sources; don't bypass bot checks (e.g. BSE blocks
  automated downloads — supply a filing URL/text instead of spoofing a browser).
- The local-only **Mitra Advisor** (`ADVISOR_MODE=enabled`, ADR 0035) must never run on the hosted
  deployment, never place orders, and never give return promises or "buy this" language.

## Coding standards (the maintainer's preferences)

- **Immutability:** build new objects, don't mutate inputs. Pure functions for logic (allocation,
  screening, filtering) with the clock/network passed in, so they test without mocks.
- **Many small files** (200–400 lines typical, 800 max), organised by feature/domain.
- **Validate at system boundaries** with Zod (TS) / Pydantic (Python); fail fast with clear
  messages. Never trust API responses, user input or file content.
- **Handle errors explicitly**; user-friendly messages in UI, detailed context in server logs; never
  swallow errors. Route handlers answer `{ success, data, error }`.
- **TypeScript strict**; explicit types on exported APIs; no `any` (use `unknown` + narrowing);
  string-literal unions over `enum`; props as named interfaces. **Python:** type hints on every
  signature; ruff/black style.
- **Tests:** write the test first when adding logic; aim for ≥80% coverage of new logic. Vitest
  (`src/**/*.test.ts`, node env — pure logic, mocked storage) and pytest. Don't weaken a test to
  make it pass. Use Playwright for end-to-end flows.
- **No `console.log`** in committed code. No hardcoded secrets or magic values.
- Docs move with code: update `docs/` (architecture, api-surface, data-sources, ADR) and add an
  ADR (next number: 0056) for a real decision. ADRs are never pruned.

## Commands

```bash
npm install && cp .env.local.example .env.local    # then fill MONGODB_URI etc.
npm run dev            # Next app on :3000 (self-host mode: no login)
npm run lint | typecheck | test | build            # exactly what CI runs
cd services/fundamentals-api && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --reload --port 8420  # fundamentals service
.venv/bin/python -m pytest -q                        # Python tests
.venv/bin/alembic upgrade head                       # DB migrations (local)
bash scripts/smoke-test.sh                           # post-deploy checks against production
```

More (deploying, production migrations, scheduled jobs, environment) in `docs/HANDOFF.md`.

## Docs map

- [`docs/HANDOFF.md`](./docs/HANDOFF.md) — **current state**, open work, environment, deploy, gotchas
- `docs/architecture.md` — current system architecture (routes, components, data flow)
- `docs/design-system.md` — colors/type/spacing/component patterns
- `docs/decisions/` — ADRs, one per decision, numbered, **never pruned** (latest: 0055 derived Holdings watchlist)
- `docs/data-sources.md` — every external API/scraper: endpoint, auth, rate limits, cost, ToS
- `docs/api-surface.md` and `public/openapi.json` — public API for agent consumers
- `docs/session-log.md` — rolling log of what happened, session by session
- `docs/ROADMAP.md` — roadmap and post-sign-off follow-ups
- `docs/archive/` — full detail for shipped features + the old session-log rollup
- `docs/wiki/` — the published GitHub wiki source (auto-published from `main`)

## Context maintenance protocol

At the end of a work session, and when a feature is approved as done:

1. Update **`docs/HANDOFF.md` → "Where we are"** and add a short entry to `docs/session-log.md`
   (what changed, what was verified, what is not).
2. Collapse the finished feature's detail in `docs/architecture.md` to a 3–5 line summary + link;
   move full build detail (why, gotchas, abandoned approaches) to `docs/archive/<feature>.md`.
3. If `docs/session-log.md` exceeds ~15–20 entries, roll the oldest into
   `docs/archive/session-log-archive.md` (compressed).
4. Never prune `docs/decisions/`, `docs/data-sources.md`, or `docs/api-surface.md` — update them.
5. If you change a rule in this file, change it here only — the other entry-point files link here.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
