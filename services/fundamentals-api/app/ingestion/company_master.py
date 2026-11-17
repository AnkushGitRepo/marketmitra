"""The full NSE-listed-equity list (main board + SME), for search and as the
screener's universe — not the per-company fallback chain (ADR 0011), just a
lookup table so the Markets page can search "all the stocks the Indian market
has," not just whatever companies have already been queried once.

Source: NSE's own published CSVs at `archives.nseindia.com`
(EQUITY_L.csv, SME_EQUITY_L.csv). Unlike `www.nseindia.com` (blocked by
Akamai in this project's dev environment — see tier1_nse_bse.py), the
`archives.` subdomain was reachable during development, but it can still
403 a datacenter IP, so a copy ships in `app/data/` as the fallback: the main
board's EQUITY_L.csv, and for SME `SME_SYMBOLS.csv` (symbol and series only,
from NSE's SME Market Watch download — it has no company names, so an SME row
starts with its symbol as a placeholder name and the daily quote feed fills in
the real one; ADR 0066). This is still NSE's own unofficial-access surface, not a
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


def parse_symbol_list(text: str, *, is_sme: bool) -> list[dict]:
    """Parses the bundled `SYMBOL,SERIES` list. It carries no names, so the symbol
    stands in as a placeholder name (see `is_placeholder_name`)."""
    companies: list[dict] = []
    seen: set[str] = set()
    for raw in csv.DictReader(io.StringIO(text)):
        row = {(k or "").strip(): (v or "").strip() for k, v in raw.items()}
        symbol = row.get("SYMBOL", "").upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        companies.append(
            {
                "symbol": symbol,
                "name": symbol,
                "isin": None,
                "series": row.get("SERIES") or None,
                "listing_date": None,
                "face_value": None,
                "is_sme": is_sme,
            }
        )
    return companies


def is_placeholder_name(symbol: str, name: str) -> bool:
    """A name equal to the symbol means "not known yet", never a real company name."""
    return name.strip().upper() == symbol.strip().upper()


def better_name(symbol: str, current: str, candidate: str | None) -> str | None:
    """The real company name to store, or None to leave the row alone: only a
    placeholder gets replaced, and only by a name that is not itself the symbol."""
    new = (candidate or "").strip()
    if not new or is_placeholder_name(symbol, new) or not is_placeholder_name(symbol, current):
        return None
    return new[:256]


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


async def fetch_sme_list(*, live: bool = True) -> list[dict]:
    """Every NSE SME-platform company: NSE's published file when it parses,
    otherwise the bundled symbol list (`live=False` skips the network entirely,
    for callers that must not wait on NSE). Only [] if both fail."""
    text = await _fetch_text(SME_LIST_URL) if live else None
    parsed = parse_equity_csv(text, is_sme=True) if text else []
    if parsed:
        return parsed
    if live:
        logger.warning("SME_EQUITY_L.csv: live copy unusable, using the bundled symbol list")
    bundled = _bundled_text("SME_SYMBOLS.csv")
    parsed = parse_symbol_list(bundled, is_sme=True) if bundled else []
    if not parsed:
        logger.warning("the SME list parsed to zero rows — format may have changed")
    return parsed


async def fetch_equity_list() -> list[dict]:
    """Every NSE-listed equity (main board + SME), freshest source first:
    NSE's published file, falling back to the copy bundled in app/data/.
    Returns [] only if both sources fail."""
    live = await _fetch_text(EQUITY_LIST_URL)
    main = parse_equity_csv(live, is_sme=False) if live else []
    if not main:
        # Live fetch failed, was blocked, or returned a non-CSV page.
        logger.warning("EQUITY_L.csv: live copy unusable, using bundled copy")
        bundled = _bundled_text("EQUITY_L.csv")
        main = parse_equity_csv(bundled, is_sme=False) if bundled else []
    if not main:
        logger.warning("EQUITY_L.csv parsed to zero rows — format may have changed")

    # A symbol on both lists keeps its main-board row.
    by_symbol: dict[str, dict] = {}
    for company in [*main, *await fetch_sme_list()]:
        by_symbol.setdefault(company["symbol"], company)
    return list(by_symbol.values())
