#!/usr/bin/env python3
"""Out-of-band IPO refresh (ADR 0017).

The InvestorGain "Live IPO GMP" report is a client-rendered SPA, so a plain
HTTP GET can't see the table and the serverless `fundamentals-api` function
can't bundle a headless browser (ADR 0013). This script — meant to run from
CI (see `.github/workflows/refresh-ipos.yml`) — renders the page with
Playwright Chromium, parses it with the same `_parse_ipo_rows` the tests
use, and POSTs the rows to `POST /ipos/ingest`.

Env:
  FUNDAMENTALS_API_URL   base URL of the deployed service (required unless --dry-run)
  IPO_INGEST_TOKEN       shared secret for /ipos/ingest (required unless --dry-run)

Usage:
  python scripts/refresh_ipos.py            # render, parse, POST
  python scripts/refresh_ipos.py --dry-run  # render + parse + print, no POST
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingestion.tier3_ipo_scraper.scraper import REPORT_URL, _parse_ipo_rows
from app.ingestion.tier3_ipo_scraper.subscription import parse_subscription, subscription_url

# Category-wise subscription (#285) is one page per IPO. Only issues that have been open have bids to show, and a listed issue's page
# no longer changes, so open and closed ones only. Paced, capped, and a page that fails is skipped, never fatal.
_SUBSCRIPTION_STATUSES = frozenset({"open", "closed"})
_MAX_SUBSCRIPTION_PAGES = 15
_PAGE_PAUSE_SECONDS = 2.0
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def render_html(url: str) -> str:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
        )
        page.goto(url, wait_until="networkidle", timeout=60_000)
        page.wait_for_selector("td[data-label='Name']", timeout=30_000)
        html = page.content()
        browser.close()
        return html


def add_category_subscription(rows: list[dict]) -> list[dict]:
    """Rows with the category-wise subscription merged in where its page could be read. A row whose page fails or has no table is
    returned unchanged, so the previously stored figures stay."""
    targets = [
        (i, url)
        for i, r in enumerate(rows)
        if r.get("status") in _SUBSCRIPTION_STATUSES and (url := subscription_url(r.get("source_url")))
    ][:_MAX_SUBSCRIPTION_PAGES]
    if not targets:
        return rows

    from playwright.sync_api import sync_playwright

    merged = list(rows)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(user_agent=_USER_AGENT)
        for n, (i, url) in enumerate(targets):
            if n:
                time.sleep(_PAGE_PAUSE_SECONDS)
            try:
                page.goto(url, wait_until="networkidle", timeout=60_000)
                page.wait_for_selector("table.bid-table", timeout=15_000)
                sub = parse_subscription(page.content())
            except Exception as exc:  # noqa: BLE001 - one bad page must not stop the refresh
                print(f"  subscription skipped for {rows[i]['slug']}: {type(exc).__name__}", file=sys.stderr, flush=True)
                continue
            if sub:
                merged[i] = {**rows[i], **sub}
        browser.close()
    return merged


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="parse + print, don't POST")
    args = parser.parse_args()

    print(f"rendering {REPORT_URL} …", flush=True)
    html = render_html(REPORT_URL)
    rows = _parse_ipo_rows(html)
    print(f"parsed {len(rows)} IPO rows", flush=True)
    if not rows:
        print("no rows — aborting (nothing to ingest)", file=sys.stderr)
        return 1

    rows = add_category_subscription(rows)
    with_cats = sum(1 for r in rows if r.get("sub_retail") is not None)
    print(f"category-wise subscription read for {with_cats} IPOs", flush=True)

    payload = {"rows": json.loads(json.dumps(rows, default=str))}

    if args.dry_run:
        for r in rows:
            print(f"  {r['name'][:30]:30} {r['status']:9} GMP={r['gmp']} retail={r.get('sub_retail')} sNII={r.get('sub_snii')} bNII={r.get('sub_bnii')}")
        return 0

    base = os.environ["FUNDAMENTALS_API_URL"].rstrip("/")
    token = os.environ["IPO_INGEST_TOKEN"]
    resp = httpx.post(
        f"{base}/ipos/ingest",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    resp.raise_for_status()
    print(f"ingest ok: {resp.json()}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
