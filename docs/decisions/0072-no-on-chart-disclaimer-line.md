# 0072 — No disclaimer line on the stock chart

Status: accepted (2026-11-19, issue #264; decided by the maintainer)

## Context

ADR 0068 had the Auto-Chart bar repeat "Unrestricted mode. AI opinion from public data, not licensed investment advice. You make the
decision." under the toolbar whenever a trade setup was shown. The maintainer asked for it to be removed from the chart.

## Decision

The line is no longer drawn on the chart. Nothing else about the trade setup changes: it still exists only in unrestricted mode (local, or
a hosted admin, ADR 0054, 0070), labels stay neutral (`ENTRY`, `STOP`, `TARGET`), and there is no `BUY` / `SELL` wording, position
sizing or return promise. The disclaimer that ADR 0054 puts at the end of unrestricted Mitra answers is not touched.

## Consequences

- The chart bar is shorter. The chart no longer states on its face that the setup is an AI opinion; the setup only appears after the user
  has turned unrestricted mode on in Settings.
- This supersedes the "standard note" sentence in ADR 0068's unrestricted bullet.
