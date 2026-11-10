# Contributing to MarketMitra

Thanks for considering a contribution. MarketMitra is free, open-source, and self-hostable
by design — outside contributions are genuinely welcome, not just tolerated.

This guide covers how to propose a change. For what the project *is* and how it's built,
start with [`README.md`](../README.md) and [`AGENTS.md`](../AGENTS.md).

## Before you start

- **Search first.** Check open [issues](../../../issues) and [pull requests](../../../pulls) for
  related work before starting something new.
- **Open an issue for anything non-trivial.** Bug fixes and small doc corrections can go
  straight to a PR. Anything larger — a new feature, a data source, a schema change — should
  get a short issue first so the approach can be discussed before code is written. This
  saves everyone a rewritten PR.
- **One logical change per PR.** Easier to review, easier to revert if something's wrong.

## Project constraints (non-negotiable)

These come from this project's own architecture decisions ([`/docs/decisions/`](../docs/decisions/))
and apply to every contribution:

- **Stack:** Next.js (App Router, TypeScript) for the app; CSS Modules only — no Tailwind,
  no Bootstrap, no CSS-in-JS framework; MongoDB Atlas via the native driver, no ORM.
- **No separate backend server.** The app's backend is Next.js API route handlers. The one
  standing exception is `services/fundamentals-api/`, a Python/FastAPI service justified by
  Python-only data tooling with no TypeScript equivalent — don't add a second exception
  without an ADR.
- **No paid tier, ever.** No billing, no trial limits, no feature gating behind payment.
  Self-hosted and hosted run the same code and the same features.
- **Free data sources only.** No paid market-data vendors. See
  [`/docs/data-sources.md`](../docs/data-sources.md) before adding a new one.
- **Every feature ships a UI path and a documented API endpoint together** — see
  [`/docs/api-surface.md`](../docs/api-surface.md). Not a UI with no API, and not an API with
  no UI.
- **No invented numbers.** No fabricated user counts, adoption stats, or "battle-tested"
  language anywhere in the app or docs.
- A real architectural or product decision gets an ADR in `docs/decisions/` — don't let it
  live only in a PR description.

If a change needs to cross one of these lines, open an issue explaining why before writing
code — it may need an ADR of its own.

## Development setup

See [README.md → Getting started](../README.md#getting-started) for the full local setup
(Node.js, MongoDB Atlas, environment variables). In short:

```bash
npm install
cp .env.local.example .env.local   # fill in your own values
npm run dev
```

## Before opening a pull request

Run the full local check suite — this is exactly what CI runs on every PR:

```bash
npm run lint        # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit tests
npm run build        # production build
```

All four must pass. If you touched `services/fundamentals-api/`, also run its own test
suite (see [`services/fundamentals-api/README.md`](../services/fundamentals-api/README.md)).

- **Tests:** new pure logic (alert evaluators, market-hours math, portfolio calculations,
  prompt builders, and similar) should come with unit tests under `src/lib/**/*.test.ts`.
  Route handlers and Mongo data access are exercised via the build + manual/live checks,
  matching how the rest of the codebase is tested — see any existing `*.test.ts` file
  alongside the code it covers for the expected style.
- **Formatting:** `npm run format` (Prettier) before committing. ESLint's `eslint-config-prettier`
  means lint and formatting won't fight each other.
- **Commit messages:** [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, ...). Look at `git log` for
  examples already in this repo.

## Pull request checklist

- [ ] Linked to an issue, if one exists
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass
- [ ] New behavior has a UI path *and* a documented API endpoint (if applicable)
- [ ] Docs updated if you changed anything in `/docs/*.md` territory (architecture, API
      surface, data sources) or added an environment variable (`.env.local.example`, README)
- [ ] No secrets, API keys, or `.env.local` values committed

A maintainer will review, may ask for changes, and will merge once it's ready. Small,
focused PRs get reviewed faster than large ones.

## Reporting bugs and requesting features

Use the [issue templates](ISSUE_TEMPLATE/) — they ask for the information needed to
act on a report quickly (repro steps, environment, expected vs. actual behavior). New issues
land as `needs-triage`; a maintainer replaces that with the right priority/area labels.

## Labels

Every issue gets a **type** (`bug`, `enhancement`, `documentation`, `question`), and
generally a **priority** (`priority: high|medium|low`) and an **area** (`area: dashboard`,
`area: alerts`, `area: news`, `area: ipos`, `area: ai-insights`, `area: agents`, `area: api`,
`area: fundamentals-api`, `area: self-hosting`, `area: docs`) once triaged. `status:
in-progress` / `status: blocked` track active work; `good first issue` / `help wanted` flag
issues that are open for anyone to pick up. See the full list on the
[Labels page](../../../labels).

## Security issues

Please **do not** open a public issue for a security vulnerability. See
[`SECURITY.md`](SECURITY.md) for how to report one privately.

## Code of conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). Participation in issues, PRs,
and discussions is expected to stay within it.

## License

By contributing, you agree that your contributions will be licensed under the project's
[MIT License](../LICENSE).
