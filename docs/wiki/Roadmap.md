# Roadmap

All the originally planned phases are built and live. This page lists what's open. The detailed history is in [`docs/ROADMAP.md`](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/ROADMAP.md) and the session log in the repository.

> This is a young project run by one maintainer. Items below are intentions, not commitments or dates.

## Shipped

Dashboard and portfolio · stock detail pages · alerts (including stop-loss guards) · news feed · IPO tracker · AI insights and the Mitra chat · retrieval over news and filings · research briefs · multi-agent analysis · API explorer and MCP server · rate limiting · system status and event log · wishlists and per-user notification channels · chart workspace · the screener (hybrid daily-prices-plus-incremental-fundamentals refresh, pagination, CSV export, quick screens) · ranked company search · Mitra screening.

## Open — operations

- [ ] Move production from a Clerk **development** instance to a production instance on a custom domain.
- [ ] Exercise one real **alert fire** and one real **IPO-alert fire** during market hours.
- [ ] Add a **Resend verified domain** for `ALERT_EMAIL_FROM` so email reaches more than the account owner.
- [ ] **Revoke the credentials leaked in the old v1 git history** (a database connection string, a news-API key and a JWT secret) at their providers.
- [ ] Pre-bundle the embedding model into the data service deployment, to remove a ~18 s first-request download on a cold instance.

## Open — product

- [ ] **Filings in the retrieval corpus.** Blocked: BSE returns 403 to the hosting platform's addresses, so annual-report PDFs can't be fetched from there. Needs an unblocked host.
- [ ] **Multiple sectors in one screen** ("healthcare or chemicals"). Needs the schema, API, URL and UI select changed together.
- [ ] **More screener metrics** — PEG, EPS growth, promoter holding, 1- and 5-year growth. The data isn't collected yet.
- [ ] **Outlier handling** for extreme growth rates that come from a tiny starting profit.
- [ ] **Saved screens**, and alerts on a screen.
- [ ] **A faster Mitra** — fewer model round trips for common screening requests.
- [ ] Per-user tools over **MCP** (portfolio, alerts), pending an MCP authentication design.

## Not planned

- **A paid tier or billing** — never ([ADR 0011](Decision-Records)).
- **Trade execution or buy/sell recommendations** — the AI stops before any trade decision ([ADR 0021](Decision-Records)).
- **A native mobile app** — dropped from the roadmap.
- **Paid data vendors.**

## Want to help?

Look for [`good first issue`](https://github.com/AnkushGitRepo/marketmitra/labels/good%20first%20issue) and [`help wanted`](https://github.com/AnkushGitRepo/marketmitra/labels/help%20wanted), or open an issue describing what you'd like to build. Read the [Development Guide](Development-Guide) first.
