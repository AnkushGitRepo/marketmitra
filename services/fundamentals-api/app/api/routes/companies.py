from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, resolve_company
from app.db.models import CompanyMasterORM
from app.services import fundamentals_service as svc
from app.services.search_service import ensure_company_master_populated

router = APIRouter(prefix="/companies", tags=["companies"])


class CompanyMasterOut(BaseModel):
    symbol: str
    name: str


@router.get("/master", response_model=list[CompanyMasterOut])
async def get_company_master(session: AsyncSession = Depends(get_db)) -> list[CompanyMasterOut]:
    """The full NSE-listed-equity symbol/name list (~2,570 rows) — used by
    scripts/refresh_screener_universe.py (ADR 0025) as its universe source,
    instead of that script re-fetching NSE's EQUITY_L.csv a second time
    independently. Registered before GET /{symbol} below so "master" is
    never swallowed as a symbol path param."""
    await ensure_company_master_populated(session)
    rows = (await session.execute(select(CompanyMasterORM).order_by(CompanyMasterORM.symbol))).scalars()
    return [CompanyMasterOut(symbol=r.symbol, name=r.name) for r in rows]


class CompanyOut(BaseModel):
    symbol: str
    name: str
    industry: str | None
    sector: str | None
    about: str | None
    source_tier: str | None


class RatioOut(BaseModel):
    name: str
    value: str | None
    unit: str | None
    as_of: date
    source_tier: str


class ShareholdingOut(BaseModel):
    category: str
    percentage: str
    quarter_end: date
    source_tier: str


class PeerOut(BaseModel):
    symbol: str
    name: str
    is_target: bool
    cmp: str | None
    pe: str | None
    market_cap: str | None
    div_yield: str | None
    net_profit_qtr: str | None
    qtr_profit_var_pct: str | None
    sales_qtr: str | None
    qtr_sales_var_pct: str | None
    roce_pct: str | None
    as_of: date
    source_tier: str


@router.get("/{symbol}", response_model=CompanyOut)
async def get_company(symbol: str, session: AsyncSession = Depends(get_db)) -> CompanyOut:
    company = await resolve_company(symbol, session)
    about = await svc.get_about(session, company)
    return CompanyOut(
        symbol=company.nse_symbol or company.bse_code or symbol,
        name=company.name,
        industry=company.industry,
        sector=company.sector,
        about=about,
        source_tier=company.source_tier,
    )


@router.get("/{symbol}/peers", response_model=list[PeerOut])
async def get_company_peers(symbol: str, session: AsyncSession = Depends(get_db)) -> list[PeerOut]:
    company = await resolve_company(symbol, session)
    peers = await svc.get_peers(session, company)
    return [
        PeerOut(
            symbol=p.peer_symbol,
            name=p.peer_name,
            is_target=p.is_target,
            cmp=str(p.cmp) if p.cmp is not None else None,
            pe=str(p.pe) if p.pe is not None else None,
            market_cap=str(p.market_cap) if p.market_cap is not None else None,
            div_yield=str(p.div_yield) if p.div_yield is not None else None,
            net_profit_qtr=str(p.net_profit_qtr) if p.net_profit_qtr is not None else None,
            qtr_profit_var_pct=str(p.qtr_profit_var_pct) if p.qtr_profit_var_pct is not None else None,
            sales_qtr=str(p.sales_qtr) if p.sales_qtr is not None else None,
            qtr_sales_var_pct=str(p.qtr_sales_var_pct) if p.qtr_sales_var_pct is not None else None,
            roce_pct=str(p.roce_pct) if p.roce_pct is not None else None,
            as_of=p.as_of,
            source_tier=p.source_tier,
        )
        for p in peers
    ]


@router.get("/{symbol}/ratios", response_model=list[RatioOut])
async def get_company_ratios(symbol: str, session: AsyncSession = Depends(get_db)) -> list[RatioOut]:
    company = await resolve_company(symbol, session)
    ratios = await svc.get_ratios(session, company)
    return [
        RatioOut(
            name=r.name,
            value=str(r.value) if r.value is not None else None,
            unit=r.unit,
            as_of=r.as_of,
            source_tier=r.source_tier,
        )
        for r in ratios
    ]


@router.get("/{symbol}/shareholding", response_model=list[ShareholdingOut])
async def get_company_shareholding(
    symbol: str, session: AsyncSession = Depends(get_db)
) -> list[ShareholdingOut]:
    company = await resolve_company(symbol, session)
    entries = await svc.get_shareholding(session, company)
    return [
        ShareholdingOut(
            category=e.category,
            percentage=str(e.percentage),
            quarter_end=e.quarter_end,
            source_tier=e.source_tier,
        )
        for e in entries
    ]
