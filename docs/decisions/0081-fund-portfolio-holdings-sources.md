# 0081 — Mutual fund portfolio holdings: sources researched

Status: proposed (research only; no ingestion code until the maintainer approves) · Date: 2026-11-24 · Issue: #275 · Builds on [0067](./0067-mutual-funds-data-sourcing.md), [0011](./0011-three-tier-fundamentals-data-sourcing.md)

## Context

A fund-versus-holdings overlap check (for example "how much of this fund is stocks you already own") needs each fund's stock-level portfolio.
We store scheme master data, NAV, computed metrics and a factsheet row per scheme ([0067](./0067-mutual-funds-data-sourcing.md)) but no holdings. The rules
that bound the answer: free sources only ([0011](./0011-three-tier-fundamentals-data-sourcing.md)), no bypassing bot checks or spoofing a browser
(`AGENTS.md`), "not available" rather than guessed, and no ingestion code merged before the maintainer approves.

All findings are from public pages read on 2026-11-24. Nothing was downloaded in bulk and no file was parsed.

## What the rule says

SEBI requires an AMC to disclose each scheme's portfolio as of month end, with ISINs, on its own website (and AMFI's) within 10 days of month end,
preferably in a spreadsheet; some categories are also disclosed fortnightly or half-yearly
([SEBI circular CIR/IMD/DF/21/2012](https://www.sebi.gov.in/sebi_data/attachdocs/1347547815927.pdf), and scheme information documents that repeat it). Later amendments
were not checked. Disclosure to investors is free; that is not the same as permission to copy and republish it.

## Candidates

| # | Source | Format and shape | Terms and cost | Verdict |
|---|---|---|---|---|
| 1 | **AMC websites (AMC-direct)** | One statutory disclosure per AMC: Excel (mostly `.xlsx`, some `.xls`, some `.zip`), by month and sometimes fortnight, about 45 AMCs. Columns follow SEBI's list (instrument, ISIN, industry, quantity, market value in ₹ lakh, % of NAV) but names and layout differ by AMC. One AMC's page (Groww MF) lists files by date with no scheme in the file name, so the scheme split is inside the workbook. Files there ran April to November 2026 only. | Free to fetch, no login seen. Terms are per AMC: the same Groww page says its portfolio section is intended for registered distributors and authorised intermediaries, so each AMC's terms need reading. Some AMC sites reportedly sit behind bot protection (not tested). | **Recommended, as a narrow pilot** (below) |
| 2 | **AMFI-hosted disclosures** | Same files, hosted by AMFI. The page path is unclear: a Nippon India document points to `amfiindia.com/investor-corner/online-center/portfoliodisclosure`, which returned 404 on 2026-11-24; secondary sources give a Research & Information path. | AMFI's [terms of use](https://www.amfiindia.com/terms-of-use) allow personal, non-commercial use only, forbid storing a significant portion of the site, derivative works and republishing, and make no exception for NAV or portfolio data. They do not mention bots. | **Not without AMFI's written permission** |
| 3 | **fund-disclosures** (open-source, MIT code, [GitHub](https://github.com/subscriptionmanager26-png/fund-disclosures)) | Fetches AMC Excel packs, parses holdings, maps them to AMFI scheme codes (about 2,386 of 2,387 disclosure rows mapped at its last QC), serves JSON at `fund-holdings-browser.vercel.app/api/amfi/{code}` with `as_of`, market value in ₹ lakh. | Code is MIT. The API has no stated terms, rate limit or uptime, and is a small hobby project (7 stars, 129 commits). The data underneath is the AMC disclosures, so row 1's terms still apply. | **Useful as a reference and for a throw-away spike, not as a dependency** |
| 4 | **mfdata.in** | Search results describe an open-source REST API with holdings per fund family and a history endpoint, MIT-licensed. | **Not verified:** the site returned HTTP 522 on two attempts, so its terms, limits and sources were not read. | Re-check before any use |
| 5 | **mfapi.in** (already used for NAV) | NAV history only. No holdings. | n/a | Not a holdings source |
| 6 | Paid vendors (Morningstar, Value Research and similar) | Full holdings | Paid | Ruled out by 0011/0016 |
| 7 | Brokers' and aggregators' own APIs | Holdings shown in their apps | Unofficial endpoints, ToS against scraping | Ruled out |

## Storage estimate (Neon)

Not measured: this needs production credentials, which an agent does not have. The maintainer can run
`select pg_size_pretty(pg_database_size(current_database()));` against the production database.
Neon's free plan allows [1 GB of Postgres storage per project](https://neon.com/docs/introduction/plans); a write that grows storage fails once it is full.

Estimate, with the assumptions stated: about 2,400 disclosed schemes (the fund-disclosures mapping baseline), roughly 60 holdings each on average,
so about 145,000 rows a month. A narrow row (scheme id, ISIN, weight, quantity, value, as-of date) with its index is roughly 150 bytes, so:

| Scope | Rows per month | About |
|---|---|---|
| All disclosed schemes, latest month only | 145,000 | 20 MB |
| All schemes, 12 months | 1.7 million | 250 MB |
| Equity Direct-Growth schemes only (the set 0067 already keeps history for), latest month | ~40,000 | 6 MB |
| The same, 12 months | ~480,000 | 70 MB |

Equity-only, latest month plus a short history fits comfortably; all schemes with a year of history would use a quarter of the free limit before counting what
is already stored. These are estimates, not measurements.

## Decision (proposed)

1. **Recommend AMC-direct (row 1), as a pilot, and only after the maintainer approves.** Scope: the ten or so largest AMCs, equity schemes in the
   Direct-Growth set, monthly, storing only `(scheme, ISIN, weight, quantity, value, as_of)` with `source` and `as_of` on every row, like `mf_factsheet`.
   One small parser per AMC behind a common row shape, run by a GitHub Actions job that posts to a token-guarded ingest route, as `refresh-funds`
   already does. An AMC whose site is behind a bot check is skipped, not worked around.
2. **Before any code:** read each pilot AMC's terms and record them in `docs/data-sources.md`; ask AMFI for written permission if AMFI-hosted files are wanted;
   measure the current Neon size.
3. **Do not depend on** the fund-disclosures API or mfdata.in. If a spike is wanted, fund-disclosures can be used to see the row shape and to
   cross-check our parsers, with the AMC terms question settled first.
4. **Overlap itself** (matching fund ISINs to the user's holdings and the screener's companies) is a separate issue once holdings exist; it needs the ISIN-to-symbol
   mapping the stock side already has.

## Related observation

[0067](./0067-mutual-funds-data-sourcing.md) ingests AMFI's `NAVAll.txt`. AMFI's terms of use (above) have no carve-out for NAV data and limit reuse to personal,
non-commercial use. 0067 treats the file as an official daily publication and that decision stands; this note only records that the same terms apply to it, and that a written
permission from AMFI would cover both the NAV file and any later holdings use.

## Not verified

- The current SEBI master circular (only the 2012 circular and scheme documents were read); whether fortnightly disclosure applies to which categories.
- How each AMC's site behaves from GitHub Actions (bot protection), and each AMC's terms other than the one page read.
- Real file sizes, row counts per scheme, and how many layouts the parsers would need: no workbook was downloaded.
- mfdata.in (unreachable) and the fund-disclosures API's reliability.
- The production Neon size.

## Consequences

- No code, schema or route changes. `docs/data-sources.md` gains a "candidates, not ingested" entry.
- If approved, the next step is an issue for the pilot with the terms check as its first task.
