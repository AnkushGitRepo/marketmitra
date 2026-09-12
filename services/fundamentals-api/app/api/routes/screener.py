from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import get_settings
from app.services import screener_service as svc

router = APIRouter(prefix="/screener", tags=["screener"])
_settings = get_settings()


class ScreenerMetricOut(BaseModel):
    symbol: str
    name: str
    sector: str | None
    industry: str | None
    market_cap: float | None
    current_price: float | None
    pe: float | None
    book_value: float | None
    pb: float | None
    dividend_yield: float | None
    roce: float | None
    roe: float | None
    face_value: float | None
    debt_to_equity: float | None
    sales_growth_3y_cagr: float | None
    profit_growth_3y_cagr: float | None
    fetch_status: str
    source_tier: str
    fetched_at: datetime


def _to_out(row) -> ScreenerMetricOut:
    def f(v: object) -> float | None:
        return float(v) if v is not None else None

    return ScreenerMetricOut(
        symbol=row.symbol,
        name=row.name,
        sector=row.sector,
        industry=row.industry,
        market_cap=f(row.market_cap),
        current_price=f(row.current_price),
        pe=f(row.pe),
        book_value=f(row.book_value),
        pb=f(row.pb),
        dividend_yield=f(row.dividend_yield),
        roce=f(row.roce),
        roe=f(row.roe),
        face_value=f(row.face_value),
        debt_to_equity=f(row.debt_to_equity),
        sales_growth_3y_cagr=f(row.sales_growth_3y_cagr),
        profit_growth_3y_cagr=f(row.profit_growth_3y_cagr),
        fetch_status=row.fetch_status,
        source_tier=row.source_tier,
        fetched_at=row.fetched_at,
    )


@router.get("/facets")
async def get_screener_facets(session: AsyncSession = Depends(get_db)) -> dict:
    """{ sectors: string[], industries: string[] } — populates the
    Screener page's sector dropdown from what's actually in the data,
    never a hand-maintained list."""
    return await svc.get_screener_facets(session)


@router.get("", response_model=list[ScreenerMetricOut])
async def get_screener_metrics(
    sector: str | None = Query(default=None),
    industry: str | None = Query(default=None),
    market_cap_min: float | None = Query(default=None),
    market_cap_max: float | None = Query(default=None),
    pe_min: float | None = Query(default=None),
    pe_max: float | None = Query(default=None),
    pb_min: float | None = Query(default=None),
    pb_max: float | None = Query(default=None),
    dividend_yield_min: float | None = Query(default=None),
    dividend_yield_max: float | None = Query(default=None),
    roce_min: float | None = Query(default=None),
    roce_max: float | None = Query(default=None),
    roe_min: float | None = Query(default=None),
    roe_max: float | None = Query(default=None),
    debt_to_equity_min: float | None = Query(default=None),
    debt_to_equity_max: float | None = Query(default=None),
    sales_growth_3y_cagr_min: float | None = Query(default=None),
    sales_growth_3y_cagr_max: float | None = Query(default=None),
    profit_growth_3y_cagr_min: float | None = Query(default=None),
    profit_growth_3y_cagr_max: float | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    session: AsyncSession = Depends(get_db),
) -> list[ScreenerMetricOut]:
    """Filter the bulk-refreshed screener_metrics table (ADR 0025) — every
    param is optional; omit all of them for the top companies by market
    cap. Rows whose last scrape failed are excluded (a failed scrape isn't
    "confirmed no data")."""
    filters = {
        "sector": sector,
        "industry": industry,
        "market_cap_min": market_cap_min, "market_cap_max": market_cap_max,
        "pe_min": pe_min, "pe_max": pe_max,
        "pb_min": pb_min, "pb_max": pb_max,
        "dividend_yield_min": dividend_yield_min, "dividend_yield_max": dividend_yield_max,
        "roce_min": roce_min, "roce_max": roce_max,
        "roe_min": roe_min, "roe_max": roe_max,
        "debt_to_equity_min": debt_to_equity_min, "debt_to_equity_max": debt_to_equity_max,
        "sales_growth_3y_cagr_min": sales_growth_3y_cagr_min,
        "sales_growth_3y_cagr_max": sales_growth_3y_cagr_max,
        "profit_growth_3y_cagr_min": profit_growth_3y_cagr_min,
        "profit_growth_3y_cagr_max": profit_growth_3y_cagr_max,
        "limit": limit,
    }
    rows = await svc.query_screener_metrics(session, filters)
    return [_to_out(r) for r in rows]


class IngestIn(BaseModel):
    rows: list[dict]


@router.post("/ingest")
async def ingest_screener_metrics(
    body: IngestIn,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Called only by scripts/refresh_screener_universe.py. Guarded by
    `screener_ingest_token` — refused (503) if that isn't configured, same
    shared-secret-bearer-token pattern as POST /ipos/ingest."""
    token = _settings.screener_ingest_token
    if not token:
        raise HTTPException(status_code=503, detail="screener_ingest_token not configured")
    if authorization != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="unauthorized")
    return await svc.ingest_screener_metrics(session, body.rows)
