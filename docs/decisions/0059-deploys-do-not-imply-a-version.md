# 0059 — A deploy does not imply a new version

Status: accepted (2026-11-11, issue #156). Amends [0051](./0051-version-management.md).

## Context

ADR 0051 made `npm run deploy:prod` refuse unless `HEAD` was the tagged release for `package.json`'s version, so every production deploy carried a new
version. In practice that turned each "deploy" into a release PR and a bump (v0.4.0 and v0.5.0 were cut that way), including for small fixes. The maintainer
does not want versions to be a per-deploy ritual: small fixes are not a new version.

## Decision

- **Deploy and release are separate.** `npm run deploy:prod` deploys `main` exactly as it is. It still refuses unless the tree is clean, on `main`, equal to
  `origin/main` and free of stray duplicate files, and the maintainer's explicit go-ahead is still required. The tagged-release requirement and the
  `ALLOW_UNTAGGED` override are gone.
- **Production is verified by commit.** The commit id is stamped at build time and returned by `GET /api/version`; the script waits for production to report the
  commit it deployed, then runs the smoke test. It prints whether `HEAD` is the tagged release or N commits after it.
- **A new version is cut only when the maintainer asks for a release.** The `npm run release` flow, the commit-type rules (SemVer: `fix` patch, `feat` minor, a
  breaking change major) and the automatic tagging are unchanged; they simply happen on request, not on every deploy. Commit types stay honest so a later release
  picks the right bump.

## Consequences

- The version shown in the app (`/api/version`, `/status`, Settings, the API reference) can lag the deployed commit; the commit id next to it says exactly what is running.
- Releases batch whatever has merged since the last tag, which is what the maintainer wants.
