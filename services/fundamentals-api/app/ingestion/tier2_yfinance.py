"""Tier 2: yfinance — fallback for live/historical price data and any
general market-data gaps Tier 1 didn't cover. Verified working live from
this project's dev environment (see tier1_nse_bse.py's docstring for the
contrast with NSE, which was blocked from the same environment).

Only ever called for fields Tier 1 didn't produce — see
app/ingestion/orchestrator.py, which drives that per-field fallback logic.
yfinance itself is a synchronous library with no async API, so calls are
pushed to a thread via asyncio.to_thread rather than blocking the event
loop.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import yfinance as yf

logger = logging.getLogger("fundamentals.tier2")


def _yahoo_symbol(nse_symbol: str | None, bse_code: str | None) -> str | None:
    if nse_symbol:
        return f"{nse_symbol}.NS"
    if bse_code:
        return f"{bse_code}.BO"
    return None


# A history whose last bar is older than this is a dead line, not the live one (ADR 0066).
_LIVE_WITHIN = timedelta(days=14)
# NSE SME shares trade on Yahoo under their series, e.g. ANONDITA-SM.NS; the plain
# ANONDITA.NS is often empty or last traded in 2024.
_SME_SERIES = ("SM", "ST")


def _history_candidates(nse_symbol: str | None, bse_code: str | None) -> list[str]:
    plain = _yahoo_symbol(nse_symbol, bse_code)
    if plain is None:
        return []
    if not nse_symbol:
        return [plain]
    return [plain, *(f"{nse_symbol}-{series}.NS" for series in _SME_SERIES)]


async def _fetch_history(symbol: str, period: str):
    try:
        return await asyncio.to_thread(lambda: yf.Ticker(symbol).history(period=period))
    except Exception as exc:  # noqa: BLE001
        logger.warning("yfinance history(%s) failed: %s", symbol, exc)
        return None


def _is_live(history, today: date) -> bool:
    last = history.index[-1]
    last_day = last.date() if hasattr(last, "date") else last
    return today - last_day <= _LIVE_WITHIN


async def get_price_history(
    nse_symbol: str | None,
    bse_code: str | None,
    period: str = "1y",
    today: date | None = None,
) -> list[dict]:
    """Returns [{"trade_date": date, "open": Decimal, "high": ..., "low": ...,
    "close": ..., "volume": int}, ...] or [] if no Yahoo symbol could be
    resolved or the fetch failed. The plain ticker wins when its history is live;
    otherwise the SME series-suffixed tickers are tried, and if none is live either
    the plain history (if it had any) is returned as it always was."""
    today = today or datetime.now(tz=UTC).date()
    history = None
    fallback = None
    for symbol in _history_candidates(nse_symbol, bse_code):
        candidate = await _fetch_history(symbol, period)
        if candidate is None or candidate.empty:
            continue
        if _is_live(candidate, today):
            history = candidate
            break
        fallback = fallback if fallback is not None else candidate
    history = history if history is not None else fallback
    if history is None:
        return []

    points = []
    for trade_date, row in history.iterrows():
        points.append(
            {
                "trade_date": trade_date.date() if hasattr(trade_date, "date") else trade_date,
                "open": _safe_decimal(row.get("Open")),
                "high": _safe_decimal(row.get("High")),
                "low": _safe_decimal(row.get("Low")),
                "close": _safe_decimal(row.get("Close")),
                "volume": int(row["Volume"]) if row.get("Volume") == row.get("Volume") else None,
            }
        )
    return points


async def get_quote_gap_fill(nse_symbol: str | None, bse_code: str | None) -> dict:
    """General quote-field gap-fill (name/industry/last price) for whatever
    Tier 1 didn't return."""
    symbol = _yahoo_symbol(nse_symbol, bse_code)
    if symbol is None:
        return {}

    try:
        ticker = yf.Ticker(symbol)
        fast_info = await asyncio.to_thread(lambda: dict(ticker.fast_info))
    except Exception as exc:  # noqa: BLE001
        logger.warning("yfinance fast_info(%s) failed: %s", symbol, exc)
        fast_info = {}

    try:
        # .info is a much heavier call than fast_info (fetches the full quote
        # summary) — only worth it here because this whole function only runs
        # as a fallback, not on the hot path.
        info = await asyncio.to_thread(lambda: dict(ticker.info))
    except Exception as exc:  # noqa: BLE001
        logger.warning("yfinance info(%s) failed: %s", symbol, exc)
        info = {}

    return {
        "name": info.get("longName") or info.get("shortName"),
        "industry": info.get("industry"),
        "sector": info.get("sector"),
        "last_price": _safe_decimal(fast_info.get("lastPrice")),
        "day_high": _safe_decimal(fast_info.get("dayHigh")),
        "day_low": _safe_decimal(fast_info.get("dayLow")),
    }


def _safe_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    try:
        decimal_value = Decimal(str(value))
    except Exception:  # noqa: BLE001
        return None
    return None if decimal_value.is_nan() else decimal_value
