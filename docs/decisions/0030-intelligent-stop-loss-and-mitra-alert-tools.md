# 0030: Intelligent stop-loss alerts + Mitra alert-management tools

Date: 2026-09-29
Status: accepted, built, verified locally.

## Context

The user reported a real loss: a holding (PB Fintech) fell ~40% over 4
trading sessions, and with no alert configured on it, they only found out
after the fact. Discussed directly with the user before building anything
(this ADR is the output of that discussion, same pattern as 0014's scoping
session). Three things were asked for:

1. A way to flag a "big event" on a stock or the portfolio without the
   user having had to think to configure it in advance.
2. A smarter stop-loss than a single static price level.
3. Mitra (the chat agent, ADR 0020/0022) able to create and manage alerts
   itself, not just describe what exists.

The alerts engine already existed (ADR 0014) and was more capable than the
user knew — `price_threshold`, `percent_move`, `week52_breach`, and
`portfolio_pnl` were all there, evaluated every 10 min during market hours.
The actual gaps: nothing creates an alert automatically, `percent_move`
only compares against *yesterday's* close (a slow multi-day bleed can clear
that check every single day without ever reading as "big"), and Mitra had
zero write access to anything (ADR 0022's hard boundary: the chat model's
`ToolSet` was, by design, 100% read-only + 4 navigation tools, with a
comment saying any write capability "needs its own ADR, not a quiet
addition").

## Decisions

### 1. Two new alert types, not a rewrite of the existing four

`trailing_stop` (`{ trailPct }`) persists a `peakPrice` on the alert doc
that only ever ratchets up; it fires when the live price falls `trailPct`%
below that peak. Unlike `price_threshold`, the floor rises with the stock
instead of sitting at one number someone has to remember to update.

`cumulative_drawdown` (`{ windowSessions, pct }`) compares the live price
against the close `windowSessions` trading sessions ago (fundamentals-api
EOD history, `GET /companies/{symbol}/prices`, already existed — no new
upstream dependency) — the type that would have actually caught a
40%-over-4-sessions slide, since it doesn't reset its reference point every
day the way `percent_move` does.

Both evaluate in the same cron (`evaluateAlerts`, ADR 0014 §3) as the
existing four, on the same 10-minute NSE-session cadence — no new
scheduling infrastructure.

### 2. Every new holding gets both, by default, unless turned off

`src/lib/alerts/guardrails.ts`'s `createGuardrailAlertsForHolding()` runs
after both holding-creation paths (`POST /api/holdings`, bulk
`portfolio-import/confirm`) and creates a default trailing-stop (10%) +
drawdown-watch (15% / 4 sessions) pair, tagged `source: 'auto_guardrail'`.
This is the direct fix for "I didn't have an alert on it" — protection no
longer depends on the user remembering to set one up per symbol. A user
can turn this off entirely (`PUT /api/settings/guardrails`,
`userSettings.autoGuardrailsEnabled`, default `true`); turning it off does
not touch alerts already created. Never silent: every auto-creation posts
a notification through the user's normal channels explaining what was
added and why, in addition to being logged (see §4).

### 3. Mitra gets write access to alerts — and only alerts

This is the change to ADR 0022's boundary, made explicitly rather than by
just adding functions to `chatTools.ts` and hoping nobody notices. The
user's own words on scope: Mitra should have "full autonomy" over alerts,
"with user have options to change or overwrite," and "a page with logs
what mitra has done on it... so user can navigate or change if need. If
mitra has done something we should also have reason for that."

Four new tools in `buildChatTools()`:

- `list_alerts` — read-only.
- `create_alert({ type, symbol?, params, note?, rearm?, cooldownMinutes?, reason })`
- `update_alert_params({ alertId, params?, note?, rearm?, cooldownMinutes?, reason })`
- `set_alert_status({ alertId, status: 'active' | 'paused', reason })`

`reason` is `z.string().min(10)` on every write tool — not optional, not a
convention, a schema requirement. A tool call with no real justification
fails validation before it touches the alert store.

**Deliberately no delete tool.** The user asked for full autonomy but also
said "do the best thing for investor" — full autonomy to *pause* something
that turns out wrong is fully recoverable (flip it back to active, or the
user does); full autonomy to *delete* is not (the params, history, and
`peakPrice` are gone). `set_alert_status` can only pause/resume. A human
deleting their own alert through the normal Alerts page UI is unaffected
— this restriction is on Mitra's own tool access only.

**Bounded parameters on Mitra's own writes.** The public API's zod schemas
(`src/lib/alerts/schemas.ts`) already cap things generously (e.g. `trailPct`
up to 50%). Mitra's tools apply a second, tighter check
(`src/lib/alerts/mitraBounds.ts`) before any create/update reaches the
store — e.g. a trailing stop between 3% and 25%, a drawdown window of 2–10
sessions — so an autonomous edit can't drift to something functionally
useless (a 1% trail that fires on noise, a 49% one that never fires) even
though a human explicitly setting that up through the UI is free to.

`ipo` / `ipo_watch` alert types are out of scope for Mitra's tools — they
aren't part of the stop-loss/portfolio-risk problem this ADR addresses,
and adding them would be scope creep on top of an already-large change.

**Scoping is inherited, not reimplemented.** Every alerts-store function
(`createAlert`, `updateAlert`, ...) already takes/filters on `userId`, and
`buildChatTools(userId)` is called with the authenticated session's own
id (`route.ts`) — there is no code path for Mitra to reach another user's
alert; this isn't new plumbing, it's the same scoping every other tool in
this file already relies on.

The `chatTools.test.ts` invariant test (no tool name may match
`/settings|security|billing|subscription|delete|remove/i`) still holds —
none of the 4 new names match it, checked explicitly in this ADR's own
tests.

### 4. One shared audit trail for both "automatic" and "Mitra's own judgment"

New `mitraActions` Mongo collection (`src/lib/mitra/activityLog.ts`) —
`{ userId, action, alertId, symbol, before, after, reason, source,
createdAt }`, `source` always `'auto_guardrail'` or `'mitra'` (never
`'user'` — a human's own edit through the Alerts UI is not a Mitra action
and isn't logged here). Both the guardrail hook (§2) and the four chat
tools (§3) write to it — one collection, one page, not two different
concepts of "what did the automation do."

`/dashboard/mitra-activity` reads this collection: most-recent-first,
showing the action, the reason, a before/after diff, and a direct link
into the affected alert so the user can change or reverse it in the normal
Alerts UI (this page shows history, it does not itself edit alerts).

### 5. Delivery reuses the existing notification pipeline

No new channel code. `deliverNotification`/`resolveChannels` (ADR 0014 §2,
0028) already fan out to in-app, email, Slack, Telegram, and webhook —
the two new alert types and the guardrail-creation notice all go through
the same path as every existing alert.

## Consequences

- `ToolSet` size grows by 4 (read tools stay the boundary they were;
  writes are now possible, but scoped to one collection, one user, never a
  delete, always logged with a reason).
- New `mitraActions` collection — no TTL (unlike `systemEvents`'s 30-day
  one, ADR 0029): this is a user-facing history page, not an ops log, and
  should stay queryable for as long as the user wants to look back.
- `userSettings` gains one more boolean (`autoGuardrailsEnabled`), same
  pattern as the existing settings fields.
- Two new endpoints (`GET/PUT /api/settings/guardrails`) documented in
  `public/openapi.json` and `docs/api-surface.md` per the `openapi.test.ts`
  CI check.
- Nothing here touches holdings themselves — ADR 0022's separate, still-
  standing invariant that "the model is never given a holdings-write tool"
  is unchanged; this ADR only concerns alerts.
