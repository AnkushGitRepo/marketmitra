#!/usr/bin/env python3
"""Out-of-band mutual fund refresh (ADR 0067).

Stages (run any subset; default is `schemes metrics`):
  schemes    download AMFI NAVAll.txt, parse it, POST the scheme master + latest NAV
  backfill   fetch full NAV history from mfapi.in for Direct-Growth schemes that
             have little history yet, POST it (resumable: re-run to continue)
  metrics    ask the service to recompute returns/risk for every Direct-Growth scheme
  factsheet  POST disclosed facts (expense ratio, AUM, ...) from --factsheet-file

Env:
  FUNDAMENTALS_API_URL   base URL of the deployed service (required unless --dry-run)
  MF_INGEST_TOKEN        shared secret for /funds/ingest/* (required unless --dry-run)

Usage:
  python scripts/refresh_funds.py                       # schemes + metrics (daily)
  python scripts/refresh_funds.py backfill --limit 200  # one backfill slice
  python scripts/refresh_funds.py schemes --dry-run     # download + parse only
  python scripts/refresh_funds.py factsheet --factsheet-file ter.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import asdict
from pathlib import Path

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingestion import mf_amfi, mf_mfapi

BATCH_SCHEMES = 1000
_FIELD_LIMITS = {"name": 300, "base_name": 300, "fund_house": 160, "sub_category": 96}
BATCH_METRICS = 100
MFAPI_PAUSE_S = 0.4  # be polite to a free community service
STAGES = ("schemes", "backfill", "metrics", "factsheet")


def _client() -> tuple[httpx.AsyncClient, str]:
    base = os.environ["FUNDAMENTALS_API_URL"].rstrip("/")
    headers = {"Authorization": f"Bearer {os.environ['MF_INGEST_TOKEN']}"}
    return httpx.AsyncClient(base_url=base, headers=headers, timeout=280), base


def _json_row(row: mf_amfi.SchemeRow) -> dict:
    data = asdict(row)
    for field, limit in _FIELD_LIMITS.items():  # the API rejects a whole batch for one long value
        data[field] = data[field][:limit] if data[field] else data[field]
    data["latest_nav"] = float(row.nav) if row.nav is not None else None
    data["latest_nav_date"] = row.nav_date.isoformat() if row.nav_date else None
    del data["nav"], data["nav_date"]
    return data


async def stage_schemes(api: httpx.AsyncClient | None) -> None:
    rows = mf_amfi.parse_navall(await mf_amfi.fetch_navall())
    print(f"parsed {len(rows)} schemes", flush=True)
    if not rows:
        raise SystemExit("no schemes parsed — aborting (AMFI format may have changed)")
    if api is None:
        for r in rows[:5]:
            print(f"  {r.scheme_code} {r.category}/{r.sub_category} {r.plan}/{r.option} {r.name[:50]}")
        return
    as_of = max((r.nav_date for r in rows if r.nav_date), default=None)
    for i in range(0, len(rows), BATCH_SCHEMES):
        chunk = [_json_row(r) for r in rows[i : i + BATCH_SCHEMES]]
        body = {"rows": chunk, "as_of": as_of.isoformat() if as_of else None}
        resp = await api.post("/funds/ingest/schemes", json=body)
        resp.raise_for_status()
        print(f"  schemes {i + len(chunk)}/{len(rows)}: {resp.json()}", flush=True)


async def stage_backfill(api: httpx.AsyncClient, limit: int) -> None:
    resp = await api.get("/funds/ingest/backfill-queue", params={"limit": limit})
    resp.raise_for_status()
    codes: list[int] = resp.json()["scheme_codes"]
    print(f"backfilling {len(codes)} schemes", flush=True)
    async with mf_mfapi.make_client() as src:
        for n, code in enumerate(codes, 1):
            points = await mf_mfapi.fetch_history(code, src)
            if points is not None:  # None = fetch failed: leave it queued for the next run
                body = {"scheme_code": code, "points": [[d.isoformat(), v] for d, v in points]}
                out = await api.post("/funds/ingest/nav", json=body)
                out.raise_for_status()
            if n % 25 == 0:
                print(f"  {n}/{len(codes)}", flush=True)
            await asyncio.sleep(MFAPI_PAUSE_S)
    for i in range(0, len(codes), BATCH_METRICS):
        out = await api.post("/funds/ingest/metrics", json={"scheme_codes": codes[i : i + BATCH_METRICS]})
        out.raise_for_status()


async def stage_metrics(api: httpx.AsyncClient) -> None:
    after, total = 0, 0
    while True:
        resp = await api.get("/funds/ingest/metrics-queue", params={"after": after, "limit": BATCH_METRICS})
        resp.raise_for_status()
        codes: list[int] = resp.json()["scheme_codes"]
        if not codes:
            break
        out = await api.post("/funds/ingest/metrics", json={"scheme_codes": codes})
        out.raise_for_status()
        total += out.json()["computed"]
        after = codes[-1]
        print(f"  metrics through {after}: {total} computed", flush=True)


async def stage_factsheet(api: httpx.AsyncClient, path: Path) -> None:
    rows = json.loads(path.read_text(encoding="utf-8"))
    for i in range(0, len(rows), BATCH_SCHEMES):
        resp = await api.post("/funds/ingest/factsheet", json={"rows": rows[i : i + BATCH_SCHEMES]})
        resp.raise_for_status()
        print(f"  factsheet {i + BATCH_SCHEMES}: {resp.json()}", flush=True)


async def run(args: argparse.Namespace) -> int:
    stages = args.stages or ["schemes", "metrics"]
    if args.dry_run:
        await stage_schemes(None)
        return 0
    api, _ = _client()
    async with api:
        for stage in stages:
            print(f"== {stage}", flush=True)
            if stage == "schemes":
                await stage_schemes(api)
            elif stage == "backfill":
                await stage_backfill(api, args.limit)
            elif stage == "metrics":
                await stage_metrics(api)
            elif stage == "factsheet":
                if not args.factsheet_file:
                    raise SystemExit("factsheet stage needs --factsheet-file")
                await stage_factsheet(api, args.factsheet_file)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("stages", nargs="*", choices=STAGES, help="stages to run")
    parser.add_argument("--limit", type=int, default=200, help="backfill: schemes per run")
    parser.add_argument("--factsheet-file", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="download + parse only, no POST")
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
