from datetime import date, datetime

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import get_settings
from app.security import require_bearer
from app.services import ipo_service as svc

router = APIRouter(prefix="/ipos", tags=["ipos"])
_settings = get_settings()


class IpoOut(BaseModel):
    slug: str
    name: str
    source_url: str | None
    category: str  # mainboard | sme
    status: str  # upcoming | open | closed | listed
    price: float | None
    ipo_size_cr: float | None
    lot_size: int | None
    rating: int | None
    subscription_times: float | None
    anchor: bool | None
    # GMP: unofficial grey-market estimate from a third-party tracker — not
    # from any exchange, not a prediction.
    gmp: float | None
    gmp_pct: float | None
    gmp_low: float | None
    gmp_high: float | None
    gmp_updated_at: datetime | None
    open_date: date | None
    close_date: date | None
    allotment_date: date | None
    listing_date: date | None
    source_tier: str
    fetched_at: datetime


@router.get("", response_model=list[IpoOut])
async def get_ipos(
    status: str | None = Query(default=None, pattern="^(upcoming|open|closed|listed)$"),
    session: AsyncSession = Depends(get_db),
) -> list[IpoOut]:
    rows = await svc.get_ipos(session, status=status)
    return [IpoOut(**r) for r in rows]


class IngestIn(BaseModel):
    rows: list[dict]


@router.post("/ingest")
async def ingest_ipos(
    body: IngestIn,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Called by the out-of-band headless-browser refresh job. Guarded by
    `ipo_ingest_token` — refused (503) if that isn't configured."""
    require_bearer(authorization, _settings.ipo_ingest_token, name="ipo_ingest_token")
    return await svc.ingest_ipos(session, body.rows)
