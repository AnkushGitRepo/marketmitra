# 0052 — API reference redesign: MCP hub, categorised REST view, `/watchlists` rename

Status: accepted (2026-11-11, issue #90)

## Context

`/api-docs` listed every endpoint in one long sidebar with its own scrollbar next to the page scrollbar, buried the MCP
server under a card, and gave an agent no copy-paste way to connect. The REST API also still used the user-facing word
"wishlists" while the product says "watchlists".

## Decision

- **Three tabs, MCP first:** AI Agents & MCP (default), REST API Reference, Schemas & OpenAPI. "Copy API context prompt" is a
  header action. The header shows the one product version, REST operation count and MCP tool count.
- **MCP hub:** one-click config for Cursor (`mcpServers` JSON), Claude Code (`claude mcp add --transport http`) and Claude
  Desktop (`mcp-remote` bridge), built from this deployment's origin. Tool cards are generated from the zod input schemas
  (`z.toJSONSchema`) so the parameter tables cannot drift from the server; "Run example" sends a real JSON-RPC `tools/call`
  to `/api/mcp` and shows the real response. Example arguments live in `MCP_EXAMPLE_ARGS`; a test requires one per tool.
- **REST tab:** five categories (Market Data, Watchlists & Screener, Portfolio & Notes, AI & Mitra Copilot, System & Cron)
  mapped from spec tags with path overrides (`src/lib/api-docs/categories.ts`). Three columns (nav, docs, sticky code samples
  plus Try it) that all scroll with the page: **no nested scrollbar**. Deprecated aliases are hidden from the list.
- **Mobile (under 768px):** a grouped `<select>` replaces the endpoint list, the Try-it console is hidden, MCP stays the default.
- **Authentication** is stated explicitly: public and MCP need no key; session cookie (hosted) or open (self-host); cron uses
  the `CRON_SECRET` bearer; personal access tokens do not exist yet (#91, not built).
- **Rename:** `/api/wishlists*` becomes `/api/watchlists*`. The old paths remain as `deprecated: true` aliases that re-export
  the same handlers, so existing callers keep working. Storage and the data-export field keep their legacy `wishlists` names.
- **Checks on Try it (#98):** an optional pass/fail list per request (status equals, header contains, JSON path exists/equals),
  defaulting to the first documented 2xx status; MCP cards default to status 200 plus `result.content`. Evaluated by a pure
  function (`src/lib/api-docs/checks.ts`) on the received response, per session, nothing stored.
- **MCP catalog (#100):** the tool cards became a master-detail view (sticky tool list, inspector with badges, parameter table
  with defaults, example request, checks and the live response; a select on mobile). Long schemas such as `run_screener` scroll
  inside a capped parameter section so the page does not stretch. A Windsurf preset (`serverUrl`), Copy URL, and a reachability
  indicator from a real `tools/list` call were added. No sample output is invented; the response is always a live call.
- **Checks UX (feedback on #100):** the checks editor is collapsed by default (the default checks still run on every send), each
  check is one compact row, and results show as pass/fail pills above a response viewer (Formatted/Raw, Copy JSON, capped height)
  with status, latency and size. A latency check was added. Cmd/Ctrl+Enter runs the request when focus is inside the panel.

## Consequences

- Removing the deprecated aliases is a later breaking change (call it out in a release).
- The docs UI is split into focused files under `src/app/(app)/api-docs/`; pure logic is in `src/lib/api-docs/` with tests.
