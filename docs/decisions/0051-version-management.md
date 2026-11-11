# 0051 — Version management: one version, generated changelog, tagged releases, guarded deploys

Status: accepted (2026-11-11, issue #89). **Amended by [0059](./0059-deploys-do-not-imply-a-version.md): a deploy no longer requires or implies a new version.**

## Context

`package.json` said 0.1.0, `openapi.json` claimed 1.0.0, about 90 PRs had shipped, and there were no tags, no changelog and no
GitHub Releases. Nothing in the app or API said which version was running, and a deploy was just "whatever is on main".

## Decision

- **One product version**, SemVer, in `package.json`. App and API ship together, so `openapi.json` `info.version`,
  `package-lock.json` and the top `CHANGELOG.md` entry must equal it. A unit test (`consistency.test.ts`) fails CI on drift.
  The old "1.0.0" in the spec is replaced: the API had no stability promise and is about to take a breaking rename
  (`/wishlists` to `/watchlists`), so **1.0.0 is reserved for declaring the API stable**; the first managed release is v0.2.0.
- **`npm run release`** (`scripts/release.mjs`, logic in `src/lib/release/release.ts`, tested) reads the Conventional Commits since
  the last `v*` tag: `feat` is a minor bump, `fix` / `perf` / `refactor` a patch, a breaking change (`!` or `BREAKING CHANGE:`) a
  major bump from 1.0.0 and a minor bump before it; docs, tests, chores and CI alone do not release. It rewrites the four files
  and prepends a dated, grouped changelog section with PR links. `--dry-run`, `--bump`, and `--from` (first release only).
  It changes files only: committing, tagging and pushing stay deliberate steps.
- **Tagging is automatic** (`.github/workflows/release.yml`): when a commit whose subject is exactly `chore(release): vX.Y.Z`
  lands on `main`, the workflow checks it matches `package.json`, creates the tag and a GitHub Release with that version's
  changelog section.
- **Visible everywhere it matters:** `GET /api/version` (public, in OpenAPI), `version` in the public status data and on
  `/status`, Settings -> About, and the API reference. The commit id is stamped at build time (`NEXT_PUBLIC_APP_COMMIT`).
- **Guarded deploys:** `npm run deploy:prod` refuses unless the tree is clean, on `main`, equal to `origin/main` and `HEAD` is the
  tagged release for `package.json`'s version (`ALLOW_UNTAGGED=1` for emergencies), refuses if stray duplicate files exist,
  builds with the commit id, deploys, checks production's `/api/version` equals the version, then runs the smoke test.
  The maintainer's go-ahead is still required; the script does not replace it.

## Why a bump per release, not per merged PR

Branch protection requires a PR, and a PR opened by the built-in Actions token does not trigger the required checks, so an
automated release PR could never merge without a personal token or an app. Instead a person (or the agent) opens the release PR
with `npm run release`, it goes through the normal checks, and everything after the merge is automatic. Because the deploy
script requires a tagged release, **every production deploy carries a new version**.

## Consequences

Contributors must keep writing Conventional Commit PR titles (already the rule); a title that is not conventional is left out
of the changelog and ignored for the bump. The first release regenerates the history since the v2 rebuild (`--from 17e127f`).
