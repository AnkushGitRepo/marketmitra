"""Search across every NSE-listed equity (main board + SME) plus the tracked
indices — "all the stocks and indices the Indian market has," not just
whatever companies have already been queried once (see
app/ingestion/company_master.py).

Ranking lives in search_index.py; this module loads the universe from
Postgres into a short-lived in-process snapshot so keystroke-rate queries
never hit the database.
"""

from __future__ import annotations

import logging
import time

from sqlalchemy import case, delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CompanyMasterORM, ScreenerMetricsORM
from app.ingestion.company_master import fetch_equity_list, fetch_sme_list
from app.ingestion.indices import TRACKED_INDICES
from app.services.search_index import CompanyEntry, rank_companies

logger = logging.getLogger("fundamentals.search")

_SNAPSHOT_TTL_SECONDS = 3600
_MIN_LIST_FOR_PRUNE = 2000
_snapshot: tuple[float, list[CompanyEntry]] | None = None
# The SME top-up below runs at most once per process (ADR 0066).
_sme_checked = False


async def ensure_company_master_populated(session: AsyncSession) -> None:
    """Populate on first use, and re-populate when the table predates the
    enriched columns (rows exist but none carry an ISIN yet)."""
    total = await session.scalar(select(func.count()).select_from(CompanyMasterORM))
    enriched = await session.scalar(
        select(func.count()).select_from(CompanyMasterORM).where(CompanyMasterORM.isin.is_not(None))
    )
    if total and enriched:
        await _ensure_sme_rows(session)
        return
    await refresh_company_master(session)


async def _ensure_sme_rows(session: AsyncSession) -> None:
    """A master populated before SME support has no SME rows and would never get
    them (it is only refreshed when empty). Add them once per process from the
    bundled list, never over the network, so no request waits on NSE."""
    global _sme_checked
    if _sme_checked:
        return
    _sme_checked = True
    has_sme = await session.scalar(
        select(func.count()).select_from(CompanyMasterORM).where(CompanyMasterORM.is_sme.is_(True))
    )
    if not has_sme:
        await refresh_sme_master(session, live=False)


def _upsert(companies: list[dict], *, only_sme: bool):
    """Upsert on symbol. A placeholder name (the symbol itself, used for SME rows
    until the quote feed supplies the real one) never overwrites a real name, and
    missing optional fields never blank out known ones. With `only_sme`, a row
    that is already on the main board is left untouched."""
    stmt = insert(CompanyMasterORM).values(companies)
    ex = stmt.excluded
    update_cols = {
        "name": case((ex.name == ex.symbol, CompanyMasterORM.name), else_=ex.name),
        "isin": func.coalesce(ex.isin, CompanyMasterORM.isin),
        "series": func.coalesce(ex.series, CompanyMasterORM.series),
        "listing_date": func.coalesce(ex.listing_date, CompanyMasterORM.listing_date),
        "face_value": func.coalesce(ex.face_value, CompanyMasterORM.face_value),
        "is_sme": ex.is_sme,
    }
    return stmt.on_conflict_do_update(
        index_elements=["symbol"],
        set_=update_cols,
        where=CompanyMasterORM.is_sme.is_(True) if only_sme else None,
    )


async def refresh_sme_master(session: AsyncSession, *, live: bool = True) -> int:
    """Add or update the SME companies only: never prunes and never touches a
    main-board row."""
    companies = await fetch_sme_list(live=live)
    if not companies:
        logger.warning("could not populate SME companies — no SME list available")
        return 0
    await session.execute(_upsert(companies, only_sme=True))
    await session.commit()
    invalidate_snapshot()
    logger.info("populated company_master with %d SME symbols", len(companies))
    return len(companies)


async def refresh_company_master(session: AsyncSession) -> int:
    companies = await fetch_equity_list()
    if not companies:
        logger.warning("could not populate company_master — equity list fetch failed")
        return 0

    await session.execute(_upsert(companies, only_sme=False))
    if len(companies) >= _MIN_LIST_FOR_PRUNE:
        # Delisted/renamed symbols drop out of search and the screener
        # universe — but only when the list looks complete, so a truncated
        # download can never wipe the table.
        await session.execute(
            delete(CompanyMasterORM).where(CompanyMasterORM.symbol.not_in([c["symbol"] for c in companies]))
        )
    await session.commit()
    invalidate_snapshot()
    logger.info("populated company_master with %d symbols", len(companies))
    return len(companies)


async def master_info(session: AsyncSession, symbol: str) -> tuple[bool, str | None]:
    """(is it on the NSE SME platform, the master's name for it); (False, None) when it is not in the master."""
    row = (
        await session.execute(
            select(CompanyMasterORM.is_sme, CompanyMasterORM.name).where(CompanyMasterORM.symbol == symbol.upper())
        )
    ).first()
    return (bool(row[0]), row[1]) if row else (False, None)


def invalidate_snapshot() -> None:
    global _snapshot
    _snapshot = None


async def _load_entries(session: AsyncSession) -> list[CompanyEntry]:
    global _snapshot
    if _snapshot and time.monotonic() - _snapshot[0] < _SNAPSHOT_TTL_SECONDS:
        return _snapshot[1]

    metrics = {
        row.symbol: row
        for row in (
            await session.execute(
                select(ScreenerMetricsORM.symbol, ScreenerMetricsORM.sector, ScreenerMetricsORM.market_cap)
            )
        ).all()
    }
    masters = (await session.execute(select(CompanyMasterORM))).scalars().all()
    entries = [
        CompanyEntry(
            symbol=m.symbol,
            name=m.name,
            isin=m.isin,
            series=m.series,
            is_sme=m.is_sme,
            sector=metrics[m.symbol].sector if m.symbol in metrics else None,
            market_cap=float(metrics[m.symbol].market_cap)
            if m.symbol in metrics and metrics[m.symbol].market_cap is not None
            else None,
        )
        for m in masters
    ]
    _snapshot = (time.monotonic(), entries)
    return entries


async def search(session: AsyncSession, query: str, limit: int = 15) -> list[dict]:
    query = query.strip()
    if not query:
        return []

    results: list[dict] = []
    query_upper = query.upper()
    for name, yahoo_symbol in TRACKED_INDICES.items():
        if query_upper in name.upper():
            results.append({"type": "index", "symbol": yahoo_symbol, "name": name})

    entries = await _load_entries(session)
    for entry in rank_companies(entries, query, limit):
        results.append(
            {
                "type": "company",
                "symbol": entry.symbol,
                "name": entry.name,
                "sector": entry.sector,
                "series": entry.series,
                "is_sme": entry.is_sme,
            }
        )
    return results[:limit]
