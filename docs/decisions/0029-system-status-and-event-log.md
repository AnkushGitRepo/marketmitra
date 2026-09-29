# 0029: System status page + event log

Date: 2026-09-29
Status: accepted, built, verified locally.

## Context

Asked for "the same kind of dashboard for backend and with status page of
system as we have in most of system these days. And logs." Clarified with
the user via three questions:

- Audience: **both** — a public `/status` page and an admin-facing page
  inside `/dashboard`.
- Log source: **both** — a persisted event/activity log, and live
  health-check pings (no persisted history needed for the health checks
  themselves, only current state).
- Components to monitor: **everything** — MongoDB Atlas, the
  fundamentals-api service, the embed/RAG stack (exposed here as "MCP
  server" — see below), the MCP server, Clerk auth, the Upstash rate
  limiter, and the 3 GitHub Actions crons (`evaluate-alerts`,
  `index-corpus`, `agents-reflect`).

## Decisions

### Health checks are live, not cached — no new collection for status itself

`src/lib/system/health.ts`'s `getSystemStatus()` runs 5 checks in
parallel on every call: a MongoDB `{ ping: 1 }` command, a `GET /health`
against `services/fundamentals-api` (which already existed — ADR 0011 —
and needed no Python changes), a structural check that the MCP tool
registry (`src/lib/mcp/tools.ts`) is non-empty, an Upstash Redis round
trip via a new `pingRedis()` helper in `src/lib/rateLimit.ts`, and a
config-presence check for Clerk (see below). Nothing about current health
is persisted — the public `/status` page and the admin
`/dashboard/system` page both call this function fresh on each load (or
via `GET /api/status` on refresh), so there is nothing to go stale and
nothing to prune.

### One new collection for *history*: `systemEvents`, scoped to the 3 crons only

The clarifying answer asked for persisted log history in addition to live
health. Rather than instrument every route, `src/lib/system/eventLog.ts`
adds one narrow write path (`logEvent()`) called from exactly the 3
scheduled cron routes (`evaluate-alerts`, `index-corpus`,
`agents-reflect`), each logging one `info`/`warn`/`error` row per run with
a `durationMs` and a small `meta` summary (whatever that job's own
existing summary object already was — `evaluateAlerts()`'s
`EvaluateSummary`, `indexCorpus()`'s `IndexCorpusResult`, spread into a
plain object since neither type has an index signature). A blanket
event-logging retrofit across the ~30 other API routes was explicitly
scoped out — it wasn't asked for, and it would have meant touching every
route handler in the app for a feature about *infrastructure* health, not
user-request auditing.

30-day TTL index (`{ ts: 1 }, expireAfterSeconds: 30*86400`), mirroring
the pattern already used for `chunks` (ADR 0020). `GET /api/system/logs`
(session-gated) serves it with `level`/`source`/`limit`/`before` filters
and cursor-style pagination (`before` = strictly-before an ISO
timestamp), consumed by `/dashboard/system`'s log table.

### Clerk check is config-presence, not a live ping

Every other check does a real round trip. Clerk does not — it isn't
`isHosted()` ? `Boolean(CLERK_SECRET_KEY && NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)`
: "not configured (self-host, no login required)". CLAUDE.md flags that
this project's Clerk/Next.js integration may not match this model's
training data, and a status page is exactly the kind of low-traffic,
easy-to-get-subtly-wrong surface where a hand-rolled live call against an
unfamiliar SDK is more likely to misreport a healthy Clerk as down (or
vice versa) than to add real signal. Config presence is honest about what
it actually verifies and can't misfire.

### MCP check is structural, not a self-referential network call

Similarly, the MCP server check does not have the app make an HTTP/JSON-RPC
call to its own `/api/mcp` endpoint — that would mean one Next.js request
handler calling itself mid-request over the network, adding a real failure
mode (timeouts, self-referential fetch quirks in serverless) for a check
that's really asking "is the tool registry populated," which
`tools.length > 0` (from `src/lib/mcp/tools.ts`, already imported
elsewhere) answers directly and cheaply.

### `overall` is the worst of MongoDB / fundamentals-api / MCP only

The rate limiter and Clerk auth are both expected to read
`not_configured` in self-host mode (no Upstash, no login) — that's the
system working as designed, not degradation, so `overall` ignores them.
`overall` is `down` if any of the three core dependencies is `down`,
`degraded` if any is `degraded`, else `operational`. A self-hosted
instance with everything it needs configured (Mongo + fundamentals-api +
MCP all up) reads fully operational even with Upstash and Clerk both
absent.

### Public `/status` reuses the landing `--color-*` palette; `/dashboard/system` uses `--app-*`

Per the design system's existing split (ADR-adjacent convention, not a
new one): `/status` is served with the marketing `Navbar`/`Footer`
(`src/components/landing/*`) and its own CSS module on the `--color-*`
tokens; `/dashboard/system` sits inside the existing dashboard chrome
(`Sidebar`, `NAV_ITEMS`) on the `--app-*` tokens. Neither palette has an
amber/warning hue for the app-shell tokens, so `/dashboard/system` reuses
`--app-loss`/`--app-loss-soft` for "degraded" rather than introducing a
new color; the landing palette already has `--color-amber-*`, so
`/status` uses that for "degraded" directly.

### No Python / fundamentals-api changes

`GET /health` on the fundamentals-api service already existed and was
already exempt from its own rate limiting — reused as-is.

## Consequences

- New collection `systemEvents` (30-day TTL) — self-pruning, no manual
  maintenance.
- Two new public-surface endpoints: `GET /api/status` (public),
  `GET /api/system/logs` (session-gated) — both documented in
  `docs/api-surface.md` and `public/openapi.json` per the
  `openapi.test.ts` CI check.
- `src/lib/rateLimit.ts` gained an exported `pingRedis()` alongside the
  existing (now-factored-out) `getRedis()`; no behavior change to the
  limiter itself.
- Nav: a new "System" entry in the dashboard sidebar
  (`src/components/appshell/navItems.ts` / `NavIcons.tsx`); a new
  "System status" link in the landing footer's Resources column.
- Nothing here touches alerting/notification delivery (ADR 0028) — this
  is read-only observability, not another channel.
