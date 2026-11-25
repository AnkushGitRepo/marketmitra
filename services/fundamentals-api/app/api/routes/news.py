from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services import news_service as svc

router = APIRouter(prefix="/news", tags=["news"])


class NewsItemOut(BaseModel):
    url: str
    title: str
    summary: str | None
    source: str
    published_at: datetime
    sentiment: str  # positive | neutral | negative (headline tone, not a signal)
    sentiment_score: float
    symbols: list[str]


class NewsPageOut(BaseModel):
    items: list[NewsItemOut]
    next_cursor: str | None


@router.get("", response_model=NewsPageOut)
async def get_news(
    symbols: str | None = Query(
        default=None, description="Comma-separated NSE symbols; omit for the global feed"
    ),
    limit: int = Query(default=20, ge=1, le=50),
    cursor: str | None = Query(default=None),
    include_regulatory: bool = Query(
        default=False,
        description="Also return regulator notices (RBI, TRAI, SEBI); the news page leaves them out",
    ),
    session: AsyncSession = Depends(get_db),
) -> NewsPageOut:
    symbol_list = [s for s in (symbols or "").split(",") if s.strip()] or None
    page = await svc.get_news(
        session, symbols=symbol_list, limit=limit, cursor=cursor, include_regulatory=include_regulatory
    )
    return NewsPageOut(
        items=[NewsItemOut(**item) for item in page["items"]],
        next_cursor=page["next_cursor"],
    )
