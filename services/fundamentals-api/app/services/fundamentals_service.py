"""Ties the three ingestion tiers to Postgres storage: check the DB cache
first, only call out to the ingestion tiers when data is missing or stale,
and persist whatever the fallback chain returns with its source_tier intact.

**Current real coverage, stated plainly:**
- Quotes/price history: Tier 1 (BSE via bsedata; NSE via nsepython, though
  NSE itself is frequently blocked — see tier1_nse_bse.py) falling back to
  Tier 2 (yfinance). Both genuinely wired and tested.
- Ratios: Tier 3 (Screener.in) only for now — Tiers 1/2 don't expose a
  comparable set of named/computed ratios (P/E, ROCE, etc.) as raw data,
  so there is nothing for them to resolve here yet.
- Shareholding pattern: Tier 1 (direct NSE endpoint) falling back to
  Tier 3 (Screener.in). Tier 1's parsing is defensive/unverified end-to-end
  (see tier1_nse_bse.py); Tier 3's is verified working.
- Financial statements (P&L/balance sheet/cash flow): Tier 1 for the latest
  period, Tier 3 (Screener.in) for the history. `filing_discovery.py` finds
  the most recent NSE/BSE results filing (XBRL preferred, PDF fallback),
  `xbrl_parser`/`pdf_financials` extract it; if that yields nothing the
  Screener scrape serves as before. The NSE fetch is unverified live from
  a blocked environment (ADR 0011) — parsers are fixture-tested and every
  failure collapses to "Tier 1 had nothing", so there's no regression.
- About (business description) and peer comparison: Tier 3 (Screener.in)
  only — neither has a Tier 1/2 equivalent.
- Documents: Tier 3 only, and only annual reports specifically — Screener's
  Documents section links directly to BSE-hosted PDFs, so this doesn't need
  the Tier 1 filing-URL discovery step above (that's still open for other
  document types / for driving financial-statement extraction directly).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import (
    CompanyORM,
    DocumentReferenceORM,
    FinancialLineItemORM,
    PeerComparisonORM,
    PriceHistoryPointORM,
    RatioORM,
    ShareholdingEntryORM,
)
from app.ingestion import filing_discovery, tier1_nse_bse, tier2_yfinance
from app.ingestion.orchestrator import TieredResolver, resolve_with_fallback
from app.ingestion.tier3_screener_scrapling import scraper as tier3
from app.schemas import DocumentType, SourceTier, StatementType

logger = logging.getLogger("fundamentals.service")
_settings = get_settings()


async def get_or_create_company(
    session: AsyncSession, nse_symbol: str | None = None, bse_code: str | None = None
) -> CompanyORM:
    stmt = select(CompanyORM)
    if nse_symbol:
        stmt = stmt.where(CompanyORM.nse_symbol == nse_symbol)
    elif bse_code:
        stmt = stmt.where(CompanyORM.bse_code == bse_code)
    else:
        raise ValueError("nse_symbol or bse_code is required")

    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing:
        return existing

    resolvers = [
        TieredResolver(
            SourceTier.TIER1_NSE_BSE, lambda: _resolve_tier1_quote(nse_symbol, bse_code), "quote",
        ),
        TieredResolver(
            SourceTier.TIER2_YFINANCE,
            lambda: tier2_yfinance.get_quote_gap_fill(nse_symbol, bse_code),
            "quote-gap-fill",
        ),
    ]
    result = await resolve_with_fallback(
        {"name", "industry", "sector"}, resolvers, context_label=f"company:{nse_symbol or bse_code}"
    )

    name_tier = result.tier_for("name")
    company = CompanyORM(
        nse_symbol=nse_symbol,
        bse_code=bse_code,
        name=result.values.get("name") or nse_symbol or bse_code or "Unknown",
        industry=result.values.get("industry"),
        sector=result.values.get("sector"),
        # None (not a fabricated tier) when neither tier actually resolved a
        # name — e.g. NSE blocked and yfinance had no match either — so the
        # "Unknown"/symbol-as-name fallback above is never misattributed.
        source_tier=name_tier.value if name_tier else None,
    )
    session.add(company)
    await session.commit()
    await session.refresh(company)
    return company


async def _resolve_tier1_quote(nse_symbol: str | None, bse_code: str | None) -> dict:
    if nse_symbol:
        data = await tier1_nse_bse.get_nse_quote(nse_symbol)
        if data:
            return data
    if bse_code:
        return await tier1_nse_bse.get_bse_quote(bse_code)
    return {}


def _is_stale(fetched_at: datetime | None, ttl_hours: int) -> bool:
    if fetched_at is None:
        return True
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=UTC)
    return datetime.now(UTC) - fetched_at > timedelta(hours=ttl_hours)


async def _latest_snapshot(session: AsyncSession, model: type, company_id: int, *order_by):
    """Ratios and peer comparisons are re-scraped daily, keyed into their
    upsert conflict target by (..., as_of) — so every calendar day this ran
    on adds a *new* row rather than replacing the previous one (as_of
    differs). Without narrowing to the most recent as_of, a caller gets
    every historical daily snapshot ever taken, not just the latest —
    surfaced as visibly duplicated rows on the stock page. Always call
    through this rather than a bare `WHERE company_id = ...` select."""
    latest_as_of = (
        select(func.max(model.as_of)).where(model.company_id == company_id).scalar_subquery()
    )
    stmt = (
        select(model)
        .where(model.company_id == company_id, model.as_of == latest_as_of)
        .order_by(*order_by)
    )
    return list((await session.execute(stmt)).scalars())


async def get_ratios(session: AsyncSession, company: CompanyORM) -> list[RatioORM]:
    existing = await _latest_snapshot(session, RatioORM, company.id, RatioORM.name)
    most_recent_fetch = existing[0].fetched_at if existing else None

    if existing and not _is_stale(most_recent_fetch, _settings.ratios_cache_ttl_hours):
        return existing

    if not company.nse_symbol:
        return existing  # Screener needs an NSE-style symbol; nothing more to try

    scraped = await tier3.fetch_ratios(company.nse_symbol)
    today = datetime.now(UTC).date()
    for item in scraped:
        stmt = (
            insert(RatioORM)
            .values(
                company_id=company.id,
                name=item["name"],
                value=item["value"],
                unit=item["unit"],
                as_of=today,
                source_tier=SourceTier.TIER3_SCREENER.value,
            )
            .on_conflict_do_update(
                index_elements=["company_id", "name", "as_of"],
                set_={"value": item["value"], "unit": item["unit"], "fetched_at": func.now()},
            )
        )
        await session.execute(stmt)
    await session.commit()

    return await _latest_snapshot(session, RatioORM, company.id, RatioORM.name)


async def get_shareholding(session: AsyncSession, company: CompanyORM) -> list[ShareholdingEntryORM]:
    stmt = (
        select(ShareholdingEntryORM)
        .where(ShareholdingEntryORM.company_id == company.id)
        .order_by(ShareholdingEntryORM.quarter_end.desc())
    )
    existing = list((await session.execute(stmt)).scalars())
    if existing and not _is_stale(existing[0].fetched_at, _settings.ratios_cache_ttl_hours):
        return existing

    resolvers = []
    if company.nse_symbol:
        resolvers.append(
            TieredResolver(
                SourceTier.TIER1_NSE_BSE,
                lambda: _nse_shareholding_as_field_dict(company.nse_symbol),
                "shareholding",
            )
        )
        resolvers.append(
            TieredResolver(
                SourceTier.TIER3_SCREENER,
                lambda: _screener_shareholding_as_field_dict(company.nse_symbol),
                "shareholding",
            )
        )

    if not resolvers:
        return existing

    result = await resolve_with_fallback(
        {"entries"}, resolvers, context_label=f"shareholding:{company.nse_symbol}"
    )
    entries = result.values.get("entries") or []
    source_tier = result.tier_for("entries") or SourceTier.TIER3_SCREENER

    for entry in entries:
        stmt = (
            insert(ShareholdingEntryORM)
            .values(
                company_id=company.id,
                category=entry["category"],
                percentage=entry["percentage"],
                quarter_end=entry["quarter_end"] or datetime.now(UTC).date(),
                source_tier=source_tier.value,
            )
            .on_conflict_do_update(
                index_elements=["company_id", "category", "quarter_end"],
                set_={"percentage": entry["percentage"], "fetched_at": func.now()},
            )
        )
        await session.execute(stmt)
    await session.commit()

    stmt = (
        select(ShareholdingEntryORM)
        .where(ShareholdingEntryORM.company_id == company.id)
        .order_by(ShareholdingEntryORM.quarter_end.desc())
    )
    return list((await session.execute(stmt)).scalars())


async def _nse_shareholding_as_field_dict(nse_symbol: str) -> dict:
    entries = await tier1_nse_bse.get_shareholding_pattern(nse_symbol)
    return {"entries": entries} if entries else {}


async def _screener_shareholding_as_field_dict(nse_symbol: str) -> dict:
    entries = await tier3.fetch_shareholding(nse_symbol)
    return {"entries": entries} if entries else {}


async def _upsert_financial_items(
    session: AsyncSession,
    company: CompanyORM,
    statement_type: StatementType,
    items: list[dict],
    source_tier: SourceTier,
) -> None:
    for item in items:
        period_end = item.get("period_end")
        if period_end is None:
            continue
        period_type = item["period_type"]
        stmt = (
            insert(FinancialLineItemORM)
            .values(
                company_id=company.id,
                statement_type=statement_type.value,
                period_type=period_type.value if hasattr(period_type, "value") else str(period_type),
                period_end=period_end,
                label=item["label"],
                value=item["value"],
                source_tier=source_tier.value,
            )
            .on_conflict_do_update(
                index_elements=["company_id", "statement_type", "period_type", "period_end", "label"],
                set_={
                    "value": item["value"],
                    "source_tier": source_tier.value,
                    "fetched_at": func.now(),
                },
            )
        )
        await session.execute(stmt)


async def get_financial_statement(
    session: AsyncSession, company: CompanyORM, statement_type: StatementType
) -> list[FinancialLineItemORM]:
    stmt = (
        select(FinancialLineItemORM)
        .where(
            FinancialLineItemORM.company_id == company.id,
            FinancialLineItemORM.statement_type == statement_type.value,
        )
        .order_by(FinancialLineItemORM.period_end.desc())
    )
    existing = list((await session.execute(stmt)).scalars())
    if existing and not _is_stale(existing[0].fetched_at, _settings.financials_cache_ttl_hours):
        return existing

    if not company.nse_symbol:
        return existing

    # Tier 1: the actual NSE/BSE results filing for the latest period. If it
    # yields anything, store it and skip the Screener scrape for this call —
    # older periods still come from Tier 3 on a later refresh.
    filing = await filing_discovery.discover_latest_financial_filing(
        company.nse_symbol, company.bse_code
    )
    tier1_items = (
        await filing_discovery.extract_tier1_line_items(filing, statement_type) if filing else []
    )
    if tier1_items:
        await _upsert_financial_items(
            session, company, statement_type, tier1_items, SourceTier.TIER1_NSE_BSE
        )
    else:
        scraped = await tier3.fetch_financial_statement(company.nse_symbol, statement_type)
        await _upsert_financial_items(
            session, company, statement_type, scraped, SourceTier.TIER3_SCREENER
        )
    await session.commit()

    stmt = (
        select(FinancialLineItemORM)
        .where(
            FinancialLineItemORM.company_id == company.id,
            FinancialLineItemORM.statement_type == statement_type.value,
        )
        .order_by(FinancialLineItemORM.period_end.desc())
    )
    return list((await session.execute(stmt)).scalars())


async def get_price_history(
    session: AsyncSession, company: CompanyORM, period: str = "1y"
) -> list[PriceHistoryPointORM]:
    stmt = (
        select(PriceHistoryPointORM)
        .where(PriceHistoryPointORM.company_id == company.id)
        .order_by(PriceHistoryPointORM.trade_date.desc())
    )
    existing = list((await session.execute(stmt)).scalars())
    if existing and not _is_stale(existing[0].fetched_at, _settings.prices_cache_ttl_hours):
        return existing

    points = await tier2_yfinance.get_price_history(company.nse_symbol, company.bse_code, period)
    exchange = "NSE" if company.nse_symbol else "BSE"
    for point in points:
        stmt = (
            insert(PriceHistoryPointORM)
            .values(
                company_id=company.id,
                exchange=exchange,
                trade_date=point["trade_date"],
                open=point["open"],
                high=point["high"],
                low=point["low"],
                close=point["close"],
                volume=point["volume"],
                source_tier=SourceTier.TIER2_YFINANCE.value,
            )
            .on_conflict_do_update(
                index_elements=["company_id", "exchange", "trade_date"],
                set_={"close": point["close"], "volume": point["volume"], "fetched_at": func.now()},
            )
        )
        await session.execute(stmt)
    await session.commit()

    stmt = (
        select(PriceHistoryPointORM)
        .where(PriceHistoryPointORM.company_id == company.id)
        .order_by(PriceHistoryPointORM.trade_date.desc())
    )
    return list((await session.execute(stmt)).scalars())


async def get_about(session: AsyncSession, company: CompanyORM) -> str | None:
    """Business description text. Backfilled once and cached indefinitely
    (not TTL-refreshed like ratios/prices) — a company's About paragraph
    doesn't change often enough to justify re-scraping it on a schedule."""
    if company.about is not None:
        return company.about

    if not company.nse_symbol:
        return None

    about = await tier3.fetch_about(company.nse_symbol)
    if about is not None:
        company.about = about
        session.add(company)
        await session.commit()
    return about


async def get_peers(session: AsyncSession, company: CompanyORM) -> list[PeerComparisonORM]:
    existing = await _latest_snapshot(
        session, PeerComparisonORM, company.id, PeerComparisonORM.market_cap.desc().nullslast()
    )
    most_recent_fetch = existing[0].fetched_at if existing else None
    if existing and not _is_stale(most_recent_fetch, _settings.ratios_cache_ttl_hours):
        return existing

    if not company.nse_symbol:
        return existing

    scraped = await tier3.fetch_peers(company.nse_symbol)
    today = datetime.now(UTC).date()
    for peer in scraped:
        stmt = (
            insert(PeerComparisonORM)
            .values(
                company_id=company.id,
                peer_symbol=peer["symbol"],
                peer_name=peer["name"],
                is_target=peer["is_target"],
                cmp=peer["cmp"],
                pe=peer["pe"],
                market_cap=peer["market_cap"],
                div_yield=peer["div_yield"],
                net_profit_qtr=peer["net_profit_qtr"],
                qtr_profit_var_pct=peer["qtr_profit_var_pct"],
                sales_qtr=peer["sales_qtr"],
                qtr_sales_var_pct=peer["qtr_sales_var_pct"],
                roce_pct=peer["roce_pct"],
                as_of=today,
                source_tier=SourceTier.TIER3_SCREENER.value,
            )
            .on_conflict_do_update(
                index_elements=["company_id", "peer_symbol", "as_of"],
                set_={
                    "cmp": peer["cmp"],
                    "pe": peer["pe"],
                    "market_cap": peer["market_cap"],
                    "div_yield": peer["div_yield"],
                    "net_profit_qtr": peer["net_profit_qtr"],
                    "qtr_profit_var_pct": peer["qtr_profit_var_pct"],
                    "sales_qtr": peer["sales_qtr"],
                    "qtr_sales_var_pct": peer["qtr_sales_var_pct"],
                    "roce_pct": peer["roce_pct"],
                    "fetched_at": func.now(),
                },
            )
        )
        await session.execute(stmt)
    await session.commit()

    return await _latest_snapshot(
        session, PeerComparisonORM, company.id, PeerComparisonORM.market_cap.desc().nullslast()
    )


async def get_documents(session: AsyncSession, company: CompanyORM) -> list[DocumentReferenceORM]:
    """Currently populates annual reports only (see module docstring) — the
    other DocumentType values have no ingestion path yet."""
    stmt = (
        select(DocumentReferenceORM)
        .where(DocumentReferenceORM.company_id == company.id)
        .order_by(DocumentReferenceORM.period_end.desc().nullslast())
    )
    existing = list((await session.execute(stmt)).scalars())
    if existing or not company.nse_symbol:
        return existing

    scraped = await tier3.fetch_annual_reports(company.nse_symbol)
    for report in scraped:
        stmt = (
            insert(DocumentReferenceORM)
            .values(
                company_id=company.id,
                document_type=DocumentType.ANNUAL_REPORT.value,
                title=report["title"],
                url=report["url"],
                period_end=report["period_end"],
                source_tier=SourceTier.TIER3_SCREENER.value,
            )
            .on_conflict_do_nothing(index_elements=["company_id", "url"])
        )
        await session.execute(stmt)
    await session.commit()

    stmt = (
        select(DocumentReferenceORM)
        .where(DocumentReferenceORM.company_id == company.id)
        .order_by(DocumentReferenceORM.period_end.desc().nullslast())
    )
    return list((await session.execute(stmt)).scalars())
