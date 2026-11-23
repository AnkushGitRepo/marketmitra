---
name: marketmitra-pr-checks
description: Run the MarketMitra pre-PR checks and open a pull request from the template. Use before creating or updating a pull request.
---

# Pre-PR checks (MarketMitra)

## Commands (repo root)

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

If `services/fundamentals-api/` changed:

```bash
cd services/fundamentals-api && .venv/bin/python -m pytest -q
```

## Hygiene

- Delete stray IDE duplicates before build or deploy:
  `find src public -name '* [2-9].*' -print` (confirm, then delete if needed).
- Add one human sentence under `## [Unreleased]` in `CHANGELOG.md` when the change is user-visible (ADR 0061). Use the existing section
  heading (Added / Changed / Fixed ...); a duplicate heading fails the changelog test.
- New API routes must appear in `public/openapi.json` (enforced by tests).
- Never commit `.env*` values, keys or tokens. New env vars go in `.env.local.example` (names only).

## Pull request

- Branch: `fix|feat|chore|docs/<issue#>-slug` from an up-to-date `main`.
- Body: `.github/PULL_REQUEST_TEMPLATE.md` filled in for real, `Closes #N`, and the same labels, milestone and assignee as the issue.
- Say what was and was not verified; do not tick a box you did not run.
- Merge: squash when the required checks are green; never force-push, never commit to `main`.
