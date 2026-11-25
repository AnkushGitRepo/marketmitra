"""News feed service (ADR 0015): lazy TTL refresh-on-read over Postgres,
same shape as the ratios/prices caches. A read re-fetches only when the
newest relevant row is older than the TTL.
"""

from __future__ import annotations

import base64
import json
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import CompanyMasterORM, NewsItemORM, NewsItemSymbolORM
from app.ingestion import news as ingest
from app.ingestion import regulators
from app.services.search_service import ensure_company_master_populated

logger = logging.getLogger("fundamentals.news_service")
_settings = get_settings()

# Google-News-per-symbol always runs for these, so popular stock pages have
# news even when nobody holds them. Mirrors src/lib/dashboard/watchlist.ts.
TRACKED_SYMBOLS: tuple[str, ...] = (
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
    "SBIN", "ITC", "LT", "HINDUNILVR", "BHARTIARTL",
)

_MAX_SYMBOLS_PER_READ = 25


# --- cursor ------------------------------------------------------------------

def _encode_cursor(published_at: datetime, item_id: int) -> str:
    raw = json.dumps([published_at.isoformat(), item_id]).encode()
    return base64.urlsafe_b64encode(raw).decode()


def _decode_cursor(cursor: str | None) -> tuple[datetime, int] | None:
    if not cursor:
        return None
    try:
        iso, item_id = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        return datetime.fromisoformat(iso), int(item_id)
    except Exception:  # noqa: BLE001
        return None


# --- staleness -------------------------------------------------------------

async def _newest_published(session: AsyncSession, symbol: str | None) -> datetime | None:
    stmt = select(func.max(NewsItemORM.published_at))
    if symbol is not None:
        stmt = stmt.join(NewsItemSymbolORM).where(NewsItemSymbolORM.symbol == symbol)
    return await session.scalar(stmt)


def _is_stale(newest: datetime | None, ttl_minutes: int) -> bool:
    if newest is None:
        return True
    if newest.tzinfo is None:
        newest = newest.replace(tzinfo=UTC)
    return datetime.now(UTC) - newest > timedelta(minutes=ttl_minutes)


# --- persistence ---------------------------------------------------------

async def _store(session: AsyncSession, items: list[dict], symbols: list[str]) -> None:
    """Upsert items (dedup on url) and attach `symbols` to each. Broad items
    pass their own matched symbols; per-symbol fetches pass [that symbol]."""
    for item in items:
        row = {k: v for k, v in item.items() if not k.startswith("_")}
        tags = item.get("_symbols", symbols)
        result = await session.execute(
            insert(NewsItemORM)
            .values(**row)
            .on_conflict_do_nothing(index_elements=["url"])
            .returning(NewsItemORM.id)
        )
        item_id = result.scalar_one_or_none()
        if item_id is None:  # already stored — get its id to (re)link symbols
            item_id = await session.scalar(
                select(NewsItemORM.id).where(NewsItemORM.url == row["url"])
            )
        for sym in tags:
            await session.execute(
                insert(NewsItemSymbolORM)
                .values(news_item_id=item_id, symbol=sym)
                .on_conflict_do_nothing(index_elements=["news_item_id", "symbol"])
            )
    await session.commit()


async def _prune(session: AsyncSession) -> None:
    now = datetime.now(UTC)
    news_cutoff = now - timedelta(days=_settings.news_retention_days)
    regulator_cutoff = now - timedelta(days=_settings.regulator_retention_days)
    regulator = NewsItemORM.source.in_(regulators.REGULATOR_SOURCES)
    await session.execute(delete(NewsItemORM).where(~regulator, NewsItemORM.published_at < news_cutoff))
    await session.execute(delete(NewsItemORM).where(regulator, NewsItemORM.published_at < regulator_cutoff))
    await session.commit()


# --- refresh -----------------------------------------------------------------

async def _build_name_index(session: AsyncSession) -> list[tuple[str, object]]:
    rows = (await session.execute(select(CompanyMasterORM.symbol, CompanyMasterORM.name))).all()
    index: list[tuple[str, object]] = []
    for symbol, name in rows:
        matcher = ingest.matcher_name(name)
        if matcher:
            index.append((symbol, ingest.build_name_pattern(matcher)))
    return index


async def _refresh_broad(session: AsyncSession) -> None:
    await ensure_company_master_populated(session)
    items = await ingest.fetch_broad_items()
    if items:
        name_index = await _build_name_index(session)
        for item in items:
            text = f"{item['title']} {item.get('summary') or ''}"
            item["_symbols"] = ingest.tag_symbols(text, name_index)
        await _store(session, items, symbols=[])
    # Regulator notices (#365) are sector-wide, so they are not tagged to companies.
    notices = await regulators.fetch_regulator_items()
    if notices:
        await _store(session, notices, symbols=[])
    if items or notices:
        await _prune(session)


async def _refresh_symbol(session: AsyncSession, symbol: str) -> None:
    name = await session.scalar(
        select(CompanyMasterORM.name).where(CompanyMasterORM.symbol == symbol)
    )
    if not name:
        return
    items = await ingest.fetch_symbol_items(name)
    if items:
        await _store(session, items, symbols=[symbol])


# --- public read -----------------------------------------------------------

async def get_news(
    session: AsyncSession,
    symbols: list[str] | None = None,
    limit: int = 20,
    cursor: str | None = None,
    include_regulatory: bool = False,
) -> dict:
    """Newest-first news, optionally filtered to `symbols`. Refreshes stale
    data first (lazy TTL). Returns {items: [...], next_cursor: str | None}.
    Regulator notices (RBI, TRAI, SEBI; #365) are left out unless `include_regulatory`: they are retrieval
    material for the research report, not headlines for the news page."""
    limit = max(1, min(limit, 50))

    if symbols:
        wanted = [s.strip().upper() for s in symbols if s.strip()][:_MAX_SYMBOLS_PER_READ]
        for sym in wanted:
            if _is_stale(
                await _newest_published(session, sym), _settings.news_symbol_cache_ttl_minutes
            ):
                await _refresh_symbol(session, sym)
    else:
        wanted = None
        if _is_stale(
            await _newest_published(session, None), _settings.news_broad_cache_ttl_minutes
        ):
            await _refresh_broad(session)

    stmt = select(NewsItemORM)
    if not include_regulatory:
        stmt = stmt.where(NewsItemORM.source.not_in(regulators.REGULATOR_SOURCES))
    if wanted:
        stmt = stmt.join(NewsItemSymbolORM).where(NewsItemSymbolORM.symbol.in_(wanted)).distinct()

    decoded = _decode_cursor(cursor)
    if decoded:
        cur_pub, cur_id = decoded
        stmt = stmt.where(
            tuple_(NewsItemORM.published_at, NewsItemORM.id) < tuple_(cur_pub, cur_id)
        )

    stmt = stmt.order_by(NewsItemORM.published_at.desc(), NewsItemORM.id.desc()).limit(limit + 1)
    rows = (await session.execute(stmt)).scalars().all()

    has_more = len(rows) > limit
    rows = rows[:limit]

    symbol_map = await _symbols_for(session, [r.id for r in rows])
    items = [
        {
            "url": r.url,
            "title": r.title,
            "summary": r.summary,
            "source": r.source,
            "published_at": r.published_at,
            "sentiment": r.sentiment,
            "sentiment_score": float(r.sentiment_score),
            "symbols": symbol_map.get(r.id, []),
        }
        for r in rows
    ]
    next_cursor = (
        _encode_cursor(rows[-1].published_at, rows[-1].id) if has_more and rows else None
    )
    return {"items": items, "next_cursor": next_cursor}


async def _symbols_for(session: AsyncSession, item_ids: list[int]) -> dict[int, list[str]]:
    if not item_ids:
        return {}
    rows = (
        await session.execute(
            select(NewsItemSymbolORM.news_item_id, NewsItemSymbolORM.symbol).where(
                NewsItemSymbolORM.news_item_id.in_(item_ids)
            )
        )
    ).all()
    out: dict[int, list[str]] = {}
    for item_id, symbol in rows:
        out.setdefault(item_id, []).append(symbol)
    return out


async def refresh_all(session: AsyncSession) -> dict:
    """Force a full refresh — broad feeds + every tracked symbol. For an
    optional warm-up cron; reads don't need it."""
    await _refresh_broad(session)
    for sym in TRACKED_SYMBOLS:
        await _refresh_symbol(session, sym)
    total = await session.scalar(select(func.count()).select_from(NewsItemORM))
    return {"refreshed": True, "news_items": int(total or 0)}
