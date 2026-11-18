"""NAV history from mfapi.in (ADR 0067) — a free community mirror of AMFI data.

Used only to backfill history; the daily NAV comes from AMFI itself. The
response lists newest-first, ``{"date": "17-11-2026", "nav": "107.361"}``.
"""

from __future__ import annotations

import logging
from datetime import date, datetime

import httpx

logger = logging.getLogger("fundamentals.mf_mfapi")

MFAPI_URL = "https://api.mfapi.in/mf/{code}"
_USER_AGENT = "MarketMitra/2 (+https://github.com/AnkushGitRepo/marketmitra)"


def parse_history(payload: object) -> list[tuple[date, float]]:
    """mfapi JSON -> ascending ``(date, nav)`` points. Bad points are dropped."""
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return []
    points: dict[date, float] = {}
    for item in data:
        try:
            when = datetime.strptime(f"{item['date']} +0000", "%d-%m-%Y %z").date()
            nav = float(item["nav"])
        except (KeyError, TypeError, ValueError):
            continue
        if nav > 0:
            points[when] = nav
    return sorted(points.items())


async def fetch_history(code: int, client: httpx.AsyncClient) -> list[tuple[date, float]] | None:
    """One scheme's history; [] if the source has none, None if the fetch failed (logged)."""
    try:
        response = await client.get(MFAPI_URL.format(code=code), timeout=30)
        response.raise_for_status()
        return parse_history(response.json())
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("mfapi history for %s failed: %s", code, exc)
        return None


def make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(headers={"User-Agent": _USER_AGENT}, follow_redirects=True)
