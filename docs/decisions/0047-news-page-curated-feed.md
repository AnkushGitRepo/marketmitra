# 0047 — News page: curated feed, tone badges, topics, interactive tickers

Status: accepted (2026-11-11, issue #81)

## Context

`/news` was an undifferentiated column of identical text links: no hierarchy, a tiny tone dot, no topics, inert ticker tags with
no link to prices, holdings or Mitra, and lines far wider than a comfortable reading measure.

## Decision

- **Layout**: from 1100px, stories (65%) beside a rail (35%) with Trending tickers and the Mitra news pulse; below that, one
  column in the order trending pills, pulse, stories. The stories column caps the line length.
- **Stories** (`StoryCard`): title, two-line excerpt (cleaned of tags and double-encoded entities), topic, source, time, tone
  badge, ticker pills. The newest story is the **hero** (larger type, longer excerpt): the data has no importance score, so no
  ranking is implied. 20 stories are revealed at a time from what is loaded before another request is made.
- **Tone badge** replaces the dot: Positive / Negative / Neutral with an arrow, never colour alone, and a tooltip. The (i)
  popover beside the title carries the methodology text that used to sit above the feed.
- **Topics** (`classifyTopic`): auto-tagged from headline keywords with a fixed precedence (regulatory, earnings, technical,
  macro); untagged stories show only under All. Titles only (summaries are too loose); word-boundary matches.
- **Ticker pills** (`TickerPill`): a popover with company, last price and day change (`/api/stock/{t}?sections=company,quote`),
  Open stock, View in Screener (`/screener?q=`), and Add to Watchlist (pick a list via the watchlist API). Held symbols carry a
  "Holding" tag.
- **Trending tickers** (`trendingTickers`): most-mentioned tickers in the last 24 hours over the loaded page, with live day
  change; fewer than five (or none) when few headlines are tagged, and it says so.
- **Mitra news pulse**: two sentences on the dominant themes of the latest 20 headlines, grounded only in them (`NEWS_SYSTEM`,
  guardrail appended), per-user cache 1h, opt-in generate. `POST /api/insights/news`, in OpenAPI.

## Deviations from the request

- **Positive / Negative, not Bullish / Bearish**: the score is a headline-tone read (VADER). "Penalised by RBI" reads negative
  but is not a bearish call, so trading words would overclaim. The popover says it is not a signal.
- **Hero = newest**, not "highest impact" (no such field). **Pulse = two sentences**, like the dashboard and Markets pulses, not
  bullets. **Topic chips have no counts** (they would count only what is loaded).
- CSS Modules, not Tailwind (ADR 0003).

## Consequences

`InfoPopover` is now shared (the screener's info button wraps it). `NewsList` stays for the portfolio page's holdings news.
Topic rules are keyword lists and will misfile some headlines; they are tags, easy to read and extend.
