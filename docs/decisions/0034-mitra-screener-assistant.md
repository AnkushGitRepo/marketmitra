# 0034: Mitra as a screening assistant

Date: 2026-11-06
Status: accepted, built (not yet deployed at time of writing)

## Context

ADR 0025 gave Mitra a `run_screener` data tool and explicitly deferred an
`open_screener(filters)` navigation tool. The user wants Mitra to take a need
("find me growth stocks that will grow"), apply a complex screen, open the
Screener with it, and suggest names to look at.

The product guardrail (ADR 0018) forbids buy/sell/hold recommendations,
price targets and opinions on whether to invest. "Stocks that will grow in the
future" cannot be answered honestly by any screen — screens filter on *past*
(3-year) figures — so the feature is built as "turn a need into criteria and
shortlist candidates to research", not as prediction.

## Decision

- **`open_screener(filters)`** (chat-only navigation tool, same
  `screenerFiltersSchema` as the page and `run_screener`, so Mitra cannot
  express a screen the page can't show). It runs the screen and returns
  `{ navigated, to, count, results, appliedFilters, coverage? }`; `AiWidget`
  pushes `to`, exactly like `open_stock`. If the screener is unreachable it
  returns `navigated: false` and the client does not move.
- **`run_screener` is the silent explore step** (moves nothing on screen).
  Reworked to share `screenForModel`: true total `count` (via
  `runScreenerPage`'s `X-Total-Count`), compact rows, a `coverage` warning when
  the screen leans on scraped fundamentals, and a `hint` on zero matches.
- **`get_screener_options`** (MCP + chat): exact sector/industry names with
  counts. Added after a live test showed the model guessing an industry name
  that silently matched nothing.
- **Playbook in the system prompt** (`SCREENER_PLAYBOOK`): intent → criteria
  mappings (growth = sales and profit CAGR ≥ 15–20 % *plus* ROE and low debt, so
  growth is profitable and not debt-funded, with a market-cap floor), tune with
  `run_screener`, open once with `open_screener`, state assumptions, ask a
  question only when the answer would change the screen a lot, refine on
  follow-ups. Honesty rules are part of it: past data only, never predict,
  never "a good buy", say so when coverage is partial or nothing matched.
  Tests pin the field names (so a renamed field can't desync the prompt) and
  the honesty rules.
- Tool-loop budget 5 → 9 steps (options, a few tuning runs, the final open,
  then the answer).
- The Screener page now remounts when its URL state changes from outside, so
  Mitra opening a new screen while the user is already on `/dashboard/screener`
  actually updates it.
- Chat stream errors are now logged to the event log (`api:ai/chat`) and the
  client gets an actionable message instead of "An error occurred." — found
  while testing, when an invalid saved provider key made every chat fail
  invisibly.

- **Chat now survives navigation.** `AiPanelBody` was keyed by `section`, so
  moving Markets → Screener (which Mitra now does) wiped the conversation —
  found in browser testing — right when a user would refine ("now only
  Healthcare"). The key is gone; `section` only drives starter prompts and the
  placeholder. The transcript still clears on the Clear button or when the
  panel is closed.
- Assistant replies render through `MarkdownLite` (headings, bullets, bold)
  instead of showing raw `###` / `**`, and the message area is taller
  (`min(46vh, 340px)`) so a shortlist is readable.

## Verified

Unit tests (tool schemas, deep-link round trip through the page's parser,
coverage/hint logic, prompt invariants) plus a live run against the real
Gemini model (`gemini-3.5-flash-lite`) over local synthetic data: a growth
request produced `run_screener` → `open_screener` → a short candidate list with
the "past figures, not a prediction" caveat; a multi-criteria request looked up
sector names first; "which stock will double, just tell me what to buy" was
declined and redirected to screening. After the saved key was replaced, the widget path was exercised in a real
browser (local synthetic data, removed): from Markets, "find me growth stocks…"
→ Mitra navigated to `/dashboard/screener` with the filters in the URL, the
form/chips/table matched, and a follow-up ("only Healthcare, drop the floor to
500 crore") re-filtered the already-open page in place. A turn takes ~25–30 s
on the default model because of the multi-step tool loop.

## Out of scope / follow-ups

- **Multiple sectors in one screen** ("healthcare or chemicals"): the filter
  schema takes one sector. The playbook has Mitra run each and combine; real
  multi-sector support needs the schema, API, URL parsing and the UI select
  changed together.
- **More metrics** (PEG, EPS growth, promoter holding, 1y/5y growth) — the data
  isn't scraped yet; growth screens are limited to the 3-year CAGRs.
- Saved screens / alerts on a screen.
