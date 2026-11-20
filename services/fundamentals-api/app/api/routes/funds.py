"""Mutual funds (ADR 0067): screener, detail, NAV history, peers, facets, plus
token-guarded ingest routes for the out-of-band refresh job."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Request
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import get_settings
from app.ingestion.mf_ter import TerRow
from app.security import require_bearer
from app.services import mf_ingest, mf_query
from app.services.mf_query import MAX_LIMIT, NAV_RANGES_DAYS, SORT_COLUMNS, FundFilters

router = APIRouter(prefix="/funds", tags=["funds"])
_settings = get_settings()

INT32_MAX = 2_147_483_647  # scheme_code is a Postgres integer
MAX_INGEST_BODY_BYTES = 2 * 1024 * 1024
SchemeCode = Annotated[int, Field(ge=1, le=INT32_MAX)]

Plan = Literal["direct", "regular"]
Option = Literal["growth", "idcw", "other"]
MAX_INGEST_ROWS = 2000
MAX_TER_ROWS = 5000  # the community file has ~2,200 rows; matching needs them all in one request


class FundSummary(BaseModel):
    scheme_code: int
    name: str
    base_name: str
    fund_house: str
    category: str
    sub_category: str | None
    plan: str
    option: str
    nav: float | None
    nav_date: date | None
    ret_1m: float | None
    ret_3m: float | None
    ret_6m: float | None
    ret_1y: float | None
    ret_3y: float | None
    ret_5y: float | None
    ret_10y: float | None
    std_dev_3y: float | None
    sharpe_3y: float | None
    sortino_3y: float | None
    max_drawdown_3y: float | None
    sip_xirr_3y: float | None
    sip_xirr_5y: float | None
    expense_ratio: float | None
    aum_cr: float | None


class FundListOut(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[FundSummary]


class FactsheetOut(BaseModel):
    expense_ratio: float | None
    aum_cr: float | None
    exit_load: str | None
    fund_manager: str | None
    benchmark: str | None
    launch_date: date | None
    as_of: date | None
    source: str


class FundDetailOut(FundSummary):
    scheme_type: str
    isin_growth: str | None
    isin_reinvest: str | None
    peer_group: str | None
    is_active: bool
    metrics_as_of: date | None
    factsheet: FactsheetOut | None


class NavPoint(BaseModel):
    date: date
    nav: float


class FacetsOut(BaseModel):
    categories: list[str]
    sub_categories: dict[str, list[str]]
    fund_houses: list[str]
    nav_as_of: date | None


@router.get("/facets", response_model=FacetsOut)
async def get_facets(session: AsyncSession = Depends(get_db)) -> FacetsOut:
    return FacetsOut(**await mf_query.get_facets(session))


@router.get("", response_model=FundListOut)
async def list_funds(
    q: str | None = Query(default=None, max_length=80),
    category: str | None = Query(default=None, max_length=32),
    sub_category: str | None = Query(default=None, max_length=96),
    fund_house: str | None = Query(default=None, max_length=160),
    plan: Plan | None = "direct",
    option: Option | None = "growth",
    min_ret_1y: float | None = Query(default=None, ge=-100, le=1000),
    min_ret_3y: float | None = Query(default=None, ge=-100, le=1000),
    min_ret_5y: float | None = Query(default=None, ge=-100, le=1000),
    max_expense_ratio: float | None = Query(default=None, ge=0, le=10),
    min_aum_cr: float | None = Query(default=None, ge=0),
    max_std_dev_3y: float | None = Query(default=None, ge=0, le=500),
    max_fall_3y: float | None = Query(default=None, ge=0, le=100),
    min_sharpe_3y: float | None = Query(default=None, ge=-20, le=20),
    sort: str = "ret_3y",
    order: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=50, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0, le=100_000),
    session: AsyncSession = Depends(get_db),
) -> FundListOut:
    if sort not in SORT_COLUMNS:
        raise HTTPException(status_code=422, detail=f"sort must be one of {sorted(SORT_COLUMNS)}")
    filters = FundFilters(
        q=q, category=category, sub_category=sub_category, fund_house=fund_house,
        plan=plan, option=option, min_ret_1y=min_ret_1y, min_ret_3y=min_ret_3y,
        min_ret_5y=min_ret_5y, max_expense_ratio=max_expense_ratio, min_aum_cr=min_aum_cr,
        max_std_dev_3y=max_std_dev_3y, max_fall_3y=max_fall_3y, min_sharpe_3y=min_sharpe_3y,
        sort=sort, order=order, limit=limit, offset=offset,
    )
    return FundListOut(**await mf_query.list_funds(session, filters))


@router.get("/{scheme_code}", response_model=FundDetailOut)
async def get_fund(scheme_code: Annotated[int, Path(ge=1, le=INT32_MAX)], session: AsyncSession = Depends(get_db)) -> FundDetailOut:
    fund = await mf_query.get_fund(session, scheme_code)
    if fund is None:
        raise HTTPException(status_code=404, detail="fund not found")
    return FundDetailOut(**fund)


@router.get("/{scheme_code}/nav", response_model=list[NavPoint])
async def get_nav(
    scheme_code: Annotated[int, Path(ge=1, le=INT32_MAX)],
    range: str = Query(default="1y", pattern=f"^({'|'.join(NAV_RANGES_DAYS)})$"),
    session: AsyncSession = Depends(get_db),
) -> list[NavPoint]:
    return [NavPoint(**p) for p in await mf_query.get_nav_history(session, scheme_code, range)]


@router.get("/{scheme_code}/peers", response_model=list[FundSummary])
async def get_peers(
    scheme_code: Annotated[int, Path(ge=1, le=INT32_MAX)],
    limit: int = Query(default=8, ge=1, le=20),
    session: AsyncSession = Depends(get_db),
) -> list[FundSummary]:
    return [FundSummary(**p) for p in await mf_query.get_peers(session, scheme_code, limit)]


# ---- ingest (token-guarded; driven by scripts/refresh_funds.py) -------------

def _guard(authorization: str | None) -> None:
    require_bearer(authorization, _settings.mf_ingest_token, name="mf_ingest_token")


def ingest_gate(request: Request) -> ORJSONResponse | None:
    """Pre-body check for /funds/ingest/*: authenticate, then cap the size, using
    headers only, so a stranger cannot make the service parse a large body or
    read validation errors. Returns a response to short-circuit, or None.
    The handlers still call `_guard` (defence in depth)."""
    try:
        _guard(request.headers.get("authorization"))
    except HTTPException as exc:
        return ORJSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    try:
        length = int(request.headers.get("content-length") or 0)
    except ValueError:
        length = MAX_INGEST_BODY_BYTES + 1
    if length > MAX_INGEST_BODY_BYTES:
        return ORJSONResponse({"detail": "body too large"}, status_code=413)
    return None


class SchemeIn(BaseModel):
    scheme_code: SchemeCode
    name: str = Field(max_length=300)
    base_name: str = Field(max_length=300)
    fund_house: str = Field(max_length=160)
    scheme_type: str = Field(max_length=16)
    category: str = Field(max_length=32)
    sub_category: str | None = Field(default=None, max_length=96)
    plan: Plan
    option: Option
    isin_growth: str | None = Field(default=None, max_length=12)
    isin_reinvest: str | None = Field(default=None, max_length=12)
    latest_nav: float | None = Field(default=None, gt=0)
    latest_nav_date: date | None = None


class SchemesIngestIn(BaseModel):
    rows: list[SchemeIn] = Field(max_length=MAX_INGEST_ROWS)
    # Newest NAV date in the whole file; activity is judged against it, not the batch.
    as_of: date | None = None


class NavIngestIn(BaseModel):
    scheme_code: SchemeCode
    points: list[tuple[date, float]] = Field(max_length=20_000)


class MetricsIngestIn(BaseModel):
    scheme_codes: list[SchemeCode] = Field(max_length=200)


class FactsheetIn(BaseModel):
    scheme_code: SchemeCode
    expense_ratio: float | None = Field(default=None, ge=0, le=10)
    aum_cr: float | None = Field(default=None, ge=0)
    exit_load: str | None = Field(default=None, max_length=300)
    fund_manager: str | None = Field(default=None, max_length=300)
    benchmark: str | None = Field(default=None, max_length=200)
    launch_date: date | None = None
    as_of: date | None = None
    source: str = Field(max_length=64)


class FactsheetIngestIn(BaseModel):
    rows: list[FactsheetIn] = Field(max_length=MAX_INGEST_ROWS)


@router.get("/ingest/backfill-queue")
async def backfill_queue(
    limit: int = Query(default=50, ge=1, le=500),
    category: str | None = Query(default=None, max_length=32),
    after: int = Query(default=0, ge=0, le=INT32_MAX),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db),
) -> dict:
    _guard(authorization)
    return {"scheme_codes": await mf_ingest.backfill_queue(session, limit, category=category, after=after)}


@router.get("/ingest/metrics-queue")
async def metrics_queue(
    after: int = Query(default=0, ge=0, le=INT32_MAX),
    limit: int = Query(default=100, ge=1, le=200),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db),
) -> dict:
    _guard(authorization)
    return {"scheme_codes": await mf_ingest.metrics_queue(session, after, limit)}


class TerRowIn(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    regular: float | None = Field(default=None, gt=0, le=10)
    direct: float | None = Field(default=None, gt=0, le=10)


class TerIngestIn(BaseModel):
    rows: list[TerRowIn] = Field(max_length=MAX_TER_ROWS)
    # When the community tracker last updated its file; shown beside the figure.
    as_of: date


@router.post("/ingest/ter")
async def ingest_ter(
    body: TerIngestIn,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db),
) -> dict:
    _guard(authorization)
    result = await mf_ingest.ingest_ter(
        session, [TerRow(r.name, r.regular, r.direct) for r in body.rows], body.as_of
    )
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])
    return result


@router.post("/ingest/schemes")
async def ingest_schemes(
    body: SchemesIngestIn,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db),
) -> dict:
    _guard(authorization)
    return await mf_ingest.ingest_schemes(
        session, [r.model_dump() for r in body.rows], as_of=body.as_of
    )


@router.post("/ingest/nav")
async def ingest_nav(
    body: NavIngestIn,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db),
) -> dict:
    _guard(authorization)
    points = [[d.isoformat(), n] for d, n in body.points]
    return await mf_ingest.ingest_nav(session, body.scheme_code, points)


@router.post("/ingest/metrics")
async def ingest_metrics(
    body: MetricsIngestIn,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db),
) -> dict:
    _guard(authorization)
    return await mf_ingest.recompute_metrics(session, body.scheme_codes)


@router.post("/ingest/factsheet")
async def ingest_factsheet(
    body: FactsheetIngestIn,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db),
) -> dict:
    _guard(authorization)
    return await mf_ingest.ingest_factsheet(session, [r.model_dump() for r in body.rows])
