"""IPO tracker service (ADR 0017): serve from Postgres, lazy TTL refresh on
read (best-effort — the aggregator is a SPA), and an `ingest_ipos` entry
point the out-of-band headless-browser job calls via POST /ipos/ingest.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import IpoORM
from app.ingestion.tier3_ipo_scraper import scraper as ipo_scraper
from app.ingestion.tier3_ipo_scraper.scraper import ist_today

logger = logging.getLogger("fundamentals.ipo_service")
_settings = get_settings()

_STATUS_ORDER = {"open": 0, "upcoming": 1, "closed": 2, "listed": 3}

# scraper dict -> ORM column (identical names except this remap)
_REMAP = {"updated_on": "gmp_updated_at"}
_DATE_FIELDS = {"open_date", "close_date", "allotment_date", "listing_date"}
_DATETIME_FIELDS = {"gmp_updated_at", "sub_as_of"}
_ORM_FIELDS = {
    "slug", "name", "source_url", "category", "status", "price", "ipo_size_cr",
    "lot_size", "rating", "subscription_times", "sub_qib", "sub_nii", "sub_snii", "sub_bnii",
    "sub_retail", "anchor", "gmp", "gmp_pct",
    "gmp_low", "gmp_high", *_DATETIME_FIELDS, *_DATE_FIELDS,
}


def _coerce(col: str, val: object) -> object:
    """The out-of-band ingest job POSTs JSON, so dates arrive as ISO
    strings — turn them back into date/datetime for the ORM. Values that
    are already the right type (the in-process lazy-refresh path) pass
    through."""
    if val is None or not isinstance(val, str):
        return val
    try:
        if col in _DATE_FIELDS:
            return date.fromisoformat(val[:10])
        if col in _DATETIME_FIELDS:
            return datetime.fromisoformat(val)
    except ValueError:
        return None
    return val


def _row_to_values(row: dict) -> dict | None:
    values = {}
    for key, val in row.items():
        col = _REMAP.get(key, key)
        if col in _ORM_FIELDS:
            values[col] = _coerce(col, val)
    if not values.get("slug") or not values.get("name"):
        return None
    values.setdefault("source_tier", "tier3_ipo_aggregator")
    values["fetched_at"] = datetime.now(tz=UTC)
    return values


async def _upsert(session: AsyncSession, rows: list[dict]) -> int:
    """Update-first: `ON CONFLICT (slug) DO UPDATE` refreshes the existing
    row in place (dates, GMP, subscription, status all move), and only
    inserts a new row when that slug has never been seen."""
    count = 0
    for row in rows:
        values = _row_to_values(row)
        if values is None:
            continue
        update_cols = {k: v for k, v in values.items() if k != "slug"}
        await session.execute(
            insert(IpoORM)
            .values(**values)
            .on_conflict_do_update(index_elements=["slug"], set_=update_cols)
        )
        count += 1
    await session.commit()
    return count


async def _prune(session: AsyncSession) -> None:
    cutoff = ist_today() - timedelta(days=_settings.ipo_listed_retention_days)
    await session.execute(
        delete(IpoORM).where(IpoORM.status == "listed", IpoORM.listing_date < cutoff)
    )
    await session.commit()


async def ingest_ipos(session: AsyncSession, rows: list[dict]) -> dict:
    """Called by POST /ipos/ingest (the headless-browser refresh job) and by
    the lazy read-path refresh. Upserts on slug, then prunes old listings."""
    written = await _upsert(session, rows)
    await _prune(session)
    total = await session.scalar(select(func.count()).select_from(IpoORM))
    return {"ingested": written, "total": int(total or 0)}


async def _refresh_if_stale(session: AsyncSession) -> None:
    newest = await session.scalar(select(func.max(IpoORM.fetched_at)))
    if newest is not None:
        if newest.tzinfo is None:
            newest = newest.replace(tzinfo=UTC)
        if datetime.now(UTC) - newest <= timedelta(minutes=_settings.ipo_cache_ttl_minutes):
            return
    rows = await ipo_scraper.fetch_ipo_list()
    if rows:
        await ingest_ipos(session, rows)


async def get_ipos(session: AsyncSession, status: str | None = None) -> list[dict]:
    await _refresh_if_stale(session)

    stmt = select(IpoORM)
    if status:
        stmt = stmt.where(IpoORM.status == status)
    ipos = (await session.execute(stmt)).scalars().all()

    def sort_key(i: IpoORM) -> tuple:
        return (
            _STATUS_ORDER.get(i.status, 9),
            i.open_date or i.listing_date or date.max,
        )

    ipos.sort(key=sort_key)
    return [_to_dict(i) for i in ipos]


def _to_dict(i: IpoORM) -> dict:
    def f(v) -> float | None:
        return float(v) if v is not None else None

    return {
        "slug": i.slug,
        "name": i.name,
        "source_url": i.source_url,
        "category": i.category,
        "status": i.status,
        "price": f(i.price),
        "ipo_size_cr": f(i.ipo_size_cr),
        "lot_size": i.lot_size,
        "rating": i.rating,
        "subscription_times": f(i.subscription_times),
        "sub_qib": f(i.sub_qib),
        "sub_nii": f(i.sub_nii),
        "sub_snii": f(i.sub_snii),
        "sub_bnii": f(i.sub_bnii),
        "sub_retail": f(i.sub_retail),
        "sub_as_of": i.sub_as_of,
        "anchor": i.anchor,
        "gmp": f(i.gmp),
        "gmp_pct": f(i.gmp_pct),
        "gmp_low": f(i.gmp_low),
        "gmp_high": f(i.gmp_high),
        "gmp_updated_at": i.gmp_updated_at,
        "open_date": i.open_date,
        "close_date": i.close_date,
        "allotment_date": i.allotment_date,
        "listing_date": i.listing_date,
        "source_tier": i.source_tier,
        "fetched_at": i.fetched_at,
    }
