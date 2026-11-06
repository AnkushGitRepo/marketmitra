"""The full NSE-listed-equity list (main board + SME), for search and as the
screener's universe — not the per-company fallback chain (ADR 0011), just a
lookup table so the Markets page can search "all the stocks the Indian market
has," not just whatever companies have already been queried once.

Source: NSE's own published CSVs at `archives.nseindia.com`
(EQUITY_L.csv, SME_EQUITY_L.csv). Unlike `www.nseindia.com` (blocked by
Akamai in this project's dev environment — see tier1_nse_bse.py), the
`archives.` subdomain was reachable during development, but it can still
403 a datacenter IP, so a copy of both files ships in `app/data/` as the
fallback. This is still NSE's own unofficial-access surface, not a
documented public API — same accepted trade-off as the rest of Tier 1
(ADR 0011).
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

import httpx

logger = logging.getLogger("fundamentals.company_master")

EQUITY_LIST_URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
SME_LIST_URL = "https://archives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv"

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _parse_date(raw: str) -> date | None:
    try:
        return datetime.strptime(raw.strip().title(), "%d-%b-%Y").date()
    except ValueError:
        return None


def _parse_decimal(raw: str) -> Decimal | None:
    try:
        return Decimal(raw.strip())
    except (InvalidOperation, AttributeError):
        return None


def parse_equity_csv(text: str, *, is_sme: bool) -> list[dict]:
    """Parses one NSE listing CSV. NSE's headers carry stray leading spaces
    (` SERIES`) and the file ends with a `**This file is updated…` footer, so
    keys are stripped and rows without a symbol+name are skipped."""
    reader = csv.DictReader(io.StringIO(text))
    companies: list[dict] = []
    seen: set[str] = set()
    for raw in reader:
        row = {(k or "").strip(): (v or "").strip() for k, v in raw.items()}
        symbol = row.get("SYMBOL", "").upper()
        name = row.get("NAME OF COMPANY", "")
        if not symbol or not name or symbol.startswith("*") or symbol in seen:
            continue
        seen.add(symbol)
        companies.append(
            {
                "symbol": symbol,
                "name": name,
                "isin": row.get("ISIN NUMBER") or None,
                "series": row.get("SERIES") or None,
                "listing_date": _parse_date(row.get("DATE OF LISTING", "")),
                "face_value": _parse_decimal(row.get("FACE VALUE", "")),
                "is_sme": is_sme,
            }
        )
    return companies


async def _fetch_text(url: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=20.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.text
    except httpx.HTTPError as exc:
        logger.warning("failed to fetch %s: %s", url, exc)
        return None


def _bundled_text(filename: str) -> str | None:
    path = _DATA_DIR / filename
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        logger.warning("bundled %s is missing", filename)
        return None


async def fetch_equity_list() -> list[dict]:
    """Every NSE-listed equity (main board + SME), freshest source first:
    NSE's published file, falling back to the copy bundled in app/data/.
    Returns [] only if both sources fail."""
    companies: list[dict] = []
    for url, filename, is_sme in (
        (EQUITY_LIST_URL, "EQUITY_L.csv", False),
        (SME_LIST_URL, "SME_EQUITY_L.csv", True),
    ):
        live = await _fetch_text(url)
        parsed = parse_equity_csv(live, is_sme=is_sme) if live else []
        if not parsed:
            # Live fetch failed, was blocked, or returned a non-CSV page.
            logger.warning("%s: live copy unusable, using bundled copy", filename)
            bundled = _bundled_text(filename)
            parsed = parse_equity_csv(bundled, is_sme=is_sme) if bundled else []
        if not parsed:
            logger.warning("%s parsed to zero rows — format may have changed", filename)
        companies.extend(parsed)

    # A symbol on both lists keeps its main-board row.
    by_symbol: dict[str, dict] = {}
    for company in companies:
        by_symbol.setdefault(company["symbol"], company)
    return list(by_symbol.values())
