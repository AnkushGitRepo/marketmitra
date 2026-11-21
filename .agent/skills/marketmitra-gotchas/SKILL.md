---
name: marketmitra-gotchas
description: MarketMitra environment and tooling traps (stray duplicate files, local database, deploy vs release, the fundamentals service). Use when debugging local builds, deploys, or Alembic and tsc failures.
---

# MarketMitra gotchas

## Stray duplicate files (`name 2.ts`)

IDE sync creates gitignored `* [2-9].*` copies under `src/`, `docs/` and `.next/`. They break
`tsc`, `next build` and Alembic. **List before delete:** `find src docs public -name '* [2-9].*'`.
Before `npm run deploy:prod`, clean `src` and `public` only (never a repo-wide delete into `node_modules`).

## Two services locally

- Next: `npm run dev` (:3000)
- Fundamentals: `services/fundamentals-api` with uvicorn on :8420 and `DATABASE_URL`
- `FUNDAMENTALS_API_URL` must match; `IPO_INGEST_TOKEN` must match on both apps for the embed and PDF routes.

Restart `npm run dev` after **git branch switches** (stale module cache).

## Local `.env.local` and data

The maintainer may point the local database at production-shaped data. **Ask before destructive DB work.**
Scope cron jobs and workers to the `local` user when testing.

## Deploy vs release

- **Deploy** (`npm run deploy:prod`): ships current `main`, no version bump (ADR 0059).
- **Release** (`npm run release`): only when the maintainer asks; then a `chore(release): vX.Y.Z` PR.

## Safety (always)

No production deploy, production migration, or reading `.env*` values without explicit go-ahead.
`ADVISOR_MODE` and unrestricted Mitra are local-only, plus a hosted admin listed in `ADMIN_USER_IDS` (ADR 0070).

## MCP

`/api/mcp` needs `npm run dev` (or the hosted origin). Rate limits apply on hosted.
