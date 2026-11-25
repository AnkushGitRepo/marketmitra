"""Exchange announcements and Screener's pros/cons for a company (#365).

Sourced from Screener's Documents and Pros/Cons sections (see ADR 0011, docs/data-sources.md). Announcements carry a
rule-based `category` (credit_rating, litigation, auditor, pledge, management, ...), so a caller can ask for just the
legal or governance events. Pros and cons are Screener's own machine-generated checklist output: flags to look into,
not analysis.
"""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, resolve_company
from app.ingestion.announcements import ANNOUNCEMENT_CATEGORIES
from app.services import fundamentals_service as svc

router = APIRouter(prefix="/companies", tags=["announcements"])


class AnnouncementOut(BaseModel):
    announced_on: date | None
    title: str
    summary: str | None
    category: str
    url: str
    source_tier: str


class InsightOut(BaseModel):
    kind: Literal["pro", "con"]
    text: str
    source_tier: str


@router.get("/{symbol}/announcements", response_model=list[AnnouncementOut])
async def get_company_announcements(
    symbol: str,
    category: str | None = Query(default=None, max_length=32),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_db),
) -> list[AnnouncementOut]:
    """Recent exchange announcements and credit-rating links, newest first. `category` narrows the list."""
    company = await resolve_company(symbol, session)
    # Ask for the full window and filter here, so a category query still sees the older ones inside the window.
    rows = await svc.get_announcements(session, company, limit=200)
    if category is not None and category in ANNOUNCEMENT_CATEGORIES:
        rows = [r for r in rows if r.category == category]
    return [
        AnnouncementOut(
            announced_on=r.announced_on,
            title=r.title,
            summary=r.summary,
            category=r.category,
            url=r.url,
            source_tier=r.source_tier,
        )
        for r in rows[:limit]
    ]


@router.get("/{symbol}/insights", response_model=list[InsightOut])
async def get_company_insights(
    symbol: str, session: AsyncSession = Depends(get_db)
) -> list[InsightOut]:
    """Screener's machine-generated pros and cons for the company."""
    company = await resolve_company(symbol, session)
    rows = await svc.get_insights(session, company)
    return [InsightOut(kind=r.kind, text=r.text, source_tier=r.source_tier) for r in rows]
