#!/usr/bin/env python3
"""Bulk screener-universe refresh (ADR 0025).

Every other table in this service is populated lazily, one company at a
time, only when a user views that company's page. A screener needs
criteria data across most of the ~2,570-company NSE universe to be
useful — this script is the bulk-ingestion pipeline that makes that real,
mirroring refresh_ipos.py's shape: runs out-of-band (see
.github/workflows/refresh-screener.yml), fetches/parses itself, and POSTs
results to a dedicated authenticated ingest endpoint.

Unlike refresh_ipos.py (one client-rendered SPA page via Playwright), this
scrapes ~2,570 individual Screener.in company pages directly with plain
httpx (no headless browser needed — see scraper.py's own docstring for why
Playwright isn't in this dependency chain at all). Rate-limited
deliberately conservatively (2 req/s — more conservative than NSE's own
~3 req/s community etiquette rate, since Screener.in has no stated rate at
all and this is a much larger sustained burst than any single lazy fetch
ever generates): ~2,570 symbols / 2 req/s =~ 21 minutes for a full run.

Per-symbol failures are logged and skipped, never abort the whole run —
this script exits non-zero only if the overall failure rate is
suspiciously high (>20%), which likely means Screener's markup changed or
the run got blocked, and CI should go red rather than silently "succeed"
partially.

Env:
  FUNDAMENTALS_API_URL     base URL of the deployed service (required unless --dry-run)
  SCREENER_INGEST_TOKEN    shared secret for /screener/ingest (required unless --dry-run)

Usage:
  python scripts/refresh_screener_universe.py                # full run, POST results
  python scripts/refresh_screener_universe.py --dry-run       # fetch+parse+print, no POST
  python scripts/refresh_screener_universe.py --limit 20      # only the first 20 symbols
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingestion.rate_limit import RateLimiter
from app.ingestion.tier3_screener_scrapling.scraper import fetch_screener_snapshot

_REQUESTS_PER_SECOND = 2.0
_INGEST_BATCH_SIZE = 100
_FAILURE_RATE_THRESHOLD = 0.20


async def _fetch_universe(base_url: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(f"{base_url}/companies/master")
        response.raise_for_status()
        return response.json()


async def _ingest_batch(base_url: str, token: str, rows: list[dict]) -> None:
    # fetch_screener_snapshot's values are Decimal (from _parse_number) —
    # not JSON-serializable directly, same issue refresh_ipos.py already
    # solves the same way: stringify via default=str, then re-parse so
    # httpx's own json= encoding never sees a raw Decimal.
    payload = {"rows": json.loads(json.dumps(rows, default=str))}
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{base_url}/screener/ingest",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()


async def run(limit: int | None, dry_run: bool) -> int:
    base_url = os.environ.get("FUNDAMENTALS_API_URL", "").rstrip("/")
    token = os.environ.get("SCREENER_INGEST_TOKEN", "")
    if not dry_run and (not base_url or not token):
        print("FUNDAMENTALS_API_URL and SCREENER_INGEST_TOKEN are required unless --dry-run", file=sys.stderr)
        return 1
    if dry_run and not base_url:
        base_url = "http://localhost:8420"

    print(f"fetching universe from {base_url}/companies/master ...", flush=True)
    universe = await _fetch_universe(base_url)
    if limit:
        universe = universe[:limit]
    print(f"{len(universe)} symbols to refresh", flush=True)

    limiter = RateLimiter(_REQUESTS_PER_SECOND)
    attempted = 0
    succeeded = 0
    failed = 0
    batch: list[dict] = []

    async def flush_batch() -> None:
        if not batch:
            return
        if dry_run:
            for row in batch:
                print(f"  {row['symbol']:15} {row['name'][:35]:35} PE={row.get('pe')} ROE={row.get('roe')}")
        else:
            await _ingest_batch(base_url, token, batch)
        batch.clear()

    for company in universe:
        symbol, name = company["symbol"], company["name"]
        attempted += 1
        await limiter.wait()
        try:
            snapshot = await fetch_screener_snapshot(symbol)
        except Exception as exc:  # noqa: BLE001 — one bad symbol must never abort the run
            print(f"  {symbol}: unexpected error, skipping ({exc})", file=sys.stderr)
            failed += 1
            continue

        if snapshot is None:
            print(f"  {symbol}: page fetch failed, skipping", file=sys.stderr)
            failed += 1
            continue

        succeeded += 1
        batch.append({"symbol": symbol, "name": name, **snapshot})
        if len(batch) >= _INGEST_BATCH_SIZE:
            await flush_batch()

    await flush_batch()

    print(f"done: attempted={attempted} succeeded={succeeded} failed={failed}", flush=True)
    if attempted and failed / attempted > _FAILURE_RATE_THRESHOLD:
        print(
            f"failure rate {failed / attempted:.0%} exceeds {_FAILURE_RATE_THRESHOLD:.0%} — "
            "Screener's markup may have changed or this run got blocked",
            file=sys.stderr,
        )
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="fetch+parse+print, don't POST")
    parser.add_argument("--limit", type=int, default=None, help="only refresh the first N symbols")
    args = parser.parse_args()
    return asyncio.run(run(args.limit, args.dry_run))


if __name__ == "__main__":
    raise SystemExit(main())
