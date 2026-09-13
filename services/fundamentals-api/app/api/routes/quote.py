from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.ingestion.quotes import get_quotes

router = APIRouter(prefix="/quote", tags=["quote"])


class QuoteOut(BaseModel):
    symbol: str
    price: str | None
    prev_close: str | None
    change_pct: str | None
    week52_high: str | None
    week52_low: str | None
    as_of: str
    source_tier: str


def _s(value: object) -> str | None:
    return None if value is None else str(value)


@router.get("", response_model=list[QuoteOut])
async def get_quote_batch(
    symbols: str = Query(
        ...,
        min_length=1,
        description="Comma-separated NSE symbols (a tracked index name also works), e.g. RELIANCE,TCS,NIFTY 50",
    ),
    session: AsyncSession = Depends(get_db),
) -> list[QuoteOut]:
    requested = [part for part in symbols.split(",") if part.strip()]
    if not requested:
        return []
    quotes = await get_quotes(requested, session)
    return [
        QuoteOut(
            symbol=q["symbol"],
            price=_s(q["price"]),
            prev_close=_s(q["prev_close"]),
            change_pct=_s(q["change_pct"]),
            week52_high=_s(q["week52_high"]),
            week52_low=_s(q["week52_low"]),
            as_of=q["as_of"],
            source_tier=q["source_tier"],
        )
        for q in quotes
    ]
