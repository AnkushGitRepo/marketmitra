---
name: marketmitra-end-of-session
description: Close a MarketMitra work session or finished feature by updating HANDOFF, the session log, the changelog and the docs. Use when work is done or the session is ending.
---

# End of session (MarketMitra)

Follows "Context maintenance protocol" in `AGENTS.md`. If they differ, `AGENTS.md` wins.

1. Update **`docs/HANDOFF.md` > "Where we are"** and add a short entry to **`docs/session-log.md`**: what changed, what was verified, what was **not** verified.
2. If the feature is done, collapse its detail in `docs/architecture.md` to 3 to 5 lines plus a link, and move the full build detail to `docs/archive/<feature>.md`.
3. If `docs/session-log.md` has more than 15 entries, move the oldest, **unedited**, to `docs/archive/session-log/YYYY-MM.md` until 12 remain (steps in that folder's README). Never summarise or delete an entry.
4. Never prune `docs/decisions/`, `docs/data-sources.md` or `docs/api-surface.md`; update them. A real decision gets an ADR (check the latest number in `AGENTS.md` and `docs/decisions/`).
5. Update `docs/CODEMAP.md` when you add a folder, page or workflow.
6. Add the user-visible change to `CHANGELOG.md` under the existing `## [Unreleased]` heading (ADR 0061).
7. If you shipped something that cannot be checked in production yet (Vercel is paused until 12 December 2026), add an item to `docs/POST-PAUSE-CHECKS.md`.
8. Report faithfully: tests that failed, steps skipped, and what was never run.

If you change a rule, change it in `AGENTS.md` only; the other entry-point files link there.
