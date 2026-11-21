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
- The Funds page starts from four one-click lenses (Core index, Strong risk-adjusted returns, Low volatility, Tax saver) that set ordinary filters you can then change, and its filters are one row (search, category, plan) with the rest under More filters, which also gains a "worst fall" limit. A checkbox on each fund adds it to a comparison of up to three, shown in a bar at the bottom of the funds pages and on a linkable Compare page (`/funds/compare?codes=...`) that marks the best figure in each row; `GET /api/funds/compare` returns the same, and `GET /api/funds` accepts `max_fall_3y`. Fund pages and their peers have a Compare button too. ([#272](https://github.com/AnkushGitRepo/marketmitra/issues/272))
- The comparison page (`/funds/compare`) now opens with a two-point **trade-off summary** (which fund leads the risk and cost measures and which has the highest return, with the figures; and your portfolio's weight in each fund's sector), a **Growth of ₹10,000** chart (1Y, 3Y or 5Y, one line per fund from the same start date, refused for a period a fund is too young for), rows grouped under Returns & SIP, Risk-adjusted efficiency and Cost & portfolio fit with a **Your portfolio in its sector** row, column headers that stay in view, and **+ Add fund** (a search in the header and an empty column) to add a fund without leaving the page. The summary is worked out from the table, not by an AI, and never says what to pick. `GET /api/funds/compare` also returns the trade-off summary. ([#280](https://github.com/AnkushGitRepo/marketmitra/issues/280))
- The Funds page now opens on diversified funds (sector and thematic funds are left out), best Sharpe ratio first, with an "Include sector & thematic funds" tick-box to bring them back; a name search or a chosen sub-category always shows everything, and the Strong risk-adjusted returns and Low volatility lenses show diversified funds. The 3-year return sort had put the most volatile sector funds on top, and a Sharpe sort alone did not fix that. `GET /api/funds` accepts `exclude_thematic`. ([#279](https://github.com/AnkushGitRepo/marketmitra/issues/279))
- A fund page's figures are now one grid of eight cells in two rows (1Y return, 3Y CAGR, 3Y SIP, expense ratio, then Sharpe, Sortino, volatility, max drawdown) with the other periods and details on one line below, the chart's price labels sit beside the line instead of on it, and each peer's Compare button opens the comparison with that peer. The floating chat button no longer covers the last column of the fund tables. ([#279](https://github.com/AnkushGitRepo/marketmitra/issues/279))
- Each fund page has a **Fund X-Ray** next to the chart: three plain findings set against your own portfolio and the fund's peers. Role (the kind of fund and its volatility against the peer median), portfolio fit (how much of your portfolio is already in the sectors the fund invests in, with the holdings named) and cost and downside (expense ratio and worst 3-year fall against the peer medians). It works without an AI key, and with one Mitra can write it up in plain words ("Write it up with Mitra", cached for 12 hours); it describes and never recommends, and the card states in its footer that portfolio fit is at sector level because a fund's own holdings are not loaded. A fund tied to no sector is described by what it is (an international fund by its overseas and rupee exposure) instead of with a data excuse. `GET /api/funds/{code}/xray` and `POST /api/insights/fund-xray` are the API. ([#274](https://github.com/AnkushGitRepo/marketmitra/issues/274))
- A fund page can now show what a monthly SIP of ₹5,000, ₹10,000 or ₹25,000 would have become over 1, 3 or 5 years (invested vs value, with the XIRR) next to the NAV chart. The separate Returns, SIP, Risk and Fund details cards are one grid of only the figures we have, with Calmar added; AUM, exit load, manager, benchmark and launch date appear only when a source provides them. ([#273](https://github.com/AnkushGitRepo/marketmitra/issues/273))
- In the Saved menu you can now set the longest a Long/Short trade box may run (10, 25, 50, 100 candles or to now; 50 by default) and switch on "Show every saved trade setup", which draws all your saved setups on the chart at once, each starting at the candle it was made on and labelled with its direction and age, so you can see what taking each trade would have done. ([#257](https://github.com/AnkushGitRepo/marketmitra/issues/257))
- A **Setups** menu after Indicators on the stock chart puts a whole set of indicators on in one click: ready-made ones for a long-term investor, swing trader, intraday trader, breakout/momentum trader, mean-reversion trader and researcher, and your own — save what is on the chart under a name and apply or delete it later (kept in your browser). The setup that matches the chart is marked. ([#259](https://github.com/AnkushGitRepo/marketmitra/issues/259))
- The entry, stop and target values of an Auto-Chart trade are now on the Long/Short box itself (stop and target at its corners, entry on its line) instead of on the price axis, so the axis stays clear. ([#257](https://github.com/AnkushGitRepo/marketmitra/issues/257))
- On the 1m, 5m, 15m and 1h charts the bottom bar now has range buttons — 1D, 5D, 1M and All — to see the last day, five days, a month or everything loaded at once; a range the loaded history cannot fill is greyed out. The chart credit now reads just "TradingView" (a link). ([#260](https://github.com/AnkushGitRepo/marketmitra/issues/260))
- The stock chart has three more timeframes — 30 minutes, week (W) and month (M) — next to 1m, 5m, 15m, 1h and Day. Candles, live updates, drawings and AI Auto-Chart work on each; the candles and AI Auto-Chart APIs accept the new intervals. ([#261](https://github.com/AnkushGitRepo/marketmitra/issues/261))

### Changed

- IPO briefs come back in seconds instead of a minute or more: the model's reasoning is capped for this short summary (measured 8.6 s against 59 s for the same brief with search), and a scheduled job writes the shared brief for every open and upcoming IPO after each IPO refresh, so most visitors open one that is already there. ([#287](https://github.com/AnkushGitRepo/marketmitra/issues/287))
- The search box, notifications, settings and hide-values buttons in the top header now show the same tip (name and a one-line hint) after a short pause when you rest the pointer on them. ([#271](https://github.com/AnkushGitRepo/marketmitra/issues/271))

- When the main sidebar is collapsed, hovering an icon (or tabbing to it) now shows its name and go-to shortcut in the same tip as the chart's toolbar, at once. ([#269](https://github.com/AnkushGitRepo/marketmitra/issues/269))

- The chart's timeframe and chart-type pickers now open a menu in the same style as the other chart menus (with a properly spaced check mark and arrow-key support) instead of the browser's own list. ([#268](https://github.com/AnkushGitRepo/marketmitra/issues/268))

- The chart's timeframe is now always picked from one dropdown; the row of timeframe buttons next to it is gone. ([#266](https://github.com/AnkushGitRepo/marketmitra/issues/266))

- The tooltips on the chart's top and bottom bars now look and behave like the ones on the left toolbar (a dark label with a one-line hint, shown at once) instead of the browser's slow default. ([#266](https://github.com/AnkushGitRepo/marketmitra/issues/266))

- The stock chart no longer shows the "Unrestricted mode. AI opinion from public data, not licensed investment advice. You make the decision." line under the toolbar when an Auto-Chart trade setup is shown. ([#264](https://github.com/AnkushGitRepo/marketmitra/issues/264))

- The stock chart's toolbar now stays on one row: the symbol is no longer repeated (it shows in full screen only), the timeframes become one dropdown and Candles/Line one picker when the chart is narrow, Alert and full screen are icon-only with tooltips, and on narrower charts Setups, Drawings, Saved and AI Auto-Chart show as icons. Every control in the top and bottom bars now has a tooltip. The "Auto-Chart from X ago (price then X)" line above the chart is gone (the Saved menu already shows it). ([#264](https://github.com/AnkushGitRepo/marketmitra/issues/264))

- The TradingView logo at the bottom left of the stock chart is gone; the chart footer now credits "Charts by TradingView" with a link instead, as the chart library's licence asks. ([#251](https://github.com/AnkushGitRepo/marketmitra/issues/251))

### Fixed

- The IPO brief now researches the company instead of repeating the card and answering "Not available in our data": with a Gemini key it searches public sources (the prospectus, filings, news) for the business, the fresh-issue and offer-for-sale split, the use of the proceeds, valuation against listed peers and the main risks, and says plainly when a fact is not disclosed instead of inventing it. On a local install with Unrestricted Mitra on (and for a hosted admin) it also gives a Listing call and a Long-term call, kept in your own cache and never shown to other users. ([#284](https://github.com/AnkushGitRepo/marketmitra/issues/284))
- A generated IPO brief no longer disappears when you reload the IPO page: the last brief for each IPO is shown again, and a small move in the grey-market premium or the subscription no longer makes the next viewer regenerate it. ([#284](https://github.com/AnkushGitRepo/marketmitra/issues/284))
- Sector funds (healthcare, banking, technology, PSU and the rest, filed by SEBI under "Sectoral Fund" and "Sectoral/ Thematic" as well as "Thematic Fund") now have peers of the same theme, across all three of those groups. ([#274](https://github.com/AnkushGitRepo/marketmitra/issues/274))
- A fund's peers on its fund page no longer mix unrelated themes: a Taiwan fund is now compared with the other foreign-equity funds, not with defence, healthcare and infrastructure funds that SEBI files under the same "Thematic Fund" sub-category. ([#273](https://github.com/AnkushGitRepo/marketmitra/issues/273))
- The chart's toolbar dropdowns (Saved, Setups, Drawings, Indicators) now move to stay fully inside the chart instead of being cut off at its right edge. ([#262](https://github.com/AnkushGitRepo/marketmitra/issues/262))

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
