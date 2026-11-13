# Changelog

All notable changes to MarketMitra are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The landing page open-source panel shows this repository's live GitHub stars, contributor count, licence and latest release. ([#189](https://github.com/AnkushGitRepo/marketmitra/issues/189))
- The data service can run on Google Cloud Run: a Dockerfile (with the embedding model baked in) and deploy scripts for it. ([#171](https://github.com/AnkushGitRepo/marketmitra/pull/171), [#178](https://github.com/AnkushGitRepo/marketmitra/pull/178))

### Changed

- Search and sharing metadata: a descriptive page title and description, keywords, a canonical URL and structured data for search engines, and a clearer README opening and package description. ([#187](https://github.com/AnkushGitRepo/marketmitra/pull/187))
- The hosted deployment uses the data service on Google Cloud Run instead of Vercel, which frees the Vercel CPU allowance, and the service now compresses larger responses with gzip. ([#174](https://github.com/AnkushGitRepo/marketmitra/pull/174))

### Fixed

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

[Unreleased]: https://github.com/AnkushGitRepo/marketmitra/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/AnkushGitRepo/marketmitra/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/AnkushGitRepo/marketmitra/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/AnkushGitRepo/marketmitra/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/AnkushGitRepo/marketmitra/releases/tag/v0.2.0
