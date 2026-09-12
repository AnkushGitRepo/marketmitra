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

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ScreenerMetricsORM

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


def _row_to_values(row: dict) -> dict | None:
    values = {k: v for k, v in row.items() if k in _ORM_FIELDS}
    symbol = values.get("symbol")
    if not symbol or not values.get("name"):
        return None
    values["symbol"] = str(symbol).upper()
    values.setdefault("fetch_status", "ok")
    values.setdefault("source_tier", "tier3_screener_bulk")
    values["fetched_at"] = datetime.now(tz=UTC)
    return values


async def ingest_screener_metrics(session: AsyncSession, rows: list[dict]) -> dict:
    """Upsert on symbol — a `failed` row (page fetch itself failed, per
    scraper.fetch_screener_snapshot's contract) is never passed in here at
    all by the refresh script, so a symbol's last successful values simply
    stand untouched until the next run succeeds for it."""
    count = 0
    for row in rows:
        values = _row_to_values(row)
        if values is None:
            continue
        update_cols = {k: v for k, v in values.items() if k != "symbol"}
        await session.execute(
            insert(ScreenerMetricsORM)
            .values(**values)
            .on_conflict_do_update(index_elements=["symbol"], set_=update_cols)
        )
        count += 1
    await session.commit()
    return {"ingested": count}


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


async def query_screener_metrics(session: AsyncSession, filters: dict) -> list[ScreenerMetricsORM]:
    stmt = select(ScreenerMetricsORM).where(ScreenerMetricsORM.fetch_status != "failed")
    sector = filters.get("sector")
    if sector:
        stmt = stmt.where(ScreenerMetricsORM.sector == sector)
    industry = filters.get("industry")
    if industry:
        stmt = stmt.where(ScreenerMetricsORM.industry == industry)
    stmt = _apply_range_filters(stmt, filters)
    stmt = stmt.order_by(ScreenerMetricsORM.market_cap.desc().nullslast())
    limit = filters.get("limit") or 100
    stmt = stmt.limit(limit)
    return list((await session.execute(stmt)).scalars())


async def get_screener_facets(session: AsyncSession) -> dict:
    sectors = (
        await session.execute(
            select(ScreenerMetricsORM.sector).where(ScreenerMetricsORM.sector.is_not(None)).distinct()
        )
    ).scalars()
    industries = (
        await session.execute(
            select(ScreenerMetricsORM.industry).where(ScreenerMetricsORM.industry.is_not(None)).distinct()
        )
    ).scalars()
    return {"sectors": sorted(sectors), "industries": sorted(industries)}
