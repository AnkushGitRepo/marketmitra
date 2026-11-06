"""Screener feature (ADR 0025): serve/ingest the bulk-refreshed
screener_metrics table. Distinct from fundamentals_service.py's per-company
lazy fetch-on-read path — this table is written wholesale by
scripts/refresh_screener_universe.py via POST /screener/ingest, and read
here purely from Postgres (no live scraping happens on the read path at
all, unlike every other table in this service).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CompanyMasterORM, ScreenerMetricsORM

logger = logging.getLogger("fundamentals.screener_service")

_NUMERIC_FIELDS = (
    "market_cap", "pe", "pb", "dividend_yield", "roce", "roe",
    "debt_to_equity", "sales_growth_3y_cagr", "profit_growth_3y_cagr",
)

_ORM_FIELDS = {
    "symbol", "name", "sector", "industry", "market_cap", "current_price",
    "pe", "book_value", "pb", "dividend_yield", "roce", "roe", "face_value",
    "debt_to_equity", "sales_growth_3y_cagr", "profit_growth_3y_cagr",
    "fetch_status", "source_tier",
}


# Owned by the daily bulk-quote job (POST /screener/quotes). Once a symbol has
# a live quote, the slower Screener.in scrape must not overwrite these with
# its own (older, consolidated-vs-standalone-ambiguous) numbers.
_QUOTE_OWNED_FIELDS = ("market_cap", "current_price", "pe", "pb", "dividend_yield")


def _row_to_values(row: dict) -> dict | None:
    values = {k: v for k, v in row.items() if k in _ORM_FIELDS}
    symbol = values.get("symbol")
    if not symbol or not values.get("name"):
        return None
    values["symbol"] = str(symbol).upper()
    values.setdefault("fetch_status", "ok")
    values.setdefault("source_tier", "tier3_screener_bulk")
    now = datetime.now(tz=UTC)
    values["fetched_at"] = now
    values["fundamentals_updated_at"] = now
    return values


async def ingest_screener_metrics(session: AsyncSession, rows: list[dict]) -> dict:
    """Upsert on symbol — a `failed` row (page fetch itself failed, per
    scraper.fetch_screener_snapshot's contract) is never passed in here at
    all by the refresh script, so a symbol's last successful values simply
    stand untouched until the next run succeeds for it."""
    count = 0
    quoted = set(
        (
            await session.execute(
                select(ScreenerMetricsORM.symbol).where(ScreenerMetricsORM.quote_updated_at.is_not(None))
            )
        ).scalars()
    )
    for row in rows:
        values = _row_to_values(row)
        if values is None:
            continue
        update_cols = {k: v for k, v in values.items() if k != "symbol"}
        if values["symbol"] in quoted:
            for field in _QUOTE_OWNED_FIELDS:
                update_cols.pop(field, None)
        await session.execute(
            insert(ScreenerMetricsORM)
            .values(**values)
            .on_conflict_do_update(index_elements=["symbol"], set_=update_cols)
        )
        count += 1
    await session.commit()
    return {"ingested": count}


_QUOTE_FIELDS = ("market_cap", "current_price", "pe", "pb", "dividend_yield")


async def ingest_quotes(session: AsyncSession, rows: list[dict]) -> dict:
    """Upsert the price-derived columns only. A symbol with no row yet gets a
    `quote_only` row (name from company_master), so market-cap / P/E / P/B /
    yield filters work for the whole universe before any Screener.in scrape
    has reached that company. An existing row keeps its fetch_status and its
    fundamentals untouched."""
    wanted = {str(r.get("symbol", "")).upper() for r in rows if r.get("symbol")}
    if not wanted:
        return {"ingested": 0, "skipped": 0}
    names = dict(
        (
            await session.execute(
                select(CompanyMasterORM.symbol, CompanyMasterORM.name).where(
                    CompanyMasterORM.symbol.in_(wanted)
                )
            )
        ).all()
    )
    now = datetime.now(tz=UTC)
    count = skipped = 0
    for row in rows:
        symbol = str(row.get("symbol", "")).upper()
        if symbol not in names:
            skipped += 1  # not in the NSE universe — never invent a company
            continue
        quote = {f: row.get(f) for f in _QUOTE_FIELDS if row.get(f) is not None}
        if not quote:
            skipped += 1
            continue
        values = {"symbol": symbol, "name": names[symbol], "fetch_status": "quote_only",
                  "source_tier": "yahoo_bulk_quote", "quote_updated_at": now, **quote}
        await session.execute(
            insert(ScreenerMetricsORM)
            .values(**values)
            .on_conflict_do_update(
                index_elements=["symbol"], set_={**quote, "quote_updated_at": now}
            )
        )
        count += 1
    await session.commit()
    return {"ingested": count, "skipped": skipped}


async def stale_symbols(session: AsyncSession, limit: int) -> list[dict]:
    """Main-board companies whose Screener.in fundamentals are missing or
    oldest, never-scraped first, bigger companies first within a tier — what
    the incremental job refreshes each run instead of the whole universe."""
    stmt = (
        select(CompanyMasterORM.symbol, CompanyMasterORM.name)
        .outerjoin(ScreenerMetricsORM, ScreenerMetricsORM.symbol == CompanyMasterORM.symbol)
        .where(CompanyMasterORM.is_sme.is_(False))
        .order_by(
            ScreenerMetricsORM.fundamentals_updated_at.asc().nullsfirst(),
            ScreenerMetricsORM.market_cap.desc().nullslast(),
            CompanyMasterORM.symbol,
        )
        .limit(limit)
    )
    return [{"symbol": sym, "name": name} for sym, name in (await session.execute(stmt)).all()]


def _apply_range_filters(stmt, filters: dict):
    for field in _NUMERIC_FIELDS:
        column = getattr(ScreenerMetricsORM, field)
        min_val = filters.get(f"{field}_min")
        if min_val is not None:
            stmt = stmt.where(column >= min_val)
        max_val = filters.get(f"{field}_max")
        if max_val is not None:
            stmt = stmt.where(column <= max_val)
    return stmt


def _order_by(filters: dict) -> list:
    """Server-side sort so "sort by ROE" ranks the whole matching set, not
    just the page that happened to be loaded. `sort_by` is validated against
    the numeric-field allow-list (never interpolated); NULLs always last, and
    market cap breaks ties so the order is deterministic."""
    sort_by = filters.get("sort_by")
    tiebreak = [ScreenerMetricsORM.market_cap.desc().nullslast(), ScreenerMetricsORM.symbol]
    if sort_by not in _NUMERIC_FIELDS:
        return tiebreak
    column = getattr(ScreenerMetricsORM, sort_by)
    primary = column.asc() if filters.get("order") == "asc" else column.desc()
    return [primary.nullslast(), *tiebreak]


async def get_screener_stats(session: AsyncSession) -> dict:
    """Coverage + freshness, so the UI can say how much of the universe a
    fundamentals-based filter can actually see."""
    universe = await session.scalar(
        select(func.count()).select_from(CompanyMasterORM).where(CompanyMasterORM.is_sme.is_(False))
    )
    quoted, quote_at, with_fundamentals, fundamentals_at = (
        await session.execute(
            select(
                func.count(ScreenerMetricsORM.quote_updated_at),
                func.max(ScreenerMetricsORM.quote_updated_at),
                func.count(ScreenerMetricsORM.fundamentals_updated_at),
                func.max(ScreenerMetricsORM.fundamentals_updated_at),
            )
        )
    ).one()
    return {
        "universe": universe or 0,
        "with_quotes": quoted,
        "with_fundamentals": with_fundamentals,
        "quotes_updated_at": quote_at,
        "fundamentals_updated_at": fundamentals_at,
    }


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _filtered(stmt, filters: dict):
    """Shared by the page query and the total count so they can never
    disagree about what "matching" means."""
    stmt = stmt.where(ScreenerMetricsORM.fetch_status != "failed")
    sector = filters.get("sector")
    if sector:
        stmt = stmt.where(ScreenerMetricsORM.sector == sector)
    industry = filters.get("industry")
    if industry:
        stmt = stmt.where(ScreenerMetricsORM.industry == industry)
    text = (filters.get("q") or "").strip()
    if text:
        pattern = f"%{_escape_like(text)}%"
        stmt = stmt.where(
            or_(
                ScreenerMetricsORM.symbol.ilike(pattern, escape="\\"),
                ScreenerMetricsORM.name.ilike(pattern, escape="\\"),
            )
        )
    return _apply_range_filters(stmt, filters)


async def query_screener_metrics(session: AsyncSession, filters: dict) -> list[ScreenerMetricsORM]:
    stmt = _filtered(select(ScreenerMetricsORM), filters).order_by(*_order_by(filters))
    stmt = stmt.offset(filters.get("offset") or 0).limit(filters.get("limit") or 100)
    return list((await session.execute(stmt)).scalars())


async def count_screener_metrics(session: AsyncSession, filters: dict) -> int:
    stmt = _filtered(select(func.count()).select_from(ScreenerMetricsORM), filters)
    return int(await session.scalar(stmt) or 0)


async def get_screener_facets(session: AsyncSession, sector: str | None = None) -> dict:
    """Sector/industry options with company counts, from what's actually in
    the data. `industries` is narrowed to `sector` when given, so the UI's
    industry dropdown only offers industries that exist inside that sector."""
    base = ScreenerMetricsORM.fetch_status != "failed"
    sector_rows = (
        await session.execute(
            select(ScreenerMetricsORM.sector, func.count())
            .where(base, ScreenerMetricsORM.sector.is_not(None))
            .group_by(ScreenerMetricsORM.sector)
        )
    ).all()
    industry_stmt = (
        select(ScreenerMetricsORM.industry, func.count())
        .where(base, ScreenerMetricsORM.industry.is_not(None))
        .group_by(ScreenerMetricsORM.industry)
    )
    if sector:
        industry_stmt = industry_stmt.where(ScreenerMetricsORM.sector == sector)
    industry_rows = (await session.execute(industry_stmt)).all()
    return {
        "sectors": sorted(name for name, _ in sector_rows),
        "industries": sorted(name for name, _ in industry_rows),
        "sector_counts": {name: n for name, n in sector_rows},
        "industry_counts": {name: n for name, n in industry_rows},
    }
