# Changelog

All notable changes to MarketMitra are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- AI Auto-Charts are now saved for each stock and timeframe (the latest 10): turning Auto-Chart on shows the newest saved one without another AI call, a new "Saved" menu next to the button lists them, lets you show or delete any of them, and **Generate new** makes a fresh one while keeping the old ones. The chart says how old the shown one is. ([#253](https://github.com/AnkushGitRepo/marketmitra/issues/253))
- The drawing tools on the chart's left toolbar now show a tooltip with the tool's name and a one-line hint on how to use it, on hover and keyboard focus. ([#249](https://github.com/AnkushGitRepo/marketmitra/issues/249))
- What AI Auto-Chart draws now appears in the chart's Drawings menu under its own "AI Auto-Chart" heading: each level, trendline and the trade setup can be removed on its own, or all at once. Every row in the Drawings menu, your own and the AI's, also has an eye button to hide or show it without removing it. ([#245](https://github.com/AnkushGitRepo/marketmitra/issues/245), [#247](https://github.com/AnkushGitRepo/marketmitra/issues/247))
- On the hosted site, an admin (a user listed in `ADMIN_USER_IDS`) can now use Unrestricted Mitra and Mitra Advisor like a local install does; every other hosted user still cannot, whatever they send. ([#243](https://github.com/AnkushGitRepo/marketmitra/issues/243))
- The stock chart has 1m, 5m, 15m and 1h candles next to the daily chart, and the latest candle and the header price now update by themselves while the market is open (every 10 seconds on 1m, 30 on 5m, 60 on 15m, 120 on 1h on the hosted site; faster on a local install). Indicators, drawings and AI Auto-Chart work on every timeframe. ([#236](https://github.com/AnkushGitRepo/marketmitra/issues/236))
- Chart indicators can be tuned: a ⚙ beside each indicator in the Indicators menu opens its settings (periods, multipliers, MACD fast/slow/signal, Stochastic smoothing) with a Reset, saved in your browser and shown in the chart legend and pane names. ([#234](https://github.com/AnkushGitRepo/marketmitra/issues/234))
- The stock chart shows which colour is which: every indicator has a colour swatch in the Indicators menu, a legend at the top-left of the chart lists the active ones with their periods and the value under the cursor, and each pane (RSI, MACD, ...) is named. New indicators: SMA 100, EMA 100, EMA 200, Supertrend, Donchian Channel, Stochastic, ATR and On-Balance Volume. ([#232](https://github.com/AnkushGitRepo/marketmitra/issues/232))
- New drawing tools on the chart's left toolbar: ray, vertical line, rectangle, and long and short position boxes with a reward : risk label. A new Drawings menu lists everything drawn on the chart with a remove button on each row (and Remove all); you can also click a drawing to select it and press Delete. ([#232](https://github.com/AnkushGitRepo/marketmitra/issues/232))
- An **AI Auto-Chart** button on the stock chart draws support and resistance levels, trendlines and suggested indicators straight onto the candles from your own AI key, with no text to read. On a local install with unrestricted Mitra turned on, it also plans a trade the way an investor would (an entry at a level, a stop beyond it, a target at the next level, only when it pays at least 1.5 : 1, otherwise it says why not) and draws it with the risk/reward ratio; the hosted site only ever shows market structure. ([#228](https://github.com/AnkushGitRepo/marketmitra/issues/228), [#238](https://github.com/AnkushGitRepo/marketmitra/issues/238))
- The stock chart has a full-screen button at the top right of its toolbar; Esc or the same button goes back. ([#230](https://github.com/AnkushGitRepo/marketmitra/issues/230))
- The data service now holds every Indian mutual fund scheme with its category, daily NAV and full NAV history, and computes 1M–10Y returns, SIP returns and risk ratios from it, served at `/funds`. Expense ratios come from AMFI's disclosure via a community-maintained dataset, shown with where and when they were updated. On a local install, one command (`refresh_funds.py seed`) fills the fund data into your own database, the same way the stock screener is filled. A new Funds page screens them by category, fund house, returns, risk and expense ratio, and each fund has a page with its NAV chart, returns, SIP returns, risk ratios and peers. ([#220](https://github.com/AnkushGitRepo/marketmitra/issues/220))

### Changed

- The TradingView logo at the bottom left of the stock chart is gone; the chart footer now credits "Charts by TradingView" with a link instead, as the chart library's licence asks. ([#251](https://github.com/AnkushGitRepo/marketmitra/issues/251))

### Fixed

- A saved AI Auto-Chart's Long/Short box now starts at the candle it was generated on and runs through the candles since, instead of starting after the latest candle as if it were new. ([#255](https://github.com/AnkushGitRepo/marketmitra/issues/255))

## [0.6.0] - 2026-11-17

### Added

- SME (NSE SME platform) stocks are now searchable by symbol and company name and in the screener, with an All / Main board / SME switch, an SME badge on every SME row and stock page, and a Board column in the CSV export. The dashboard's top gainers and losers still never show them. ([#216](https://github.com/AnkushGitRepo/marketmitra/issues/216))
- The morning brief on the Analyst desk now opens with a short summary, then what needs a look (with how much of your portfolio each holding is), then good news, and folds the holdings with nothing material away. Each row can open that analyst's chat with the question ready to send, or its dossier. Routine price and volume notes no longer count as something to read. ([#214](https://github.com/AnkushGitRepo/marketmitra/issues/214))
- On a local app with the Advisor on, the thesis monitor for your journal decisions now runs when the app starts and every 6 hours while it stays open, and the Advisor page shows when it last ran. ([#204](https://github.com/AnkushGitRepo/marketmitra/issues/204))
- On a local or self-hosted app, analyst dossiers, the evening check and the morning brief catch up when the app is running, then keep going on the same schedule as the hosted site. Set `LOCAL_AI_SCHEDULE=off` to turn that off. Nothing runs while the machine is off. ([#193](https://github.com/AnkushGitRepo/marketmitra/issues/193))
- The landing page open-source panel shows this repository's live GitHub stars, contributor count, licence and latest release. ([#189](https://github.com/AnkushGitRepo/marketmitra/issues/189))
- The data service can run on Google Cloud Run: a Dockerfile (with the embedding model baked in) and deploy scripts for it. ([#171](https://github.com/AnkushGitRepo/marketmitra/pull/171), [#178](https://github.com/AnkushGitRepo/marketmitra/pull/178))

### Changed

- With a Gemini key, the Advisor's "buy the dip" detection and the "no trade advice" checks on agent briefings and research memos also use Google's Gemini Decisions model, so ordinary wording is caught as well as the fixed phrases. Without a Gemini key nothing changes. ([#206](https://github.com/AnkushGitRepo/marketmitra/issues/206))
- The Advisor opens on your own holdings with no setup: weights against single-stock and sector limits, a fresh-money view, holdings down 30% or more, a check of whether a stock fits your rules, and a decision tracker built from your holdings. A preset applies until you save a policy, which now also has a sector limit. It stays local-only. ([#202](https://github.com/AnkushGitRepo/marketmitra/issues/202))
- With automatic analysts turned off, a card that does not yet have a dossier offers Generate dossier, so you choose which one to build. A paused analyst can be built that way. ([#194](https://github.com/AnkushGitRepo/marketmitra/issues/194))
- Search and sharing metadata: a descriptive page title and description, keywords, a canonical URL and structured data for search engines, and a clearer README opening and package description. ([#187](https://github.com/AnkushGitRepo/marketmitra/pull/187))
- The hosted deployment uses the data service on Google Cloud Run instead of Vercel, which frees the Vercel CPU allowance, and the service now compresses larger responses with gzip. ([#174](https://github.com/AnkushGitRepo/marketmitra/pull/174))

### Fixed

- The morning brief and other long notifications in the bell dropdown now show a short list of lines with a "+N more" hint, instead of one clipped paragraph. ([#210](https://github.com/AnkushGitRepo/marketmitra/issues/210))
- On a local or self-hosted app, analyst sweeps and the morning-brief check keep running on the clock while the app stays open, instead of only when the server starts. ([#196](https://github.com/AnkushGitRepo/marketmitra/issues/196))
- A failed first database connection on a cold start no longer breaks every request on that instance until it restarts, and the Analyst Desk shows a "Reload roster" state if the roster cannot load. ([#159](https://github.com/AnkushGitRepo/marketmitra/pull/159))
- Generating the 360 brief no longer ends in Safari's "The string did not match the expected pattern." on a slow generation: the AI insight routes now allow up to 300 seconds, and a timeout or a dropped connection shows a plain message. ([#163](https://github.com/AnkushGitRepo/marketmitra/pull/163))

### Security

- The data service no longer returns SQL or driver details in error responses, no longer creates a company (or scrapes NSE, BSE and yfinance) for a symbol that is not an NSE listing, runs as a least-privilege service account, and hides its API docs on Cloud Run. ([#177](https://github.com/AnkushGitRepo/marketmitra/pull/177))

## [0.5.0] - 2026-11-11

### Added

- One research container on the stock page, with tabs (All points, Supports, Weak spots, Valuation) and a valuation sensitivity check computed from our data that needs no AI key. ([#153](https://github.com/AnkushGitRepo/marketmitra/pull/153))
- A primary action per analyst card with an overflow menu, and Retry all stalled on the Analyst Desk. ([#151](https://github.com/AnkushGitRepo/marketmitra/pull/151))

### Removed

- The separate "Longer AI read" section on the stock page, replaced by the research container. ([#153](https://github.com/AnkushGitRepo/marketmitra/pull/153))

### Fixed

- Analysts that hit an unexpected error are retried instead of stalling for good. ([#150](https://github.com/AnkushGitRepo/marketmitra/pull/150))

## [0.4.0] - 2026-11-11

### Added

- Analyst Desk: a persistent AI analyst for every holding that builds a dossier and keeps a journal of material events, with a desk page, chat with an analyst or the Root Agent, a morning brief by email and in-app at 08:30 IST, and thesis invalidation criteria checked each evening. ([#132](https://github.com/AnkushGitRepo/marketmitra/pull/132), [#134](https://github.com/AnkushGitRepo/marketmitra/pull/134), [#135](https://github.com/AnkushGitRepo/marketmitra/pull/135), [#136](https://github.com/AnkushGitRepo/marketmitra/pull/136), [#137](https://github.com/AnkushGitRepo/marketmitra/pull/137))
- Queue states that say when a dossier has to wait for tomorrow's budget, with Analyze now and Retry. ([#141](https://github.com/AnkushGitRepo/marketmitra/pull/141))
- A high daily AI cap for analysts on a local or self-hosted instance (200 calls; 20 when hosted). ([#143](https://github.com/AnkushGitRepo/marketmitra/pull/143))
- Structured Mitra briefs on the dashboard, markets, news and IPO widgets. ([#126](https://github.com/AnkushGitRepo/marketmitra/pull/126))

## [0.3.0] - 2026-11-11

### Added

- A tabbed API & MCP reference with a live tool catalog, an MCP hub and pass/fail checks on "Try it". ([#97](https://github.com/AnkushGitRepo/marketmitra/pull/97), [#99](https://github.com/AnkushGitRepo/marketmitra/pull/99), [#101](https://github.com/AnkushGitRepo/marketmitra/pull/101))
- Personal access tokens for the session-scoped API in hosted mode. ([#102](https://github.com/AnkushGitRepo/marketmitra/pull/102))
- A redesigned stock page with a 360 Mitra brief (a computed data panel and five structured AI points) and a local-only unrestricted mode. ([#104](https://github.com/AnkushGitRepo/marketmitra/pull/104), [#116](https://github.com/AnkushGitRepo/marketmitra/pull/116))
- Watchlist name modals, a read-only Holdings watchlist and sorting by gain or loss, and setting an alert from the stock page in a modal. ([#109](https://github.com/AnkushGitRepo/marketmitra/pull/109), [#110](https://github.com/AnkushGitRepo/marketmitra/pull/110))

### Changed

- The REST routes `/api/wishlists` were renamed `/api/watchlists`. ([#97](https://github.com/AnkushGitRepo/marketmitra/pull/97))

### Deprecated

- `/api/wishlists` still works as an alias of `/api/watchlists` but is deprecated and will be removed.

### Removed

- The Rename action in the stock page watchlist menu. ([#113](https://github.com/AnkushGitRepo/marketmitra/pull/113))

### Fixed

- The 360 brief is no longer cut off by a thinking model's output budget. ([#118](https://github.com/AnkushGitRepo/marketmitra/pull/118))
- The `apiTokens` indexes are created the first time tokens are used. ([#120](https://github.com/AnkushGitRepo/marketmitra/pull/120))
- Holdings on the Portfolio page link to their stock page, and the Settings icon is a gear. ([#108](https://github.com/AnkushGitRepo/marketmitra/pull/108), [#114](https://github.com/AnkushGitRepo/marketmitra/pull/114))

## [0.2.0] - 2026-11-11

### Added

- A Mitra chat workspace: a full-page chat with history, file attachments and access to platform data, a collapsible conversation list, keyboard shortcuts for search and navigation, a screening assistant that opens the screener with filters, and holdings import from uploaded files with a preview-and-confirm step. ([#34](https://github.com/AnkushGitRepo/marketmitra/pull/34), [#42](https://github.com/AnkushGitRepo/marketmitra/pull/42), [#32](https://github.com/AnkushGitRepo/marketmitra/pull/32))
- Mitra Advisor: local-only, rules-first long-term decision support. ([#13](https://github.com/AnkushGitRepo/marketmitra/pull/13))
- Multi-agent stock analysis (an analyst panel, then a bull and bear debate and a synthesis) with a reflection loop, and research briefs grounded in retrieval over your notes, holdings, news and filings.
- A public API: a read-only MCP server at `/api/mcp`, an interactive API explorer with `openapi.json`, and fair-use rate limiting.
- A screener: a bulk-ingestion pipeline, a Screener page with compact live filters and mobile cards, CSV export, quick screens and a Mitra tool. ([#78](https://github.com/AnkushGitRepo/marketmitra/pull/78))
- A TradingView-style chart workspace on the stock page, and index detail pages with a candlestick option.
- A markets hub with breadth and sectors, a unified dashboard hero card, a portfolio page with KPIs, an allocation donut and risk cards, a curated news page with tone badges and topics, and an IPO tracker with dense cards, GMP and filters. ([#72](https://github.com/AnkushGitRepo/marketmitra/pull/72), [#70](https://github.com/AnkushGitRepo/marketmitra/pull/70), [#68](https://github.com/AnkushGitRepo/marketmitra/pull/68), [#82](https://github.com/AnkushGitRepo/marketmitra/pull/82), [#80](https://github.com/AnkushGitRepo/marketmitra/pull/80), [#19](https://github.com/AnkushGitRepo/marketmitra/pull/19))
- Alerts and email: reliable alert emails with an admin status and test sending, reply-to and a real contact line, a one-time welcome email, the supplied email design system with an admin gallery, and self-serve alert channels. ([#86](https://github.com/AnkushGitRepo/marketmitra/pull/86), [#76](https://github.com/AnkushGitRepo/marketmitra/pull/76), [#56](https://github.com/AnkushGitRepo/marketmitra/pull/56), [#60](https://github.com/AnkushGitRepo/marketmitra/pull/60))
- A tabbed settings hub with a tested AI key card, advanced preferences with data export and key management, and Account & security with sign out and account switching. ([#88](https://github.com/AnkushGitRepo/marketmitra/pull/88), [#44](https://github.com/AnkushGitRepo/marketmitra/pull/44), [#55](https://github.com/AnkushGitRepo/marketmitra/pull/55))
- Navigation: a labelled sidebar with a collapsible rail, a 5-slot mobile bottom bar with a Mitra button, an admin-only System page, and a public status page with an event log. ([#30](https://github.com/AnkushGitRepo/marketmitra/pull/30), [#48](https://github.com/AnkushGitRepo/marketmitra/pull/48), [#43](https://github.com/AnkushGitRepo/marketmitra/pull/43))
- Version management: one product version, a generated changelog, tagged releases and guarded deploys. ([#92](https://github.com/AnkushGitRepo/marketmitra/pull/92))

### Changed

- **Breaking:** app pages moved from `/dashboard/[page]` to `/[page]` (for example `/portfolio`); only `/dashboard` itself stays. ([#40](https://github.com/AnkushGitRepo/marketmitra/pull/40))
- Faster pages: notifications are fetched once instead of per bell, dashboard pages stream, and Clerk stays off the public pages.

### Fixed

- SME IPOs are classified as SME instead of mainboard. ([#18](https://github.com/AnkushGitRepo/marketmitra/pull/18))
- The stock chart no longer collapses on iPhone or breaks when price data is missing. ([#65](https://github.com/AnkushGitRepo/marketmitra/pull/65))
- Email delivery failures are visible, with an admin status and test sending. ([#66](https://github.com/AnkushGitRepo/marketmitra/pull/66))
- Mitra dictation can use the microphone and guides you when it is blocked. ([#41](https://github.com/AnkushGitRepo/marketmitra/pull/41))
- The price chart plots oldest to newest, the P&L table no longer shows a garbage column from unscaled quarterly data, peer rows are de-duplicated and link to their stock pages, and the stock page shows a loading state on first load.
- The screener returns CAGR as a percentage, like ROE and ROCE.
- `openapi.json`'s version is updated as text, so a release changes only that line. ([#95](https://github.com/AnkushGitRepo/marketmitra/pull/95))

### Security

- A security hardening pass: CodeQL, secret scanning with push protection, Dependabot, an SSRF-safe downloader, log-injection-safe logging, least-privilege workflow permissions and branch protection, with the CodeQL findings resolved.

[Unreleased]: https://github.com/AnkushGitRepo/marketmitra/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/AnkushGitRepo/marketmitra/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/AnkushGitRepo/marketmitra/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/AnkushGitRepo/marketmitra/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/AnkushGitRepo/marketmitra/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/AnkushGitRepo/marketmitra/releases/tag/v0.2.0
