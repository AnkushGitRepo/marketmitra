from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.search_service import ensure_company_master_populated, search

router = APIRouter(prefix="/search", tags=["search"])


class SearchResultOut(BaseModel):
    type: str  # "company" | "index"
    symbol: str
    name: str
    sector: str | None = None
    series: str | None = None
    is_sme: bool = False


@router.get("", response_model=list[SearchResultOut])
async def search_symbols(
    q: str = Query(min_length=1, max_length=64),
    session: AsyncSession = Depends(get_db),
) -> list[SearchResultOut]:
    await ensure_company_master_populated(session)
    results = await search(session, q)
    return [SearchResultOut(**r) for r in results]
