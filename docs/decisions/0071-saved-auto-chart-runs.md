# 0071 — Saved AI Auto-Chart runs

Status: accepted (2026-11-19, issue #253; decided by the maintainer)

## Context

Auto-Chart (ADR 0068) cost an AI call every time and was forgotten when the page closed; the only cache was a per-user, per-symbol,
per-timeframe record that was overwritten and expired after hours (a 2-minute window on 1m). A user could not see yesterday's chart again,
keep it while generating a fresh one, or delete one they did not want.

## Decision

- **Every generation is saved** in MongoDB (`chart_overlay_runs`), one document per run, keyed by user, stock and timeframe, so it follows
  the user across devices. The latest 10 per key are kept; older ones are dropped when a new one is saved. The old overwriting cache
  (`insights` scope `chart_overlay`) is no longer used.
- **Turning Auto-Chart on shows the newest saved run** without an AI call; with none saved it generates one. **Generate new** always calls the
  model and keeps the earlier runs. The "Saved" menu lists runs (age, price then, what was found), shows any of them, and deletes any of them.
  The chart states how old the shown run is, because levels from two days ago are not today's.
- **API:** `GET /api/insights/chart-overlay?symbol&interval` lists, `POST` generates and saves, `DELETE /api/insights/chart-overlay/{id}`
  removes. Reads and deletes are scoped to the signed-in user; another user's run answers the same 404 as a missing one.
- **Setup rules are enforced on read, not at save time.** A run keeps whatever was generated, but a trade setup (and its note) is returned only
  while the caller is in unrestricted mode now (`runForMode`, ADR 0068 and 0070). A user who stops being an admin, or switches the mode off,
  never receives an old setup.
- **One run is shown at a time.** Several at once would stack levels and badges; switching between runs is one click.
- If saving fails the chart is still shown once, with a notice that it will not be kept.

## Consequences

- Each Auto-Chart request now costs an AI call (there is no shared 12-hour reuse); that is the point of "Generate new", and the call is only
  made when the user asks, and on first use for a stock and timeframe.
- A little more storage: at most 10 small documents per user, stock and timeframe.
- Not built: comparing two runs on one chart, naming or pinning a run, and expiring runs by age.
