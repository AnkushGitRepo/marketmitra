#!/usr/bin/env python3
"""Out-of-band mutual fund refresh (ADR 0067).

Stages (run any subset; default is `schemes metrics ter`):
  schemes    download AMFI NAVAll.txt, parse it, POST the scheme master + latest NAV
  backfill   fetch full NAV history from mfapi.in for ONE slice (--limit) of Direct-Growth
             schemes that have none yet, POST it (resumable: re-run to continue)
  seed       everything needed to fill a fresh install, in one resumable command:
             schemes, ter, then backfill slice after slice until none are left, then metrics.
             --category Equity does the most useful funds first; --max-minutes N stops cleanly
             between slices (re-run to continue). A scheme whose fetch fails is skipped for
             this run and retried next time.
  metrics    ask the service to recompute returns/risk for every Direct-Growth scheme
  ter        download the community TER tracker CSV (AMFI expense ratios, MIT), POST it;
             the service matches rows to schemes by name and stores the expense ratio
  factsheet  POST disclosed facts (expense ratio, AUM, ...) from --factsheet-file

Env:
  FUNDAMENTALS_API_URL   base URL of the service to fill (required unless --dry-run). For a local
                         install this is your own service, e.g. http://localhost:8420, never the
                         hosted one.
  MF_INGEST_TOKEN        shared secret for /funds/ingest/* (required unless --dry-run); locally any
                         throwaway string, set to the same value in services/fundamentals-api/.env

Usage:
  python scripts/refresh_funds.py                       # schemes + metrics + ter (daily)
  python scripts/refresh_funds.py seed --category Equity   # fill a fresh local install (Equity first)
  python scripts/refresh_funds.py seed --max-minutes 30    # ...for at most 30 minutes, then continue later
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

from app.ingestion import mf_amfi, mf_mfapi, mf_seed, mf_ter

BATCH_SCHEMES = 1000
_FIELD_LIMITS = {"name": 300, "base_name": 300, "fund_house": 160, "sub_category": 96}
BATCH_METRICS = 100
MFAPI_PAUSE_S = 0.4  # be polite to a free community service
STAGES = ("schemes", "backfill", "seed", "metrics", "ter", "factsheet")
SEED_SLICE = 100  # schemes per queue slice during `seed`


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


async def backfill_slice(api: httpx.AsyncClient, src: httpx.AsyncClient, codes: list[int]) -> int:
    """Fetch and post NAV history for `codes`, then recompute their metrics. Returns how many were fetched.

    A scheme whose fetch fails (None) is not posted, so it stays queued for the next run.
    """
    fetched: list[int] = []
    for n, code in enumerate(codes, 1):
        points = await mf_mfapi.fetch_history(code, src)
        if points is not None:
            body = {"scheme_code": code, "points": [[d.isoformat(), v] for d, v in points]}
            out = await api.post("/funds/ingest/nav", json=body)
            out.raise_for_status()
            fetched.append(code)
        if n % 25 == 0:
            print(f"  {n}/{len(codes)}", flush=True)
        await asyncio.sleep(MFAPI_PAUSE_S)
    for i in range(0, len(fetched), BATCH_METRICS):
        out = await api.post("/funds/ingest/metrics", json={"scheme_codes": fetched[i : i + BATCH_METRICS]})
        out.raise_for_status()
    return len(fetched)


async def backfill_queue(api: httpx.AsyncClient, limit: int, category: str | None, after: int = 0) -> list[int]:
    params: dict[str, str | int] = {"limit": limit, "after": after}
    if category:
        params["category"] = category
    resp = await api.get("/funds/ingest/backfill-queue", params=params)
    resp.raise_for_status()
    return resp.json()["scheme_codes"]


async def stage_backfill(api: httpx.AsyncClient, limit: int, category: str | None = None) -> None:
    codes = await backfill_queue(api, limit, category)
    print(f"backfilling {len(codes)} schemes", flush=True)
    async with mf_mfapi.make_client() as src:
        await backfill_slice(api, src, codes)


async def stage_seed(api: httpx.AsyncClient, category: str | None, max_minutes: float | None) -> None:
    """Fill a fresh install: scheme master, expense ratios, then every NAV history, then metrics."""
    print("== schemes", flush=True)
    await stage_schemes(api)
    print("== ter", flush=True)
    await stage_ter(api)
    scope = f" ({category})" if category else ""
    print(f"== backfill{scope}: slices of {SEED_SLICE}, until none are left", flush=True)

    async def next_codes(after: int) -> list[int]:
        return await backfill_queue(api, SEED_SLICE, category, after)

    async with mf_mfapi.make_client() as src:
        async def process(codes: list[int]) -> int:
            fetched = await backfill_slice(api, src, codes)
            print(f"  slice of {len(codes)}: {fetched} fetched", flush=True)
            return fetched

        result = await mf_seed.drain(
            next_codes, process, budget_s=max_minutes * 60 if max_minutes else None
        )
    print(f"  backfill: {result}", flush=True)
    print("== metrics", flush=True)
    await stage_metrics(api)
    if result["stopped"] == "budget":
        print("stopped at the time limit: run `seed` again to continue where it left off.", flush=True)
    elif result["failed"]:
        print(f"{result['failed']} scheme(s) could not be fetched this time; run `seed` again to retry them.", flush=True)
    else:
        print("seed complete. Keep it current with: refresh_funds.py   (schemes metrics ter, about a minute).", flush=True)


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


async def stage_ter(api: httpx.AsyncClient | None) -> None:
    async with mf_ter.make_client() as src:
        rows, parse_stats = mf_ter.parse_ter_csv(await mf_ter.fetch_ter_csv(src))
        as_of = await mf_ter.fetch_ter_as_of(src)
    print(f"parsed {parse_stats} (file updated {as_of})", flush=True)
    if not rows:
        raise SystemExit("no TER rows parsed — aborting")
    if api is None:
        return
    body = {
        "rows": [{"name": r.name, "regular": r.regular, "direct": r.direct} for r in rows],
        "as_of": as_of.isoformat(),
    }
    resp = await api.post("/funds/ingest/ter", json=body)
    resp.raise_for_status()
    print(f"  ter: {resp.json()}", flush=True)


async def stage_factsheet(api: httpx.AsyncClient, path: Path) -> None:
    rows = json.loads(path.read_text(encoding="utf-8"))
    for i in range(0, len(rows), BATCH_SCHEMES):
        resp = await api.post("/funds/ingest/factsheet", json={"rows": rows[i : i + BATCH_SCHEMES]})
        resp.raise_for_status()
        print(f"  factsheet {i + BATCH_SCHEMES}: {resp.json()}", flush=True)


async def run(args: argparse.Namespace) -> int:
    stages = args.stages or ["schemes", "metrics", "ter"]
    if args.dry_run:
        await stage_schemes(None)
        await stage_ter(None)
        return 0
    api, base = _client()
    # Say where the data is going: a local seed must never be pointed at the hosted service by accident.
    print(f"target: {base}", flush=True)
    async with api:
        for stage in stages:
            if stage == "seed":
                await stage_seed(api, args.category, args.max_minutes)
                continue
            print(f"== {stage}", flush=True)
            if stage == "schemes":
                await stage_schemes(api)
            elif stage == "backfill":
                await stage_backfill(api, args.limit, args.category)
            elif stage == "metrics":
                await stage_metrics(api)
            elif stage == "ter":
                await stage_ter(api)
            elif stage == "factsheet":
                if not args.factsheet_file:
                    raise SystemExit("factsheet stage needs --factsheet-file")
                await stage_factsheet(api, args.factsheet_file)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("stages", nargs="*", choices=STAGES, help="stages to run")
    parser.add_argument("--limit", type=int, default=200, help="backfill: schemes per run")
    parser.add_argument("--category", help="backfill/seed: only this category (Equity, Debt, Hybrid, Solution Oriented, Other)")
    parser.add_argument("--max-minutes", type=float, help="seed: stop between slices after this long; re-run to continue")
    parser.add_argument("--factsheet-file", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="download + parse only, no POST")
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
