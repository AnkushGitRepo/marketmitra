# Development Guide

For anyone changing the code. The authoritative contribution rules are in [`CONTRIBUTING.md`](https://github.com/AnkushGitRepo/marketmitra/blob/main/.github/CONTRIBUTING.md); this page is the practical companion.

## Project constraints (non-negotiable)

These come from the project's own decisions and apply to every change:

- **Stack:** Next.js (App Router, TypeScript); **CSS Modules only** — no Tailwind, Bootstrap or CSS-in-JS; MongoDB through the native driver, no ORM.
- **No separate backend server.** The backend is Next.js route handlers. The single exception is `services/fundamentals-api/` — don't add another without an ADR.
- **No paid tier, ever,** and **free data sources only.**
- **Every feature ships a UI path and a documented API endpoint together.**
- **No invented numbers** — no made-up user counts, adoption stats or "battle-tested" language anywhere.
- A real architectural or product decision gets an **ADR**.

If a change has to cross one of these lines, open an issue first.

## Repository layout

```
src/
  app/                  routes: pages and API route handlers (app/api/**/route.ts)
  components/           UI components, grouped by area
  lib/                  application logic
    ai/                 Mitra tools, prompts, providers
    alerts/             alert types, evaluation, bounds
    dashboard/          clients for the data service, quotes, screener schema
    mcp/                MCP tools shared with Mitra
    screener/           screener params, CSV, presets, Mitra helper
    security/           outbound-request guard, secret comparison
    rag/                retrieval corpus, embeddings client
  styles/tokens.css     design tokens
  proxy.ts              auth, CSRF and rate-limit gate (Next 16's name for middleware)
services/fundamentals-api/
  app/api/routes/       FastAPI routes
  app/services/         business logic
  app/ingestion/        data-source clients and scrapers
  app/db/               SQLAlchemy models
  migrations/           Alembic migrations
  scripts/              out-of-band jobs (screener refresh, IPO refresh)
docs/                   living docs, ADRs (docs/decisions), this wiki's source (docs/wiki)
scripts/                operational scripts (smoke test)
.github/                workflows, issue and PR templates, policies
```

## Day-to-day

```bash
npm run dev           # app on :3000
npm run lint
npm run typecheck
npm test              # Vitest
npm run build
npm run format        # Prettier

# data service
cd services/fundamentals-api
pytest -q
uvicorn app.main:app --reload --port 8420
```

## Testing

- **Write tests first** for new pure logic: alert evaluators, market-hours maths, portfolio calculations, prompt builders, filter parsing. They live next to the code as `*.test.ts` (Vitest) or in `services/fundamentals-api/tests/` (pytest).
- Route handlers and database access are covered by the build plus live checks, matching the rest of the codebase.
- Tests run **offline** — no network, no real database — by mocking at the module boundary.
- A test checks `public/openapi.json` against the real route handlers, so a new endpoint must be documented.

## Conventions

- **Immutability:** build new objects instead of mutating.
- **Small files** with a single job; extract helpers before a file grows past ~800 lines.
- **Validate at boundaries** with schemas (Zod in TypeScript, Pydantic in Python); fail fast with a clear message.
- **Never swallow errors.** Log detail server-side, show a friendly message in the UI.
- **No secrets in code.** Use environment variables; `.env.local` is gitignored.
- **Design:** build every page against [`docs/design-system.md`](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/design-system.md) and the `--app-*` tokens, not against the last page you saw.
- **Gate on config, not on mode.** A new feature backend enables itself from its own environment variables, not from `isHosted()`, so self-host stays fully featured.

> **Next.js has breaking changes in this repo's version.** APIs, conventions and file structure differ from older releases. Read the relevant guide in `node_modules/next/dist/docs/` before writing framework code, and heed deprecation notices.

## Making a change

1. **Search first** — existing issues, pull requests and code. Open an issue before anything non-trivial.
2. **Branch** from `main`; one logical change per pull request.
3. **Write the test, then the code.**
4. **Run the four checks** — `lint`, `typecheck`, `test`, `build` (and `pytest` if you touched the Python service).
5. **Update docs** if you changed architecture, the API, data sources or environment variables (`.env.local.example` too).
6. **Commit** with [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`, `ci:`.
7. **Open a pull request** and fill in the template. Dependency, CodeQL and CI checks run automatically.

## Continuous integration

`ci.yml` runs on every push to `main` and every pull request: lint, type-check, unit tests and a production build — no secrets needed. Alongside it: **CodeQL** (security analysis) and **Dependency review** (blocks vulnerable new dependencies).

## Decisions and docs

- A real decision becomes an ADR in `docs/decisions/` — numbered, never pruned. Index: [Decision Records](Decision-Records).
- Living docs — `architecture.md`, `api-surface.md`, `data-sources.md` — describe the system *as it stands* and are updated in the same change that alters it.
- `docs/session-log.md` is the running history; `docs/archive/` holds detail for shipped features.

## Issues and labels

Use the issue templates. New issues arrive as `needs-triage`; a maintainer adds a **type** (`bug`, `enhancement`, `documentation`, `question`), usually a **priority** (`priority: high|medium|low`) and an **area** (`area: dashboard`, `alerts`, `news`, `ipos`, `ai-insights`, `agents`, `api`, `fundamentals-api`, `self-hosting`, `docs`). `good first issue` and `help wanted` mark work open to anyone.

## Editing this wiki

The wiki is published from `docs/wiki/` in the main repository, so changes get reviewed like code. Edit the files there and open a pull request; merging to `main` updates the wiki automatically. Don't edit pages directly on GitHub — the next publish would overwrite them.
