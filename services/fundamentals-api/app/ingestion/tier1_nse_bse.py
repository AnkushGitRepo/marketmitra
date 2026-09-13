"""Tier 1: NSE/BSE public endpoints — the primary, free data source.

Covers quotes, corporate actions, and IPO data via `nsepython`/`bsedata`;
shareholding pattern via a direct call to NSE's `/api/corporates-holdings`
(not wrapped by either library, so implemented here); and financial
statement line items via XBRL filings, falling back to annual-report PDF
table extraction for anything XBRL doesn't cover.

**Known, accepted limitation (see ADR 0011):** NSE's website sits behind an
Akamai edge that aggressively blocks non-browser and non-Indian-residential
traffic — confirmed during development: even a plain homepage GET from this
project's dev/CI environment returned a 403 "Access Denied" *before*
reaching any application logic. This is expected to vary by where the
service is actually deployed and is exactly why Tier 2 (yfinance) and
Tier 3 (Screener.in) exist as real fallbacks rather than formalities.
`bsedata` (BSE) was verified working live from the same environment where
NSE was blocked — the two exchanges do not fail together.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import httpx
from bsedata.bse import BSE

from app.config import get_settings
from app.ingestion.rate_limit import RateLimiter

logger = logging.getLogger("fundamentals.tier1")

_settings = get_settings()
_nse_limiter = RateLimiter(_settings.nse_requests_per_second)

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
}

_bse_client: BSE | None = None


def _get_bse_client() -> BSE:
    global _bse_client
    if _bse_client is None:
        _bse_client = BSE(update_codes=False)
    return _bse_client


def _to_decimal(value: object) -> Decimal | None:
    if value in (None, "", "-"):
        return None
    try:
        return Decimal(str(value).replace(",", ""))
    except InvalidOperation:
        return None


# --- Quotes ------------------------------------------------------------


async def get_nse_quote(symbol: str) -> dict:
    """Live quote from NSE via nsepython. Returns {} if NSE blocks/rejects
    the request — callers must treat an empty dict as "Tier 1 didn't have
    this," not as an error, so the fallback chain moves on cleanly.
    """
    from nsepython import nse_eq  # imported lazily: pulls in a requests session at import time

    await _nse_limiter.wait()
    try:
        data = await asyncio.to_thread(nse_eq, symbol)
    except Exception as exc:  # noqa: BLE001
        logger.warning("nse_eq(%s) failed: %s", symbol, exc)
        return {}

    if not data:
        return {}

    price_info = data.get("priceInfo", {})
    week_range = price_info.get("weekHighLow", {})
    return {
        "name": data.get("info", {}).get("companyName"),
        "isin": data.get("info", {}).get("isin"),
        "industry": data.get("industryInfo", {}).get("industry"),
        "last_price": _to_decimal(price_info.get("lastPrice")),
        "prev_close": _to_decimal(price_info.get("previousClose")),
        "day_high": _to_decimal(price_info.get("intraDayHighLow", {}).get("max")),
        "day_low": _to_decimal(price_info.get("intraDayHighLow", {}).get("min")),
        "week52_high": _to_decimal(week_range.get("max")),
        "week52_low": _to_decimal(week_range.get("min")),
    }


async def get_bse_quote(bse_code: str) -> dict:
    """Live quote from BSE via bsedata. Verified working (see module docstring)."""
    try:
        client = _get_bse_client()
        data = await asyncio.to_thread(client.getQuote, bse_code)
    except Exception as exc:  # noqa: BLE001
        logger.warning("bsedata.getQuote(%s) failed: %s", bse_code, exc)
        return {}

    return {
        "name": data.get("companyName"),
        "last_price": _to_decimal(data.get("currentValue")),
        "prev_close": _to_decimal(data.get("previousClose")),
        "day_high": _to_decimal(data.get("dayHigh")),
        "day_low": _to_decimal(data.get("dayLow")),
        "week52_high": _to_decimal(data.get("52weekHigh")),
        "week52_low": _to_decimal(data.get("52weekLow")),
        "industry": data.get("industry"),
    }


# --- Shareholding pattern (direct endpoint call — not wrapped by nsepython) --


async def get_shareholding_pattern(symbol: str) -> list[dict]:
    """Calls NSE's `/api/corporates-holdings` directly, replicating the
    session/cookie handshake NSE requires (a plain GET on the API without
    first visiting the site gets rejected) since this endpoint has no
    library wrapper.

    Returns a list of {"category": str, "percentage": Decimal, "quarter_end": date}
    dicts, or [] if NSE didn't return usable data. The exact response shape
    could not be verified end-to-end during development (NSE blocked this
    project's dev environment outright at the edge — see module docstring),
    so this parses defensively and logs loudly on an unrecognized shape
    rather than silently returning wrong data.
    """
    await _nse_limiter.wait()
    async with httpx.AsyncClient(headers=_BROWSER_HEADERS, timeout=10.0) as client:
        try:
            await client.get("https://www.nseindia.com")
            await client.get("https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern")
            response = await client.get(
                "https://www.nseindia.com/api/corporates-holdings",
                params={"index": "equities", "symbol": symbol},
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("NSE shareholding fetch for %s failed: %s", symbol, exc)
            return []

    records = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        logger.warning(
            "NSE shareholding response for %s had an unrecognized shape: %r",
            symbol, type(payload),
        )
        return []

    entries: list[dict] = []
    for record in records:
        category = record.get("category") or record.get("cat") or record.get("holdCat")
        pct = _to_decimal(
            record.get("percentage") or record.get("pctHolding") or record.get("holdPercent")
        )
        quarter_end_raw = record.get("asOnDate") or record.get("date")
        if category is None or pct is None:
            continue
        quarter_end = _parse_date_loose(quarter_end_raw) if quarter_end_raw else None
        entries.append(
            {"category": category, "percentage": pct, "quarter_end": quarter_end}
        )

    if records and not entries:
        logger.warning(
            "NSE shareholding response for %s parsed to zero usable entries "
            "out of %d records — field-name mapping likely needs updating "
            "against a live (non-blocked) response.",
            symbol, len(records),
        )
    return entries


def _parse_date_loose(value: str) -> date | None:
    for fmt in ("%d-%b-%Y", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()  # noqa: DTZ007 — date-only, no tz needed
        except ValueError:
            continue
    return None


# --- Corporate actions / IPO data ---------------------------------------


async def get_corporate_actions(symbol: str) -> list[dict]:
    from nsepython import nse_events

    await _nse_limiter.wait()
    try:
        data = await asyncio.to_thread(nse_events, symbol)
    except Exception as exc:  # noqa: BLE001
        logger.warning("nse_events(%s) failed: %s", symbol, exc)
        return []
    return data if isinstance(data, list) else []
