# Tier 3 — IPO calendar + subscription + GMP

Isolated, swappable scraper for IPO data — **including grey-market premium
(GMP)**, which has no official or free-API source anywhere. Source:
InvestorGain's "Live IPO GMP" report
(`investorgain.com/report/ipo-gmp-live/331/`).

**Category-wise subscription (#285, [ADR 0074](../../../../../docs/decisions/0074-ipo-category-subscription-and-odds.md)):** each dashboard row
links to `/gmp/<slug>/<id>/`; the same slug and id under `/subscription/` is the subscription page, whose `bid-table` has one row per bidding
day (QIB, NII, small NII, big NII, retail, total). `subscription.py` turns that link into the page URL (only an `investorgain.com/gmp/...`
link is accepted) and parses the latest row; `scripts/refresh_ipos.py` renders those pages after the dashboard, paced and capped, and a page
that fails is skipped. Fixture: `tests/fixtures/investorgain_subscription_sme.html`. Same source, same ToS position as below.

See [ADR 0017](../../../../../docs/decisions/0017-ipo-tracker-gmp-scope.md)
for scope and the ToS position.

## ToS position (accepted known risk)

Reviewed 2026-09-06. InvestorGain / Chittorgarh and similar aggregators are
small commercial sites whose data *is* their product; none licenses
redistribution, and their terms prohibit content reuse without written
permission. **This is not a sanctioned integration.** It is accepted on the
same terms as the Screener.in scraper (ADR 0011):

- Kept in this one module. Swapping the source or dropping GMP is a
  contained edit — nothing else in the IPO tracker imports the aggregator.
- GMP is surfaced **only** with the caveat "unofficial estimate from
  grey-market dealers, compiled by a third-party tracker — not from any
  exchange, not a prediction", and degrades to "GMP unavailable" the moment
  a scrape fails. Alerts on GMP **skip** rather than fire on missing data.
- Polite pacing, a browser-like `User-Agent`, a wide cache TTL
  (`ipo_cache_ttl_minutes`).

## Fetching — why it's out of band

The aggregator's report page is a client-rendered SPA: a plain HTTP GET
returns the shell, and the table rows load afterward from a private XHR.
`scrapling`'s browser fetcher would work but drags in Playwright's ~130 MB
driver, which doesn't fit the Vercel serverless function (ADR 0013).

So live ingestion runs **out of band**: `scripts/refresh_ipos.py`
(run from `.github/workflows/refresh-ipos.yml`, every ~2h) renders the
page with Playwright Chromium, runs `_parse_ipo_rows` (this module), and
`POST`s the rows to `/ipos/ingest` (guarded by `ipo_ingest_token`). The
serverless `GET /ipos` only reads Postgres. Because that POST crosses a
JSON boundary, dates arrive as ISO strings and `ipo_service._coerce`
turns them back into `date`/`datetime`.

`fetch_ipo_list()` here is a best-effort direct attempt for the fixture /
if the page ever server-renders; it returns `[]` (never raises) when the
rows aren't in the response.

## Parsing

`_parse_ipo_rows(html, ref)` is pure and tested against a maintainer-saved
page (`tests/fixtures/investorgain_ipo_gmp.html`) — see
`tests/test_ipos.py`. It reads the `<td data-label="...">` report table:
Name (→ slug + category + status), GMP (value / % / low–high range),
Rating, Sub, Price, IPO Size, Lot, Open / Close / BoA Dt / Listing,
Updated-On, Anchor. `status` is derived from the dates vs `ref` (IST
today), cross-checked with the row's badges.
