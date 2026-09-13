"""Batched live quotes — the read path the alerts engine polls (see ADR 0014)
and the fundamentals-api's own fallback behind the main app's yahoo-finance2
primary source (see ADR 0024). Distinct from `app/api/routes/prices.py`
(end-of-day OHLC history, persisted to Postgres) and from the per-company
three-tier fallback chain: this is a lightweight "what's the price *right
now*, for these N symbols" call.

**ADR 0024 reordering**: this used to be yfinance-only, on the stated (but
unqualified) belief that NSE/BSE are blocked from this environment. ADR 0011
is explicit that NSE's blocking during development was specific to that
dev/CI environment (Akamai edge blocking non-Indian-residential/non-browser
traffic), not necessarily true of wherever this service is actually deployed
— so NSE is tried first here too, same as everywhere else in the three-tier
chain. BSE is second (needs a `bse_code`, looked up in Postgres — a real gap:
nothing in this codebase populates `bse_code` yet, so this stub currently
never fires; see ADR 0024). yfinance has been removed from this path
entirely, per an explicit product decision (ADR 0024) — a caller either gets
a real exchange-sourced price or none at all, never a `fast_info` fallback.
Results are held in a short in-process TTL cache so the 10-minute alert cron
and any dashboard caller share one upstream hit.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import CompanyORM
from app.ingestion import tier1_nse_bse
from app.ingestion.indices import TRACKED_INDICES

logger = logging.getLogger("fundamentals.quotes")

_SOURCE_TIER = "tier1_nse_bse"

# resolved-symbol -> (fetched_at_monotonic, quote dict)
_CACHE: dict[str, tuple[float, dict]] = {}

_MAX_SYMBOLS = 100


def _safe_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    try:
        d = Decimal(str(value))
    except Exception:  # noqa: BLE001
        return None
    return None if d.is_nan() else d


def _build_quote(symbol: str, raw: dict) -> dict | None:
    price = _safe_decimal(raw.get("last_price"))
    if price is None:
        return None
    prev_close = _safe_decimal(raw.get("prev_close"))
    change_pct: Decimal | None = None
    if prev_close is not None and prev_close != 0:
        # Decimal division is otherwise unbounded — 4 dp is plenty for a %.
        change_pct = ((price - prev_close) / prev_close * Decimal(100)).quantize(Decimal("0.0001"))
    return {
        "symbol": symbol.strip().upper(),
        "price": price,
        "prev_close": prev_close,
        "change_pct": change_pct,
        "week52_high": _safe_decimal(raw.get("week52_high")),
        "week52_low": _safe_decimal(raw.get("week52_low")),
        "as_of": datetime.now(tz=UTC).isoformat(),
        "source_tier": _SOURCE_TIER,
    }


async def _get_bse_code(symbol: str, session: AsyncSession | None) -> str | None:
    """Read-only lookup, never creates a company record — this is a hot,
    frequently-polled path, not the place to trigger company resolution.
    Returns None whenever the company isn't known yet or has no bse_code,
    which is every company today (see module docstring)."""
    if session is None:
        return None
    try:
        stmt = select(CompanyORM.bse_code).where(CompanyORM.nse_symbol == symbol.strip().upper())
        return (await session.execute(stmt)).scalar_one_or_none()
    except Exception as exc:  # noqa: BLE001
        logger.warning("bse_code lookup for %s failed: %s", symbol, exc)
        return None


async def get_quote(symbol: str, session: AsyncSession | None = None) -> dict | None:
    """One symbol. Returns None (never a fabricated price) when NSE and BSE
    both come up short — callers must skip it."""
    key = symbol.strip().upper()
    is_index = key in TRACKED_INDICES
    ttl = get_settings().quote_cache_ttl_seconds

    cached = _CACHE.get(key)
    if cached is not None and (time.monotonic() - cached[0]) < ttl:
        return {**cached[1], "symbol": key}

    raw: dict = {}
    if not is_index:
        try:
            nse = await tier1_nse_bse.get_nse_quote(key)
        except Exception as exc:  # noqa: BLE001 — get_nse_quote already catches internally; belt-and-braces
            logger.warning("get_nse_quote(%s) raised: %s", key, exc)
            nse = {}
        if nse.get("last_price") is not None:
            raw = nse
        else:
            bse_code = await _get_bse_code(key, session)
            if bse_code:
                try:
                    bse = await tier1_nse_bse.get_bse_quote(bse_code)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("get_bse_quote(%s) raised: %s", bse_code, exc)
                    bse = {}
                if bse.get("last_price") is not None:
                    raw = bse

    if not raw:
        # Indices aren't NSE-equity symbols nse_eq() can resolve, and there's
        # no index-quote fallback in this module (see app/ingestion/indices.py
        # for the dedicated /indices path) — either way, nothing more to try.
        return None

    quote = _build_quote(key, raw)
    if quote is not None:
        _CACHE[key] = (time.monotonic(), quote)
    return quote


async def get_quotes(symbols: list[str], session: AsyncSession | None = None) -> list[dict]:
    """Deduplicated, order-preserving, capped at _MAX_SYMBOLS. Symbols whose
    fetch failed are omitted from the result, not returned as nulls."""
    seen: set[str] = set()
    ordered: list[str] = []
    for raw in symbols:
        key = raw.strip().upper()
        if key and key not in seen:
            seen.add(key)
            ordered.append(key)
    ordered = ordered[:_MAX_SYMBOLS]

    results = await asyncio.gather(*(get_quote(s, session) for s in ordered))
    return [r for r in results if r is not None]


def _clear_cache() -> None:
    """Test hook."""
    _CACHE.clear()
